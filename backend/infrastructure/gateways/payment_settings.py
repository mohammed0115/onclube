"""Reads configurable payment providers from Django settings.

The values are configuration (`PAYMENT_PROVIDERS`, env-driven for the default
provider), so no bank name is hardcoded in code. Only active providers are
returned, ordered by `display_order`. The composition root is the only place
that knows this is the active adapter.
"""
from django.conf import settings

from application.ports.gateways import PaymentSettingsGateway

_FIELDS = (
    "provider_key",
    "provider_name",
    "transfer_method",
    "bank_name",
    "account_name",
    "account_number",
    "iban",
    "instructions",
    "currency",
)


def _normalize(raw: dict) -> dict:
    out = {f: raw.get(f, "") for f in _FIELDS}
    out["is_active"] = bool(raw.get("is_active", True))
    out["display_order"] = int(raw.get("display_order", 0))
    return out


class DjangoPaymentSettingsGateway(PaymentSettingsGateway):
    def _all(self) -> list:
        return list(getattr(settings, "PAYMENT_PROVIDERS", []) or [])

    def list_providers(self) -> list:
        active = [_normalize(p) for p in self._all() if bool(p.get("is_active", True))]
        return sorted(active, key=lambda p: p["display_order"])

    def default_account(self) -> dict:
        providers = self.list_providers()
        return providers[0] if providers else None
