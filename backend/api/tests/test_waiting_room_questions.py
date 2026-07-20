import pytest
from rest_framework.test import APIClient
from apps.common.factories import make_booking, make_session
from apps.common.enums import SessionStatus
pytestmark = pytest.mark.django_db

def test_waiting_room_includes_questions():
    booking = make_booking(days_ahead=0)  # make_booking builds a topic with an approved question
    session = make_session(booking, status=SessionStatus.SCHEDULED, agora_channel="c1")
    c = APIClient(); c.force_authenticate(user=booking.instructor.user)
    r = c.get(f"/api/v1/sessions/{session.id}/waiting-room/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert "questions" in body and isinstance(body["questions"], list)
    print("QUESTIONS:", body["questions"])
