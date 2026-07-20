"""
Seed baseline reference data — onboarding goals and billing plans — idempotently.

Usage:
    python manage.py seed_reference

Safe to run repeatedly (get_or_create; never deletes). Run once after a fresh
deploy so students can pick a goal and see pricing plans.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.onboarding.models import Goal
from apps.billing.models import Plan


GOALS = [
    ("travel", "Travel", "Speak confidently on trips abroad.", "Plane", "from-sky-500 to-blue-600"),
    ("work", "Work & Career", "Handle meetings, emails and calls at work.", "Briefcase", "from-indigo-500 to-purple-600"),
    ("interview", "Job Interviews", "Prepare for interviews in English.", "UserCheck", "from-emerald-500 to-teal-600"),
    ("study", "Study Abroad", "Get ready for university and academic life.", "GraduationCap", "from-violet-500 to-fuchsia-600"),
    ("exams", "Exams (IELTS/TOEFL)", "Practise for international English exams.", "ClipboardCheck", "from-rose-500 to-pink-600"),
    ("everyday", "Everyday Conversation", "Chat naturally about daily life.", "MessageCircle", "from-amber-500 to-orange-600"),
    ("business", "Business English", "Negotiate, present and network professionally.", "Building2", "from-slate-500 to-slate-700"),
    ("confidence", "Speaking Confidence", "Overcome the fear of speaking out loud.", "Mic", "from-cyan-500 to-blue-600"),
]

# Duration-based tiers at a flat 15,000 SDG per teaching session. A week is
# 3 sessions (3/week); a month is 12 sessions (3 × 4). Price = sessions × 15,000.
SESSION_PRICE = 15000


def _plan(code, name, emoji, sessions, days, cadence, recommended=False):
    per_week = " · 3 sessions / week" if sessions >= 3 else ""
    return {
        "code": code, "name": name, "emoji": emoji,
        "price": str(sessions * SESSION_PRICE),
        "cadence": cadence, "billing_period_days": days,
        "sessions_per_month": sessions,
        "description": f"{sessions} session{'s' if sessions != 1 else ''} · {SESSION_PRICE:,} SDG each",
        "features": [
            f"{sessions} live 1:1 session{'s' if sessions != 1 else ''}{per_week}",
            f"{SESSION_PRICE:,} SDG per session",
            "AI progress report after every session",
            "Build your own weekly schedule",
        ],
        "recommended": recommended,
    }


PLANS = [
    _plan("session",   "Single Session", "✨", 1,   7,   "/ session"),
    _plan("week",      "1 Week",         "🌱", 3,   7,   "/ week"),
    _plan("two-weeks", "2 Weeks",        "📅", 6,   14,  "/ 2 weeks"),
    _plan("month",     "1 Month",        "🚀", 12,  30,  "/ month", recommended=True),
    _plan("quarter",   "3 Months",       "🔥", 36,  90,  "/ 3 months"),
    _plan("half-year", "6 Months",       "💎", 72,  180, "/ 6 months"),
    _plan("year",      "1 Year",         "👑", 144, 365, "/ year"),
]


class Command(BaseCommand):
    help = "Seed baseline onboarding goals and billing plans (idempotent)."

    @transaction.atomic
    def handle(self, *args, **opts):
        g_created = 0
        for code, label, desc, icon, accent in GOALS:
            _, created = Goal.objects.get_or_create(
                code=code,
                defaults={"label": label, "description": desc, "icon": icon, "accent": accent, "active": True},
            )
            g_created += int(created)

        p_created = 0
        for p in PLANS:
            _, created = Plan.objects.get_or_create(
                code=p["code"],
                defaults={
                    "name": p["name"], "emoji": p["emoji"], "price": p["price"],
                    "currency": "SDG", "cadence": p["cadence"],
                    "billing_period_days": p["billing_period_days"],
                    "description": p["description"], "sessions_per_month": p["sessions_per_month"],
                    "features": p["features"], "recommended": p["recommended"], "active": True,
                },
            )
            p_created += int(created)

        self.stdout.write(self.style.SUCCESS(
            f"seed_reference: goals +{g_created} (total {Goal.objects.count()}), "
            f"plans +{p_created} (total {Plan.objects.count()})"
        ))
