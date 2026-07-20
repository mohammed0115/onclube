"""
Seed the AI-tutor subscription plans (a separate, optional product). Monthly is
60,000 SDG; a weekly and a quarterly option give the student freedom to subscribe
for the duration they want. These plans have kind="ai_tutor" so approving their
payment activates an AI-tutor subscription, not session credits.
"""
from django.db import migrations

MONTH_PRICE = 60000

# code, name, emoji, price, period_days, cadence, recommended
PLANS = [
    ("ai-tutor-week",    "AI Tutor · Weekly",  "🤖", 15000,  7,   "/ week",     False),
    ("ai-tutor-month",   "AI Tutor · Monthly", "✨", 60000,  30,  "/ month",    True),
    ("ai-tutor-quarter", "AI Tutor · 3 Months", "🚀", 180000, 90,  "/ 3 months", False),
]


def forwards(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    for code, name, emoji, price, days, cadence, recommended in PLANS:
        Plan.objects.update_or_create(
            code=code,
            defaults={
                "kind": "ai_tutor",
                "name": name,
                "emoji": emoji,
                "price": price,
                "currency": "SDG",
                "cadence": cadence,
                "billing_period_days": days,
                "description": "Unlimited 5-minute AI speaking-practice sessions.",
                "sessions_per_month": 0,  # not credit-based; the 5-min cap is per session
                "features": [
                    "5-minute AI conversations, any time",
                    "Instant speaking practice — no booking",
                    "Separate from your live-session plan",
                ],
                "recommended": recommended,
                "active": True,
            },
        )


def backwards(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Plan.objects.filter(code__in=[p[0] for p in PLANS]).update(active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0007_plan_kind"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
