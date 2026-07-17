"""
Model → DTO mappers.

Pure conversion: they read attributes off already-fetched model instances and
return frozen DTOs. They perform NO queries themselves (repositories pre-fetch the
relations). This is the boundary that guarantees no Django model leaves the
application layer.
"""
from django.core.exceptions import ObjectDoesNotExist

from domain import dtos


def _safe_related_id(obj, attr):
    """str(id) of a (possibly absent) reverse-one-to-one relation, else None."""
    try:
        rel = getattr(obj, attr)
    except ObjectDoesNotExist:
        return None
    return str(rel.id) if rel is not None else None


# ── accounts ──────────────────────────────────────────────────────────────────
def user_profile(user, student=None, instructor=None) -> dtos.UserProfileResult:
    return dtos.UserProfileResult(
        id=str(user.id),
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        status=user.status,
        level=getattr(student, "level", None) if student else None,
        goal_id=str(student.goal_id) if student and student.goal_id else None,
        payment_status=getattr(student, "payment_status", None) if student else None,
        sessions_remaining=getattr(student, "sessions_remaining", None) if student else None,
        rating=float(instructor.rating) if instructor else None,
        headline=getattr(instructor, "headline", None) if instructor else None,
    )


def instructor_profile(instructor) -> dtos.InstructorProfileResult:
    u = instructor.user
    return dtos.InstructorProfileResult(
        id=str(instructor.id),
        full_name=u.full_name,
        email=u.email,
        headline=instructor.headline or "",
        bio=instructor.bio or "",
        country=instructor.country or "",
        specialty=instructor.specialty or "",
        languages=list(instructor.languages or []),
        interests=list(instructor.interests or []),
        years_experience=instructor.years_experience or 0,
        avatar_url=instructor.avatar_url or "",
        intro_video_url=instructor.intro_video_url or "",
        rating=float(instructor.rating),
        sessions_hosted=instructor.sessions_hosted,
    )


# ── onboarding ────────────────────────────────────────────────────────────────
def goal_option(goal) -> dtos.GoalOptionResult:
    return dtos.GoalOptionResult(
        id=str(goal.id),
        code=goal.code,
        label=goal.label,
        description=goal.description,
        icon=goal.icon,
        accent=goal.accent,
    )


def placement_question(q) -> dtos.PlacementQuestionResult:
    # correct_index is deliberately NOT mapped.
    return dtos.PlacementQuestionResult(
        id=str(q.id), prompt=q.prompt, options=q.options, skill=q.skill
    )


def placement_result_detail(r) -> dtos.PlacementResultDetail:
    return dtos.PlacementResultDetail(
        id=str(r.id),
        level=r.level,
        level_label=r.level_label,
        summary=r.summary,
        skills=r.skills,
    )


# ── billing ───────────────────────────────────────────────────────────────────
def plan_result(p) -> dtos.PlanResult:
    return dtos.PlanResult(
        id=str(p.id),
        code=p.code,
        name=p.name,
        emoji=p.emoji,
        price=p.price,
        currency=p.currency,
        cadence=p.cadence,
        description=p.description,
        sessions_per_month=p.sessions_per_month,
        features=p.features,
        recommended=p.recommended,
    )


def subscription_detail(s) -> dtos.SubscriptionDetailResult:
    return dtos.SubscriptionDetailResult(
        id=str(s.id),
        plan_id=str(s.plan_id),
        plan_name=s.plan.name,
        status=s.status,
        started_at=s.started_at,
        expires_at=s.expires_at,
        sessions_remaining=s.sessions_remaining,
    )


def payment_proof_detail(p, *, receipt_url=None, include_student=False) -> dtos.PaymentProofDetailResult:
    return dtos.PaymentProofDetailResult(
        id=str(p.id),
        plan_name=p.plan_name,
        amount=p.amount,
        currency=p.currency,
        transaction_number=p.transaction_number,
        transfer_datetime=p.transfer_datetime,
        receipt_name=p.receipt_name,
        status=p.status,
        submitted_at=p.submitted_at,
        retain_until=p.retain_until,
        sender_name=p.sender_name,
        receiver_name=p.receiver_name,
        reviewed_at=p.reviewed_at,
        review_note=p.review_note,
        receipt_url=receipt_url,
        student_id=str(p.student_id) if include_student else None,
        student_name=p.student.user.full_name if include_student else None,
    )


def billing_history_item(p, *, receipt_url=None) -> dtos.BillingHistoryItemResult:
    return dtos.BillingHistoryItemResult(
        id=str(p.id),
        plan_name=p.plan_name,
        amount=p.amount,
        currency=p.currency,
        status=p.status,
        submitted_at=p.submitted_at,
        receipt_url=receipt_url,
    )


def payment_approval_item(p) -> dtos.PaymentApprovalItemResult:
    return dtos.PaymentApprovalItemResult(
        id=str(p.id),
        student_name=p.student.user.full_name,
        plan_name=p.plan_name,
        amount=p.amount,
        currency=p.currency,
        status=p.status,
        submitted_at=p.submitted_at,
    )


# ── scheduling ────────────────────────────────────────────────────────────────
def availability_slot(s) -> dtos.AvailabilitySlotResult:
    return dtos.AvailabilitySlotResult(
        id=str(s.id),
        instructor_id=str(s.instructor_id),
        start_at=s.start_at,
        duration_minutes=s.duration_minutes,
        status=s.status,
    )


