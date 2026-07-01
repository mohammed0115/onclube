"""
Seed the FIXED, known placement questions (Phase 8C).

Idempotent: keyed on (question_type, order) via update_or_create, so re-running
never duplicates. These are OneClub-owned content — the smart teacher only
ever READS the spoken questions; it never generates placement questions.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.placement.models import PlacementQuestion

WRITTEN_QUESTIONS = [
    # (order, prompt, skill, cefr_band)
    (1, "Introduce yourself in a few sentences (your name, where you are from, what you do).", "vocabulary", "A1"),
    (2, "Write about your daily routine. What do you usually do in a typical day?", "grammar", "A2"),
    (3, "Describe something you did last weekend. Use the past tense.", "grammar", "B1"),
    (4, "What are your goals for learning English, and why are they important to you?", "vocabulary", "B1"),
    (5, "Do you think technology makes communication easier or harder? Explain your opinion.", "comprehension", "B2"),
]

SPOKEN_QUESTIONS = [
    (1, "Tell me a little about yourself and your background.", "conversation", "A1"),
    (2, "What do you usually do in your free time? Tell me about a hobby you enjoy.", "fluency", "A2"),
    (3, "Describe a memorable trip or experience you have had.", "fluency", "B1"),
    (4, "What are you most proud of, and why?", "conversation", "B1"),
    (5, "Talk about a challenge you faced and how you dealt with it.", "fluency", "B2"),
]


class Command(BaseCommand):
    help = "Seed fixed, known placement questions (written + spoken). Idempotent."

    @transaction.atomic
    def handle(self, *args, **options):
        created, updated = 0, 0
        for qtype, rows in (("written", WRITTEN_QUESTIONS), ("spoken", SPOKEN_QUESTIONS)):
            for order, prompt, skill, band in rows:
                _, was_created = PlacementQuestion.objects.update_or_create(
                    question_type=qtype,
                    order=order,
                    defaults={
                        "prompt": prompt,
                        "skill": skill,
                        "cefr_band": band,
                        "is_active": True,
                    },
                )
                created += int(was_created)
                updated += int(not was_created)

        total = PlacementQuestion.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f"Placement seed OK — created={created} updated={updated} total={total} "
            f"(written={len(WRITTEN_QUESTIONS)} spoken={len(SPOKEN_QUESTIONS)})"
        ))
