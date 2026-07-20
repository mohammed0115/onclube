"""
Duration-based subscription plans.

Replaces the three fixed monthly plans (starter/growth/intensive) with seven
duration tiers priced at a flat 15,000 SDG per teaching session — the student
subscribes by session, week, two weeks, month, 3 / 6 / 12 months. A week is
3 sessions (3 per week), a month is 12 sessions (3 × 4). Price is always
sessions × 15,000 (no bundle discount).

Old plans are only *deactivated* (active=False), never deleted, so existing
subscriptions and payment-proof history stay intact.
"""
from django.db import migrations

SESSION_PRICE = 15000

# code, name, emoji, sessions, period_days, cadence, recommended
PLANS = [
    ("session",    "Single Session", "✨", 1,   7,   "/ session",  False),
    ("week",       "1 Week",         "🌱", 3,   7,   "/ week",     False),
    ("two-weeks",  "2 Weeks",        "📅", 6,   14,  "/ 2 weeks",  False),
    ("month",      "1 Month",        "🚀", 12,  30,  "/ month",    True),
    ("quarter",    "3 Months",       "🔥", 36,  90,  "/ 3 months", False),
    ("half-year",  "6 Months",       "💎", 72,  180, "/ 6 months", False),
    ("year",       "1 Year",         "👑", 144, 365, "/ year",     False),
]

OLD_CODES = ["starter", "growth", "intensive"]


def _fmt(n):
    return f"{n:,}"


def forwards(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")

    # Retire the old fixed monthly plans (kept for history, hidden from catalog).
    Plan.objects.filter(code__in=OLD_CODES).update(active=False)

    for code, name, emoji, sessions, days, cadence, recommended in PLANS:
        price = sessions * SESSION_PRICE
        per_week = " · 3 sessions / week" if sessions >= 3 else ""
        description = f"{sessions} session{'s' if sessions != 1 else ''} · {_fmt(SESSION_PRICE)} SDG each"
        features = [
            f"{sessions} live 1:1 session{'s' if sessions != 1 else ''}{per_week}",
            f"{_fmt(SESSION_PRICE)} SDG per session",
            "AI progress report after every session",
            "Build your own weekly schedule",
        ]
        Plan.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "emoji": emoji,
                "price": price,
                "currency": "SDG",
                "cadence": cadence,
                "billing_period_days": days,
                "description": description,
                "sessions_per_month": sessions,
                "features": features,
                "recommended": recommended,
                "active": True,
            },
        )


def backwards(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Plan.objects.filter(code__in=[p[0] for p in PLANS]).update(active=False)
    Plan.objects.filter(code__in=OLD_CODES).update(active=True)


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0005_alter_paymentproof_currency_alter_plan_currency"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
