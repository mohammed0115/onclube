"""Shared service-layer exceptions."""


class BusinessRuleError(Exception):
    """Raised when an operation violates an MVP business rule.

    `code` mirrors the API error codes from the backend plan (e.g.
    'slot_unavailable', 'no_sessions_remaining', 'subscription_expired').
    """

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code
