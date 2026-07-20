"""OpenAI topic-assist provider: real path parses; every failure falls back."""
import json

from infrastructure.gateways.topic_assist import OpenAITopicAssistProvider


def _chat_returning(items):
    return lambda **kwargs: json.dumps({"items": items})


def test_openai_subtopics_are_used_when_valid():
    p = OpenAITopicAssistProvider(api_key="k", chat=_chat_returning(
        ["Small talk before the interview", "Answering tell me about yourself", "Salary negotiation"]
    ))
    out = p.suggest_subtopics(topic_title="Job Interview", topic_description="practice")
    assert out == ["Small talk before the interview", "Answering tell me about yourself", "Salary negotiation"]


def test_openai_questions_capped_and_deduped():
    p = OpenAITopicAssistProvider(api_key="k", chat=_chat_returning(
        ["Q1", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]  # dup + over limit
    ))
    out = p.generate_questions(topic_title="Travel", topic_description="")
    assert out == ["Q1", "Q2", "Q3", "Q4", "Q5"]  # deduped, capped to 5


def test_invalid_json_falls_back_to_stub():
    p = OpenAITopicAssistProvider(api_key="k", chat=lambda **k: "not json")
    out = p.suggest_subtopics(topic_title="Travel", topic_description="")
    assert out and all("Travel" in s or "mistakes" in s.lower() for s in out)  # stub output


def test_exception_falls_back_to_stub():
    def boom(**kwargs):
        raise RuntimeError("provider down")

    p = OpenAITopicAssistProvider(api_key="k", chat=boom)
    assert p.generate_questions(topic_title="Travel", topic_description="")  # non-empty stub


def test_no_api_key_uses_stub_without_calling_openai():
    called = {"n": 0}

    def spy(**kwargs):
        called["n"] += 1
        return "{}"

    p = OpenAITopicAssistProvider(api_key="", chat=spy)
    assert p.suggest_subtopics(topic_title="Travel", topic_description="")
    assert called["n"] == 0  # never hit OpenAI without a key


def test_empty_items_falls_back():
    p = OpenAITopicAssistProvider(api_key="k", chat=_chat_returning([]))
    assert p.suggest_subtopics(topic_title="Travel", topic_description="")  # falls back, non-empty