def question_full(q) -> dtos.QuestionFullResult:
    return dtos.QuestionFullResult(
        id=str(q.id), text=q.text, ai_assisted=q.ai_assisted, approved=q.approved
    )


def _subtopics(topic):
    return [
        {"id": str(st.id), "title": st.title, "ai_generated": st.ai_generated}
        for st in topic.subtopics.all()
    ]


def topic_preview(topic) -> dtos.TopicPreviewResult:
    return dtos.TopicPreviewResult(
        id=str(topic.id),
        title=topic.title,
        category=topic.category,
        level=topic.level,
        description=topic.description,
        instructor_id=str(topic.instructor_id),
        instructor_name=topic.instructor.user.full_name,
        instructor_headline=topic.instructor.headline,
        sample_prompts=[dtos.QuestionPreviewResult(text=p) for p in topic.sample_prompts],
        subtopics=_subtopics(topic),
    )


def topic_full(topic, questions) -> dtos.TopicFullResult:
    return dtos.TopicFullResult(
        id=str(topic.id),
        title=topic.title,
        category=topic.category,
        level=topic.level,
        description=topic.description,
        instructor_id=str(topic.instructor_id),
        instructor_name=topic.instructor.user.full_name,
        instructor_headline=topic.instructor.headline,
        subtopics=_subtopics(topic),
        questions=[question_full(q) for q in questions],
        vocabulary=topic.vocabulary,
        sample_prompts=[dtos.QuestionPreviewResult(text=p) for p in topic.sample_prompts],
    )


def booking_list_item(b) -> dtos.BookingListItemResult:
    return dtos.BookingListItemResult(
        id=str(b.id),
        topic_title=b.topic_title,
        instructor_name=b.instructor_name,
        scheduled_at=b.scheduled_at,
        duration_minutes=b.duration_minutes,
        status=b.status,
        report_id=_safe_related_id(b, "report"),
    )


def group_session(gs, *, student_id) -> dtos.GroupSessionResult:
    attendees = list(gs.attendees.all())  # prefetched
    seats_taken = len(attendees)
    joined = any(a.student_id == student_id for a in attendees)
    names = [a.student.user.full_name.split()[0] for a in attendees if a.student.user.full_name]
    return dtos.GroupSessionResult(
        id=str(gs.id),
        title=gs.title,
        description=gs.description or "",
        instructor_name=gs.instructor_name,
        level=gs.level,
        start_at=gs.start_at,
        duration_minutes=gs.duration_minutes,
        capacity=gs.capacity,
        seats_taken=seats_taken,
        seats_left=max(0, gs.capacity - seats_taken),
        joined=joined,
        attendees=names,
        status=gs.status,
    )


def booking_detail(b) -> dtos.BookingDetailResult:
    return dtos.BookingDetailResult(
        id=str(b.id),
        topic_id=str(b.topic_id),
        topic_title=b.topic_title,
        instructor_id=str(b.instructor_id),
        instructor_name=b.instructor_name,
        scheduled_at=b.scheduled_at,
        duration_minutes=b.duration_minutes,
        status=b.status,
        credit_refunded=b.credit_refunded,
        cancelled_at=b.cancelled_at,
        session_id=_safe_related_id(b, "session"),
        report_id=_safe_related_id(b, "report"),
    )


def admin_booking_item(b) -> dtos.AdminBookingItemResult:
    return dtos.AdminBookingItemResult(
        id=str(b.id),
        student_id=str(b.student_id),
        student_name=b.student.user.full_name,
        topic_title=b.topic_title,
        instructor_name=b.instructor_name,
        scheduled_at=b.scheduled_at,
        duration_minutes=b.duration_minutes,
        status=b.status,
        credit_refunded=b.credit_refunded,
    )


# ── sessions ──────────────────────────────────────────────────────────────────
def session_detail(session, questions) -> dtos.SessionDetailResult:
    booking = session.booking
    return dtos.SessionDetailResult(
        id=str(session.id),
        booking_id=str(session.booking_id),
        topic_title=booking.topic_title,
        status=session.status,
        scheduled_at=booking.scheduled_at,
        started_at=session.started_at,
        ended_at=session.ended_at,
        questions=[question_full(q) for q in questions],
        vocabulary=booking.topic.vocabulary,
        student_notes=session.student_notes,
    )


def transcript_result(t) -> dtos.TranscriptResult:
    return dtos.TranscriptResult(
        transcript_id=str(t.id), session_id=str(t.session_id), source=t.source
    )


# ── ai reports ────────────────────────────────────────────────────────────────
def ai_report_detail(report, *, vocabulary=None) -> dtos.AIReportDetailResult:
    return dtos.AIReportDetailResult(
        id=str(report.id),
        session_id=str(report.session_id),
        booking_id=str(report.booking_id),
        topic_title=report.topic_title,
        instructor_name=report.instructor_name,
        session_date=report.session_date,
        duration_minutes=report.duration_minutes,
        status=report.status,
        overall_score=report.overall_score,
        skills=report.skills,
        mistakes=report.mistakes,
        recommendations=report.recommendations,
        vocabulary=vocabulary or [],
        instructor_note=report.instructor_note,
        content=report.content,  # validated 11-field report (or None while pending)
    )


# ── notifications ─────────────────────────────────────────────────────────────
def notification(n) -> dtos.NotificationResult:
    return dtos.NotificationResult(
        id=str(n.id),
        type=n.type,
        title=n.title,
        read=n.read,
        created_at=n.created_at,
        body=n.body,
        data=n.data,
    )
