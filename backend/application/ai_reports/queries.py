"""AI report query use cases (read-only)."""
from application import mappers
from application.permissions import ensure_report_viewer, ensure_session_participant
from domain.dtos import AIReportDetailResult
from infrastructure.container import (
    default_ai_report_repository,
    default_session_repository,
)


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
