"""Phase 6C command use-case tests (application layer)."""
import pytest
from django.utils import timezone

from apps.common.enums import (
    PaymentProofStatus,
    PaymentStatus,
    SlotStatus,
    UserRole,
)
from apps.common.factories import (
    make_active_subscription,
    make_instructor,
    make_notification,
    make_plan,
    make_session,
    make_slot,
    make_student,
    make_topic,
)
from apps.accounts.models import User
from apps.scheduling.models import AvailabilitySlot, Question
from application.accounts.use_cases import (
    RegisterStudentUseCase,
    UpdateCurrentProfileUseCase,
)
from application.billing.use_cases import SubmitPaymentProofUseCase
from application.instructor.use_cases import (
    AddManualQuestionUseCase,
    ApproveAIQuestionUseCase,
    CreateTopicUseCase,
    PublishTopicUseCase,
    SetAvailabilityUseCase,
)
from application.notifications.use_cases import MarkNotificationReadUseCase
from domain.dtos import PaymentProofDetailResult
from domain.exceptions import (
    DuplicateTransactionNumber,
    EmailAlreadyRegistered,
    InvalidStateTransition,
    PermissionDenied,
)
from infrastructure.gateways.events import InMemoryEventBus

pytestmark = pytest.mark.django_db


# ── accounts ──────────────────────────────────────────────────────────────────
def test_register_student_creates_user_and_profile():
    bus = InMemoryEventBus()
    dto = RegisterStudentUseCase(events=bus).execute(
        full_name="New Learner", email="New.Learner@Example.com", password="pw-secret-123"
    )
    assert dto.role == UserRole.STUDENT
    user = User.objects.get(email="new.learner@example.com")  # normalized
    assert hasattr(user, "student_profile")
    assert len(bus.events) == 1


def test_register_rejects_duplicate_email():
    make_student(email="dupe@example.com")
    with pytest.raises(EmailAlreadyRegistered):
        RegisterStudentUseCase().execute(
            full_name="X", email="dupe@example.com", password="pw-secret-123"
        )


def test_update_current_profile_changes_name():
    student = make_student()
    dto = UpdateCurrentProfileUseCase().execute(actor=student.user, full_name="Renamed")
    assert dto.full_name == "Renamed"
    student.user.refresh_from_db()
    assert student.user.full_name == "Renamed"


# ── billing: submit payment proof ─────────────────────────────────────────────
def _submit(student, plan, *, transaction_number="TRX-AAA"):
    return SubmitPaymentProofUseCase().execute(
        actor=student.user,
        plan_id=plan.id,
        transaction_number=transaction_number,
        transfer_datetime=timezone.now(),
        amount=plan.price,
        receipt_filename="receipt.jpg",
        receipt_content_type="image/jpeg",
        receipt_data=b"fake-bytes",
        sender_name="Payer",
    )


def test_submit_payment_proof_starts_pending_review_and_stores_receipt():
    student = make_student()
    plan = make_plan()
    dto = _submit(student, plan)
    assert isinstance(dto, PaymentProofDetailResult)
    assert dto.status == PaymentProofStatus.PENDING  # "pending_review"
    assert dto.status == "pending_review"
    assert dto.receipt_url  # stored via the file storage gateway
    assert dto.retain_until is not None  # submitted_at + 5y
    student.refresh_from_db()
    assert student.payment_status == PaymentStatus.PENDING


def test_submit_payment_proof_rejects_duplicate_transaction_number():
    student = make_student()
    plan = make_plan()
    _submit(student, plan, transaction_number="TRX-DUP")
    with pytest.raises(DuplicateTransactionNumber):
        _submit(make_student(), plan, transaction_number="TRX-DUP")


def test_submit_payment_proof_never_auto_approves():
    student = make_student()
    plan = make_plan()
    dto = _submit(student, plan)
    # raw OCR present must not change the manual-review outcome.
    assert dto.status == "pending_review"


# ── instructor authoring ──────────────────────────────────────────────────────
def test_create_topic_is_owned_and_unpublished():
    instructor = make_instructor()
    dto = CreateTopicUseCase().execute(
        actor=instructor.user, title="My Topic", category="Career", level="B1"
    )
    assert dto.instructor_id == str(instructor.id)
    assert dto.mode == "full"


def test_add_manual_question_is_approved_and_approve_ai_flips_draft():
    instructor = make_instructor()
    topic = make_topic(instructor, with_approved_question=False, with_unapproved_question=True)

    manual = AddManualQuestionUseCase().execute(
        actor=instructor.user, topic_id=topic.id, text="Tell me about yourself."
    )
    assert manual.approved is True

    draft = Question.objects.get(topic=topic, approved=False)
    approved = ApproveAIQuestionUseCase().execute(actor=instructor.user, question_id=draft.id)
    assert approved.approved is True


def test_instructor_cannot_author_on_another_instructors_topic():
    owner = make_instructor()
    other = make_instructor()
    topic = make_topic(owner)
    with pytest.raises(PermissionDenied):
        AddManualQuestionUseCase().execute(actor=other.user, topic_id=topic.id, text="x")


def test_publish_requires_approved_question():
    instructor = make_instructor()
    topic = make_topic(instructor, with_approved_question=False, with_unapproved_question=False)
    with pytest.raises(InvalidStateTransition):
        PublishTopicUseCase().execute(actor=instructor.user, topic_id=topic.id)

    AddManualQuestionUseCase().execute(actor=instructor.user, topic_id=topic.id, text="Q?")
    dto = PublishTopicUseCase().execute(actor=instructor.user, topic_id=topic.id)
    assert dto.mode == "full"


# ── instructor availability ───────────────────────────────────────────────────
def test_set_availability_creates_and_prunes_open_slots():
    instructor = make_instructor()
    t1 = timezone.now() + timezone.timedelta(days=1)
    t2 = timezone.now() + timezone.timedelta(days=2)

    SetAvailabilityUseCase().execute(
        actor=instructor.user, slots=[{"start_at": t1}, {"start_at": t2}]
    )
    assert AvailabilitySlot.objects.filter(instructor=instructor).count() == 2

    # Re-set with only t1 → t2 (open) is pruned.
    result = SetAvailabilityUseCase().execute(actor=instructor.user, slots=[{"start_at": t1}])
    assert len(result) == 1
    assert AvailabilitySlot.objects.filter(instructor=instructor, status=SlotStatus.OPEN).count() == 1


def test_set_availability_keeps_booked_slots():
    instructor = make_instructor()
    student = make_student()
    make_active_subscription(student, make_plan(), sessions=4)
    topic = make_topic(instructor)
    slot = make_slot(instructor, days_ahead=3)
    from apps.scheduling.services import create_booking

    create_booking(student, topic, slot)  # slot now BOOKED

    # Set availability to an empty set — the booked slot must survive.
    SetAvailabilityUseCase().execute(actor=instructor.user, slots=[])
    slot.refresh_from_db()
    assert slot.status == SlotStatus.BOOKED


# ── notifications ─────────────────────────────────────────────────────────────
def test_mark_notification_read_owner_only():
    student = make_student()
    note = make_notification(student.user)
    dto = MarkNotificationReadUseCase().execute(actor=student.user, notification_id=note.id)
    assert dto.read is True

    intruder = make_student()
    other = make_notification(intruder.user)
    with pytest.raises(PermissionDenied):
        MarkNotificationReadUseCase().execute(actor=student.user, notification_id=other.id)
