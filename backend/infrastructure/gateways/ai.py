"""
AI provider — STUB ONLY.

This is the seam where OpenAI will plug in later. It returns deterministic,
offline, fake data and makes NO network calls. The real adapter
(OpenAIProvider) will implement the same AIProvider port. Per product rules, any
AI-generated questions produced via this provider are persisted as drafts
(approved=False) by the use case — never auto-approved.
"""
from application.ports.gateways import AIProvider


class StubAIProvider(AIProvider):
    provider_name = "stub"

    def score_placement(self, *, answers) -> dict:
        answered = len(answers or [])
        # Deterministic pseudo-score from how many were answered.
        base = 60 + min(answered, 6) * 2
        return {
            "level": "B1",
            "level_label": "Intermediate",
            "summary": "Stub placement result generated offline.",
            "skills": [
                {"label": "Speaking", "value": base, "color": "#4F46E5"},
                {"label": "Grammar", "value": base + 4, "color": "#7C3AED"},
                {"label": "Vocabulary", "value": base - 4, "color": "#06B6D4"},
                {"label": "Comprehension", "value": base + 2, "color": "#10B981"},
            ],
        }

    def suggest_subtopics(self, *, topic_title, topic_description) -> list:
        return [
            f"Warm-up for {topic_title}",
            f"Core practice: {topic_title}",
            "Common mistakes to avoid",
        ]

    def generate_questions(self, *, topic_title, topic_description) -> list:
        return [
            f"What comes to mind when you think about {topic_title.lower()}?",
            "Describe a related experience you have had.",
            "What would you like to improve about this?",
        ]

    def analyze_session(self, *, transcript) -> dict:
        turns = len(transcript or [])
        score = 75 + min(turns, 10)
        return {
            "overall_score": min(score, 100),
            "skills": [
                {"label": "Pronunciation", "value": 78, "color": "#4F46E5"},
                {"label": "Grammar", "value": 85, "color": "#7C3AED"},
                {"label": "Vocabulary", "value": 83, "color": "#06B6D4"},
                {"label": "Fluency", "value": 80, "color": "#10B981"},
            ],
            "mistakes": [
                {"label": "Past tense form", "example": "“I goed” → “I went”"},
            ],
            "recommendations": [
                "Review irregular past-tense verbs before your next session.",
                "Practise three answers aloud, ten minutes a day.",
            ],
        }
