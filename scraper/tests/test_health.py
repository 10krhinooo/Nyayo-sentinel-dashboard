import pytest
import logging
import health


@pytest.fixture(autouse=True)
def reset_health_state():
    health._state.clear()
    yield
    health._state.clear()


class TestRecordSuccess:
    def test_sets_consecutive_failures_to_zero(self):
        health.record_failure("rss", "timeout")
        health.record_failure("rss", "timeout")
        health.record_success("rss", 5)

        assert health._state["rss"]["consecutive_failures"] == 0

    def test_increments_article_count(self):
        health.record_success("rss", 10)
        health.record_success("rss", 7)

        assert health._state["rss"]["total_articles_this_cycle"] == 17

    def test_records_last_success_timestamp(self):
        health.record_success("reddit", 3)

        assert "last_success" in health._state["reddit"]

    def test_creates_entry_for_new_scraper(self):
        health.record_success("facebook", 2)

        assert "facebook" in health._state


class TestRecordFailure:
    def test_increments_consecutive_failures(self):
        health.record_failure("rss", "connection error")
        health.record_failure("rss", "timeout")

        assert health._state["rss"]["consecutive_failures"] == 2

    def test_stores_last_error_message(self):
        health.record_failure("instagram", "login required")

        assert health._state["instagram"]["last_error"] == "login required"

    def test_logs_warning_after_three_consecutive_failures(self, caplog):
        with caplog.at_level(logging.WARNING, logger="health"):
            health.record_failure("rss", "err")
            health.record_failure("rss", "err")
            health.record_failure("rss", "err")  # third → warning

        assert any("UNHEALTHY" in record.message for record in caplog.records)

    def test_no_warning_before_three_failures(self, caplog):
        with caplog.at_level(logging.WARNING, logger="health"):
            health.record_failure("rss", "err")
            health.record_failure("rss", "err")

        assert not any("UNHEALTHY" in record.message for record in caplog.records)


class TestGetHealth:
    def test_returns_empty_dict_initially(self):
        assert health.get_health() == {}

    def test_returns_shallow_copy_adding_top_level_key_does_not_affect_state(self):
        health.record_success("rss", 5)
        snapshot = health.get_health()
        # Adding a new top-level key to the snapshot must not mutate _state
        snapshot["phantom_scraper"] = {"consecutive_failures": 0}

        assert "phantom_scraper" not in health._state

    def test_reflects_recorded_entries(self):
        health.record_success("rss", 10)
        health.record_failure("instagram", "error")
        result = health.get_health()

        assert "rss" in result
        assert "instagram" in result


class TestResetCycleCounts:
    def test_resets_article_count_to_zero_for_all_scrapers(self):
        health.record_success("rss", 15)
        health.record_success("reddit", 8)
        health.reset_cycle_counts()

        assert health._state["rss"]["total_articles_this_cycle"] == 0
        assert health._state["reddit"]["total_articles_this_cycle"] == 0

    def test_preserves_consecutive_failures_across_reset(self):
        health.record_failure("rss", "err")
        health.reset_cycle_counts()

        assert health._state["rss"]["consecutive_failures"] == 1
