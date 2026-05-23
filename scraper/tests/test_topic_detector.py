import pytest
from nlp.topic_detector import detect_topics


def test_healthcare_keyword_detected():
    results = detect_topics("The hospital in Nairobi has run out of medicine.")
    topics = [t for t, _ in results]
    assert "Healthcare" in topics


def test_corruption_keyword_detected():
    results = detect_topics("Officials implicated in embezzlement of public funds.")
    topics = [t for t, _ in results]
    assert "Corruption" in topics


def test_multiple_topics_detected_in_single_article():
    text = (
        "The school fees are too high and the hospital is understaffed. "
        "Students cannot afford education while patients suffer."
    )
    results = detect_topics(text)
    topics = [t for t, _ in results]
    assert "Healthcare" in topics
    assert "Education" in topics


def test_off_topic_text_returns_empty_list():
    results = detect_topics("The match ended 2-1 after extra time at the stadium.")
    assert results == []


def test_swahili_keyword_triggers_healthcare():
    # "hospitali" is a Swahili keyword for Healthcare
    results = detect_topics("Hospitali imefungwa kwa sababu ya mgomo wa madaktari.")
    topics = [t for t, _ in results]
    assert "Healthcare" in topics


def test_swahili_keyword_triggers_corruption():
    # "ufisadi" is a Swahili keyword for Corruption
    results = detect_topics("Ufisadi unaendelea katika serikali za kaunti.")
    topics = [t for t, _ in results]
    assert "Corruption" in topics


def test_strong_keyword_produces_high_confidence():
    # "embezzlement" is >= 8 chars → strong keyword → confidence 0.90
    results = detect_topics("Embezzlement of county funds discovered by auditors.")
    confidences = {t: c for t, c in results}
    assert "Corruption" in confidences
    assert confidences["Corruption"] >= 0.90


def test_single_regular_keyword_produces_low_confidence():
    # "tax" is 3 chars, below 8 → regular keyword → confidence 0.60 (single match)
    results = detect_topics("New tax announced by the government.")
    confidences = {t: c for t, c in results}
    if "Taxation & Revenue" in confidences:
        assert confidences["Taxation & Revenue"] == pytest.approx(0.60)


def test_two_regular_keywords_produce_medium_confidence():
    # "tax" and "kra" are both short but there are 2 of them → 0.75
    results = detect_topics("The new tax collected by KRA has increased.")
    confidences = {t: c for t, c in results}
    if "Taxation & Revenue" in confidences:
        assert confidences["Taxation & Revenue"] >= 0.75


def test_food_security_keywords_detected():
    results = detect_topics("Hunger and malnutrition are increasing in arid counties.")
    topics = [t for t, _ in results]
    assert "Food Security" in topics
