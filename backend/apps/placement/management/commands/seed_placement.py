"""
Seed the FIXED, known placement questions (Phase 8C).

Idempotent: keyed on (question_type, order) via update_or_create, so re-running
never duplicates. These are OneClub-owned content — the smart teacher only
ever READS the spoken questions; it never generates placement questions.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.placement.models import PlacementQuestion

# FIXED, OneClub-owned written placement questions (multiple choice).
# These are NEVER AI-generated and NEVER editable by students. `options` are the
# visible choices; `correct_answer`/`correct_index` are the server-only answer key
# and MUST NEVER be serialized to a student.
# (order, prompt, skill, cefr_band, options, correct_answer)
WRITTEN_QUESTIONS = [
    (1, "She ___ to school every day.", "grammar", "A1", ["go", "goes", "went", "gone"], "goes"),
    (2, "I ___ 20 years old.", "grammar", "A1", ["is", "am", "are", "were"], "am"),
    (3, "We ___ from Sudan.", "grammar", "A1", ["come", "came", "be", "were"], "come"),
    (4, "How old ___ you?", "grammar", "A1", ["is", "have", "has", "are"], "are"),
    (5, "They ___ football yesterday.", "grammar", "A2", ["play", "playing", "player", "played"], "played"),
]

# FIXED, OneClub-owned spoken interview questions. NEVER AI-generated, NEVER
# reordered, NEVER skipped. The AI interviewer only reads these known prompts.
# (order, prompt, skill, cefr_band)
SPOKEN_QUESTIONS = [
    (1, "What is your name?", "conversation", "A1"),
    (2, "How old are you?", "conversation", "A1"),
    (3, "Where are you from?", "conversation", "A1"),
    (4, "What do you do for a living?", "fluency", "A2"),
    (5, "Why do you want to learn English?", "fluency", "A2"),
]


class Command(BaseCommand):
    help = "Seed fixed, known placement questions (written + spoken). Idempotent."

    @transaction.atomic
    def handle(self, *args, **options):
        created, updated = 0, 0

        # Written: multiple choice with a server-only answer key.
        for order, prompt, skill, band, opts, correct in WRITTEN_QUESTIONS:
            _, was_created = PlacementQuestion.objects.update_or_create(
                question_type="written",
                order=order,
                defaults={
                    "prompt": prompt,
                    "skill": skill,
                    "cefr_band": band,
                    "is_active": True,
                    "options": opts,
                    "correct_answer": correct,
                    "correct_index": opts.index(correct),
                },
            )
            created += int(was_created)
            updated += int(not was_created)

        # Spoken: open prompts (no answer key).
        for order, prompt, skill, band in SPOKEN_QUESTIONS:
            _, was_created = PlacementQuestion.objects.update_or_create(
                question_type="spoken",
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
