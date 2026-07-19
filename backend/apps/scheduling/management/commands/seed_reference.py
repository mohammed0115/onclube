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

PLANS = [
    {
        "code": "starter", "name": "Starter", "emoji": "🌱", "price": "15000",
        "cadence": "/ month", "billing_period_days": 30, "sessions_per_month": 4,
        "description": "Weekly practice to build a habit.",
        "features": ["4 live sessions / month", "AI session reports", "Community group classes"],
        "recommended": False,
    },
    {
        "code": "growth", "name": "Growth", "emoji": "🚀", "price": "28000",
        "cadence": "/ month", "billing_period_days": 30, "sessions_per_month": 8,
        "description": "Twice-weekly sessions for faster progress.",
        "features": ["8 live sessions / month", "AI session reports", "Priority booking", "Community group classes"],
        "recommended": True,
    },
    {
        "code": "intensive", "name": "Intensive", "emoji": "🔥", "price": "50000",
        "cadence": "/ month", "billing_period_days": 30, "sessions_per_month": 16,
        "description": "Daily-level immersion for rapid fluency.",
        "features": ["16 live sessions / month", "AI session reports", "Priority booking", "1:1 progress reviews"],
        "recommended": False,
    },
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
