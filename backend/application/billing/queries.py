"""Billing query use cases (read-only)."""
from apps.common.exceptions import BusinessRuleError

from application import mappers
from application.permissions import get_student_profile
from domain.dtos import PaymentProviderResult, SubscriptionDetailResult
from infrastructure.container import (
    default_file_storage,
    default_payment_repository,
    default_payment_settings_gateway,
    default_plan_repository,
    default_subscription_repository,
)


def _provider_dto(d: dict) -> PaymentProviderResult:
    return PaymentProviderResult(
        provider_key=d["provider_key"],
        provider_name=d["provider_name"],
        transfer_method=d["transfer_method"],
        bank_name=d["bank_name"],
        account_name=d["account_name"],
        account_number=d["account_number"],
        instructions=d["instructions"],
        currency=d["currency"],
        is_active=d["is_active"],
        display_order=d["display_order"],
        iban=(d.get("iban") or None),
    )


class ListPaymentProvidersUseCase:
    """Active payment providers, ordered by display_order (no hardcoded bank)."""

    def __init__(self, *, settings_gateway=None):
        self.settings_gateway = settings_gateway or default_payment_settings_gateway()

    def execute(self, *, actor) -> list:
        return [_provider_dto(p) for p in self.settings_gateway.list_providers()]


class GetBankAccountUseCase:
    """The default active bank-transfer account for the payment page."""

    def __init__(self, *, settings_gateway=None):
        self.settings_gateway = settings_gateway or default_payment_settings_gateway()

    def execute(self, *, actor) -> PaymentProviderResult:
        acct = self.settings_gateway.default_account()
        if acct is None:
            raise BusinessRuleError("No active payment provider is configured.")
        return _provider_dto(acct)


class ListPlansUseCase:
    """Active plan catalogue — readable by any authenticated actor."""

    def __init__(self, *, plans=None):
        self.plans = plans or default_plan_repository()

    def execute(self, *, actor) -> list:
        return [mappers.plan_result(p) for p in self.plans.list_active()]


class GetCurrentSubscriptionUseCase:
    def __init__(self, *, subscriptions=None):
        self.subscriptions = subscriptions or default_subscription_repository()

    def execute(self, *, actor):
        student = get_student_profile(actor)
        sub = self.subscriptions.get_active_for_student(student)
        if sub is None:
            return None
        return mappers.subscription_detail(sub)


class ListStudentBillingHistoryUseCase:
    """A student's own payment proofs, with signed receipt urls (decision 5)."""

    def __init__(self, *, payments=None, file_storage=None):
        self.payments = payments or default_payment_repository()
        self.file_storage = file_storage or default_file_storage()

    def execute(self, *, actor) -> list:
        student = get_student_profile(actor)
        items = []
        for proof in self.payments.list_for_student(student):
            url = self.file_storage.url_for(storage_key=proof.receipt_file.storage_key)
            items.append(mappers.billing_history_item(proof, receipt_url=url))
        return items
