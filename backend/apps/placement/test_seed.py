"""
Pins the FIXED written placement content produced by `seed_placement`.

The 5 written questions are OneClub-owned, multiple-choice, and never
AI-generated. Their options are visible; their correct answers stay server-side.
"""
import pytest
from django.core.management import call_command

from apps.common.factories import make_student
from apps.placement.models import PlacementQuestion
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

EXPECTED_WRITTEN = [
    ("She ___ to school every day.", ["go", "goes", "went", "gone"], "goes"),
    ("I ___ 20 years old.", ["is", "am", "are", "were"], "am"),
    ("We ___ from Sudan.", ["come", "came", "be", "were"], "come"),
    ("How old ___ you?", ["is", "have", "has", "are"], "are"),
    ("They ___ football yesterday.", ["play", "playing", "player", "played"], "played"),
]


def test_seed_creates_the_five_fixed_written_mcqs():
    call_command("seed_placement")
    written = list(
        PlacementQuestion.objects.filter(question_type="written").order_by("order")
    )
    assert len(written) == 5
    for q, (prompt, options, correct) in zip(written, EXPECTED_WRITTEN):
        assert q.prompt == prompt
        assert q.options == options
        # The answer key is stored server-side.
        assert q.correct_answer == correct
        assert q.correct_index == options.index(correct)


def test_seed_is_idempotent():
    call_command("seed_placement")
    call_command("seed_placement")  # re-run must not duplicate
    assert PlacementQuestion.objects.filter(question_type="written").count() == 5


def test_seeded_written_questions_expose_options_but_not_answer_key_via_api():
    call_command("seed_placement")
    resp = APIClient()
    student = make_student()
    resp.force_authenticate(user=student.user)
    body = resp.get("/api/v1/placement/test/").data

    assert len(body["written"]) == 5
    first = body["written"][0]
    assert first["prompt"] == "She ___ to school every day."
    assert first["options"] == ["go", "goes", "went", "gone"]
    # The answer key never appears in the public payload.
    flat = str(body).lower()
    assert "correct" not in flat
    assert "goes" in flat  # the option is visible…
    # …but there is no field telling the student WHICH option is correct.
    assert "correctanswer" not in flat and "correctindex" not in flat
