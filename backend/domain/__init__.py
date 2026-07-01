"""
Domain layer — pure business rules, state transitions, domain exceptions,
domain events and DTOs.

This layer must stay free of Django ORM / framework concerns. The only allowed
dependency is `apps.common.exceptions` (a plain Exception base) so that domain
exceptions remain catchable as the existing BusinessRuleError.
"""
