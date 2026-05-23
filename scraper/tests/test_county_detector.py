import pytest
from nlp.county_detector import detect_county


def test_canonical_name_match_returns_county_and_high_confidence():
    county, confidence = detect_county("There is a protest in Nairobi today.")
    assert county == "Nairobi"
    assert confidence == pytest.approx(0.90)


def test_alias_only_match_returns_lower_confidence():
    # "nbi" is an alias for Nairobi
    county, confidence = detect_county("Flooding reported in nbi this morning.")
    assert county == "Nairobi"
    assert confidence == pytest.approx(0.85)


def test_both_canonical_and_alias_returns_full_confidence():
    # Both "Nairobi" (canonical) and "nbi" (alias) appear
    county, confidence = detect_county("Nairobi residents in nbi protest water outages.")
    assert county == "Nairobi"
    assert confidence == pytest.approx(1.0)


def test_unrelated_text_returns_none_and_zero_confidence():
    county, confidence = detect_county("The weather forecast shows rain in London.")
    assert county is None
    assert confidence == pytest.approx(0.0)


def test_matching_is_case_insensitive():
    county, confidence = detect_county("Reports from NAIROBI show unrest.")
    assert county == "Nairobi"
    assert confidence >= 0.85


def test_alias_eldoret_maps_to_uasin_gishu():
    county, confidence = detect_county("A new hospital was opened in Eldoret.")
    assert county == "Uasin Gishu"
    assert confidence >= 0.85


def test_mombasa_detected_via_canonical_name():
    county, confidence = detect_county("Ferry services in Mombasa disrupted by strike.")
    assert county == "Mombasa"
    assert confidence >= 0.85


def test_kisumu_alias_lakeside_city_detected():
    county, confidence = detect_county("Protests erupt in the lakeside city over taxation.")
    assert county == "Kisumu"
    assert confidence >= 0.85


def test_empty_string_returns_none():
    county, confidence = detect_county("")
    assert county is None
    assert confidence == pytest.approx(0.0)
