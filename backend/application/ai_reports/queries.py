"""AI report query use cases (read-only)."""
from application import mappers
from application.permissions import (
    ensure_report_viewer,
    ensure_session_participant,
    get_student_profile,
)
from domain.dtos import AIReportDetailResult
from domain.session_report.progress import compute_progress
from infrastructure.container import (
    default_ai_report_repository,
    default_session_repository,
)


class GetStudentProgressUseCase:
    """The student's session-over-session progress: overall + per-skill current vs
    previous, a time series per skill, and an encouraging message. Reads only the
    student's own READY reports (oldest → newest)."""

    def __init__(self, *, reports=None):
        self.reports = reports or default_ai_report_repository()

    def execute(self, *, actor) -> dict:
        student = get_student_profile(actor)
        reports = self.reports.list_for_student(student)  # ready, oldest → newest
        return compute_progress(reports)


class GetStudentPlanUseCase:
    """The student's personal learning plan — derived from their LATEST report so
    it regenerates after every session (the 'Continuous Learning' pillar): what to
    focus on next, homework to do, and topics to practise."""

    def __init__(self, *, reports=None):
        self.reports = reports or default_ai_report_repository()

    def execute(self, *, actor) -> dict:
        student = get_student_profile(actor)
        reports = self.reports.list_for_student(student)  # ready, oldest → newest
        if not reports:
            return {
                "hasPlan": False,
                "nextFocus": None,
                "homework": [],
                "recommendedTopics": [],
                "focusAreas": [],
                "fromSession": None,
            }
        latest = reports[-1]
        content = latest.content or {}
        return {
            "hasPlan": True,
            "nextFocus": content.get("nextLessonFocus"),
            "homework": list(content.get("homework", []) or []),
            "recommendedTopics": list(content.get("recommendedTopics", []) or []),
            "focusAreas": list(content.get("weaknesses", []) or []),
            "fromSession": {
                "topic": latest.topic_title,
                "date": latest.session_date.isoformat() if latest.session_date else None,
            },
        }


class GetAIReportDetailUseCase:
    """Full report rendering. Visible to the report's student, its instructor, or admin."""

    def __init__(self, *, reports=None):
        self.reports = reports or default_ai_report_repository()

    def execute(self, *, actor, report_id) -> AIReportDetailResult:
        report = self.reports.get(report_id)
        ensure_report_viewer(actor, report)
        vocabulary = report.booking.topic.vocabulary
        return mappers.ai_report_detail(report, vocabulary=vocabulary)


class GetSessionReportUseCase:
    """
    Read a session's report by session id (participant only). Distinct from
    GetAIReportDetail (which looks up by report id): the report may still be
    pending — the view maps a pending status to HTTP 202.
    """

    def __init__(self, *, sessions=None, reports=None):
        self.sessions = sessions or default_session_repository()
        self.reports = reports or default_ai_report_repository()

    def execute(self, *, actor, session_id) -> AIReportDetailResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)
        report = self.reports.get_by_session(session)
        if report is None:
            from apps.ai_reports.models import AIReport

            raise AIReport.DoesNotExist("No report exists for this session yet.")
        vocabulary = session.booking.topic.vocabulary
        return mappers.ai_report_detail(report, vocabulary=vocabulary)
