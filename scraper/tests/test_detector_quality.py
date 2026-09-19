"""Regression tests for the detector defects fixed alongside these tests.

Each case here failed before the fix, so the file doubles as a description of
what was wrong.
"""
import ast
import collections
import pathlib

from nlp.county_detector import detect_county
from nlp.topic_detector import detect_topics


class TestAliasTableIntegrity:
    def test_alias_dict_has_no_duplicate_keys(self):
        """Tharaka-Nithi was declared twice.

        Python keeps the last definition silently, so the hyphenated and
        spaced spellings declared in the first entry were discarded. A dict
        literal cannot be checked at runtime, so the source is parsed.
        """
        source = pathlib.Path("nlp/county_detector.py").read_text()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
                dupes = [k for k, n in collections.Counter(keys).items() if n > 1]
                assert not dupes, f"duplicate alias keys: {dupes}"

    def test_all_alias_keys_are_real_counties(self):
        from config import COUNTY_NAMES
        from nlp.county_detector import _ALIASES

        unknown = set(_ALIASES) - set(COUNTY_NAMES)
        assert not unknown, f"aliases for counties that do not exist: {unknown}"


class TestCountyMisattribution:
    """Matching returned the first hit in COUNTY_NAMES order.

    Broad regional aliases therefore hijacked whole regions: Mombasa sits at
    index 0, so "the coast" and "pwani" beat every other Coast county.
    """

    def test_coast_phrasing_does_not_hijack_a_named_coast_county(self):
        # "the coast" was a Mombasa alias, and Mombasa is index 0, so any
        # article using the regional phrase was credited to Mombasa no matter
        # which Coast county it actually named.
        assert detect_county("Along the coast, Kilifi residents protested")[0] == "Kilifi"

    def test_pwani_does_not_hijack_a_named_coast_county(self):
        assert detect_county("Katika pwani, wakazi wa Kwale walilalamika")[0] == "Kwale"

    def test_western_kenya_does_not_hijack_a_named_western_county(self):
        # "western kenya" was a Kakamega alias.
        assert detect_county("In western Kenya, Bungoma farmers reported losses")[0] == "Bungoma"

    def test_a_directly_named_county_still_wins(self):
        assert detect_county("Protests broke out in Kilifi town today")[0] == "Kilifi"

    def test_tharaka_nithi_spaced_spelling_resolves(self):
        assert detect_county("Tharaka nithi leaders met yesterday")[0] == "Tharaka-Nithi"

    def test_tharaka_nithi_hyphenated_spelling_resolves(self):
        assert detect_county("Tharaka-Nithi county assembly sat")[0] == "Tharaka-Nithi"

    def test_chuka_alias_survived_the_duplicate_key(self):
        assert detect_county("Chuka town traders protested")[0] == "Tharaka-Nithi"

    def test_canonical_name_outranks_a_town_alias(self):
        # Eldoret is an alias for Uasin Gishu; Nakuru is named outright.
        assert detect_county("Eldoret traders and Nakuru residents met")[0] == "Nakuru"

    def test_no_match_returns_none(self):
        assert detect_county("A story with no place in it") == (None, 0.0)

    def test_empty_text_returns_none(self):
        assert detect_county("") == (None, 0.0)


class TestTopicWordBoundaries:
    """Matching used a plain substring test with no word boundaries."""

    def test_share_does_not_match_the_sha_health_keyword(self):
        topics = dict(detect_topics("Residents share a common tap"))
        assert "Healthcare" not in topics

    def test_ankara_does_not_match_the_kra_tax_keyword(self):
        topics = dict(detect_topics("The delegation travelled to Ankara"))
        assert "Taxation & Revenue" not in topics

    def test_award_does_not_match_the_ward_devolution_keyword(self):
        topics = dict(detect_topics("She received an award for her studies"))
        assert "Devolution" not in topics

    def test_towards_does_not_match_the_ward_devolution_keyword(self):
        topics = dict(detect_topics("Progress towards the target continues"))
        assert "Devolution" not in topics

    def test_empty_text_returns_no_topics(self):
        assert detect_topics("") == []


class TestTopicConfidence:
    """Specificity was approximated by keyword length.

    Any keyword of eight characters or more scored 0.90, which handed top
    confidence to generic words like "infrastructure" and "employment".
    """

    def test_a_named_institution_scores_high(self):
        assert dict(detect_topics("NHIF reimbursements delayed"))["Healthcare"] == 0.90

    def test_a_long_but_generic_word_does_not_score_high_alone(self):
        topics = dict(detect_topics("The infrastructure plan was tabled"))
        assert topics.get("Roads & Transport", 0) < 0.90

    def test_swahili_keywords_still_match(self):
        assert "Corruption" in dict(detect_topics("Wakazi wanalalamika kuhusu ufisadi"))

    def test_an_article_can_match_several_topics(self):
        topics = dict(detect_topics("KRA tax changes hit matatu operators and hospitals"))
        assert len(topics) >= 2
