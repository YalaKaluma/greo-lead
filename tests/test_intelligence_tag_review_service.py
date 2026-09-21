import os
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.services.intelligence_tag_review_service import evidence_review_reasons  # noqa: E402


def _link(tag_type, confidence=1.0):
    return SimpleNamespace(
        tag=SimpleNamespace(tag_type=tag_type),
        confidence_score=confidence,
    )


def test_untagged_evidence_is_explicitly_flagged():
    evidence = SimpleNamespace(tag_links=[])

    assert evidence_review_reasons(evidence) == ["untagged"]


def test_theme_only_evidence_is_flagged_as_missing_an_entity():
    evidence = SimpleNamespace(tag_links=[_link("theme", 0.65)])

    assert evidence_review_reasons(evidence) == ["no_entity"]


def test_low_confidence_entity_is_flagged_without_penalizing_theme_confidence():
    reliable = SimpleNamespace(tag_links=[_link("person", 0.95), _link("theme", 0.65)])
    uncertain = SimpleNamespace(tag_links=[_link("project", 0.7), _link("theme", 0.65)])

    assert evidence_review_reasons(reliable) == []
    assert evidence_review_reasons(uncertain) == ["low_confidence"]
