"""The placement domain must stay framework-free: no Django, AI, STT, audio, HTTP.

We check real *imports* (not prose) and real DTO *fields* (not docstrings that
merely explain the absence of pronunciation).
"""
import dataclasses
import pathlib

import domain.placement as pkg
from domain.placement import dtos

# Import-style patterns only — comments mentioning "OpenAI later" are fine.
FORBIDDEN_IMPORTS = (
    "import openai", "from openai",
    "import django", "from django",
    "from apps", "import apps",
    "import requests", "import boto3", "import whisper",
)


def _source_files():
    root = pathlib.Path(pkg.__file__).parent
    return [p for p in root.glob("*.py") if p.name != "__init__.py"]


def test_no_framework_or_ai_imports_in_domain():
    offenders = {}
    for path in _source_files():
        text = path.read_text(encoding="utf-8").lower()
        hits = [tok for tok in FORBIDDEN_IMPORTS if tok in text]
        if hits:
            offenders[path.name] = hits
    assert not offenders, f"forbidden imports found: {offenders}"


def test_no_pronunciation_field_on_any_dto():
    classes = (
        dtos.PlacementWrittenAnswer,
        dtos.PlacementSpokenAnswer,
        dtos.PlacementSectionScore,
        dtos.PlacementRecommendationResult,
        dtos.PlacementAssessmentResult,
    )
    for cls in classes:
        names = {f.name.lower() for f in dataclasses.fields(cls)}
        assert not any("pronunciation" in n for n in names), cls.__name__
