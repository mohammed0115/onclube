"""
Seed a realistic demo dataset so the booking + instructor + live-session flows
have content out of the box.

Idempotent: keyed on instructor email / topic title / slot start, so re-running
never duplicates. Creates:
  * 3 instructors (matching the frontend's instructor cards)
  * published topics with vocabulary, sample prompts and approved questions
  * future weekly availability slots per instructor

It deliberately does NOT create students/bookings — those come from the live
flow (register → pay → book), which now works end to end.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import InstructorProfile, User
from apps.common.enums import CEFRLevel, SlotStatus, UserRole
from apps.scheduling.models import AvailabilitySlot, Question, Subtopic, Topic

INSTRUCTORS = [
    {
        "email": "sarah@oneclub.local", "name": "Sarah Mitchell", "initials": "SM",
        "flag": "🇺🇸", "country": "United States", "headline": "Conversation & interview coach",
        "rating": "4.9", "sessions_hosted": 312, "accent": "from-amber-400 to-orange-500",
    },
    {
        "email": "james@oneclub.local", "name": "James Okoro", "initials": "JO",
        "flag": "🇬🇧", "country": "United Kingdom", "headline": "Business English specialist",
        "rating": "4.8", "sessions_hosted": 248, "accent": "from-cyan-400 to-blue-500",
    },
    {
        "email": "emma@oneclub.local", "name": "Emma Clarke", "initials": "EC",
        "flag": "🇨🇦", "country": "Canada", "headline": "IELTS speaking examiner",
        "rating": "5.0", "sessions_hosted": 401, "accent": "from-purple-400 to-purple-600",
    },
]

# topic title -> (category, icon, accent, level, vocabulary, sample_prompts, subtopics, questions)
TOPICS = {
    "sarah@oneclub.local": [
        {
            "title": "Job Interviews", "category": "Work & Career", "icon": "Target",
            "accent": "from-orange-500 to-orange-600", "level": CEFRLevel.B1,
            "vocabulary": ["strengths", "weaknesses", "achievement", "challenge", "teamwork"],
            "sample_prompts": ["Tell me about yourself.", "Why do you want this job?"],
            "subtopics": ["Warm-up & introductions", "Behavioural questions", "Closing the interview"],
            "questions": [
                "Walk me through your CV in two minutes.",
                "Describe a time you solved a difficult problem at work.",
                "Where do you see yourself in five years?",
                "What is your greatest professional strength?",
            ],
        },
        {
            "title": "Daily Conversation", "category": "Everyday", "icon": "MessageCircle",
            "accent": "from-emerald-500 to-emerald-600", "level": CEFRLevel.A2,
            "vocabulary": ["weather", "weekend", "hobby", "neighbourhood", "routine"],
            "sample_prompts": ["What did you do last weekend?", "Tell me about your hometown."],
            "subtopics": ["Small talk", "Sharing opinions", "Everyday situations"],
            "questions": [
                "What does a typical weekday look like for you?",
                "Tell me about a hobby you enjoy and why.",
                "What is your favourite place in your city?",
            ],
        },
    ],
    "james@oneclub.local": [
        {
            "title": "Business Meetings", "category": "Work & Career", "icon": "Briefcase",
            "accent": "from-blue-500 to-blue-600", "level": CEFRLevel.B2,
            "vocabulary": ["agenda", "deadline", "stakeholder", "proposal", "follow-up"],
            "sample_prompts": ["Lead a short stand-up update.", "Disagree politely with a colleague."],
            "subtopics": ["Opening a meeting", "Giving updates", "Handling disagreement"],
            "questions": [
                "Give a one-minute update on a current project.",
                "How would you push back on an unrealistic deadline?",
                "Summarise the action items from a discussion.",
            ],
        },
    ],
    "emma@oneclub.local": [
        {
            "title": "IELTS Speaking", "category": "Exam Prep", "icon": "GraduationCap",
            "accent": "from-purple-500 to-purple-600", "level": CEFRLevel.B2,
            "vocabulary": ["describe", "compare", "advantage", "drawback", "in my opinion"],
            "sample_prompts": ["Describe a person who inspires you.", "Discuss the pros and cons of city life."],
            "subtopics": ["Part 1: Interview", "Part 2: Long turn", "Part 3: Discussion"],
            "questions": [
                "Describe a memorable journey you have taken. (Part 2)",
                "Do you think tourism benefits local communities?",
                "Compare living in a big city with living in a small town.",
            ],
        },
    ],
}


class Command(BaseCommand):
    help = "Seed demo instructors, published topics, questions and availability."

    @transaction.atomic
    def handle(self, *args, **opts):
        now = timezone.now()
        profiles = {}
        for spec in INSTRUCTORS:
            user, _ = User.objects.get_or_create(
                email=spec["email"],
                defaults={"full_name": spec["name"], "role": UserRole.INSTRUCTOR},
            )
            if user.role != UserRole.INSTRUCTOR:
                user.role = UserRole.INSTRUCTOR
            user.full_name = spec["name"]
            user.set_password("Instructor@123")
            user.save()
            profile, _ = InstructorProfile.objects.get_or_create(
                user=user,
                defaults={
                    "initials": spec["initials"], "flag": spec["flag"], "country": spec["country"],
                    "headline": spec["headline"], "rating": spec["rating"],
                    "sessions_hosted": spec["sessions_hosted"], "accent": spec["accent"],
                },
            )
            profiles[spec["email"]] = profile

            # Future availability: next 14 days, 10:00 & 14:00 slots.
            for day in range(1, 15):
                for hour in (10, 14):
                    start = (now + timedelta(days=day)).replace(
                        hour=hour, minute=0, second=0, microsecond=0
                    )
                    AvailabilitySlot.objects.get_or_create(
                        instructor=profile, start_at=start,
                        defaults={"duration_minutes": 45, "status": SlotStatus.OPEN},
                    )

        topic_count = q_count = 0
        for email, topics in TOPICS.items():
            profile = profiles[email]
            for t in topics:
                topic, _ = Topic.objects.get_or_create(
                    title=t["title"], instructor=profile,
                    defaults={
                        "category": t["category"], "icon": t["icon"], "accent": t["accent"],
                        "level": t["level"], "description": f"Practise {t['title'].lower()} with {profile.user.full_name}.",
                        "vocabulary": t["vocabulary"], "sample_prompts": t["sample_prompts"],
                        "published": True,
                    },
                )
                topic.published = True
                topic.description = topic.description or f"Practise {t['title'].lower()}."
                topic.vocabulary = t["vocabulary"]
                topic.sample_prompts = t["sample_prompts"]
                topic.save()
                topic_count += 1

                for i, st in enumerate(t["subtopics"]):
                    Subtopic.objects.get_or_create(
                        topic=topic, title=st, defaults={"ai_generated": True, "sort_order": i},
                    )
                for i, text in enumerate(t["questions"]):
                    obj, created = Question.objects.get_or_create(
                        topic=topic, text=text,
                        defaults={"approved": True, "ai_assisted": i > 0, "sort_order": i,
                                  "approved_at": now, "approved_by": profile.user},
                    )
                    if not obj.approved:
                        obj.approved = True
                        obj.approved_at = now
                        obj.approved_by = profile.user
                        obj.save()
                    q_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Demo seed OK — instructors={len(profiles)} topics={topic_count} "
            f"questions={q_count} slots={AvailabilitySlot.objects.count()}"
        ))
