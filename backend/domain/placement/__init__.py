"""
Placement domain — pure, framework-free rules for OneClub's AI-led
placement interview (Phase 8B).

Two sections: a written warm-up (typed) and a spoken interview (the AI tutor
asks fixed known questions; the student answers by voice → STT → transcript).
Everything here scores from **text only** — there is NO pronunciation score and
NO dependency on Django, OpenAI, STT, audio, or HTTP. The default evaluator is a
deterministic heuristic; an AI provider can replace it later behind a flag.
"""
