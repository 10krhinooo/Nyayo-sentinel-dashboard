"""Health recording in the scrape pipeline.

Scrapers catch their own exceptions and return an empty list, so a total
failure reached main.py looking like a quiet day with no articles. Reddit and
Instagram in particular reported healthy while fetching nothing at all, which
meant a dead source was invisible on the health dashboard.
"""
import health


class TestHealthState:
    def setup_method(self):
        health._state.clear()

    def test_success_records_article_count(self):
        health.record_success("rss", 12)
        assert health._state["rss"]["consecutive_failures"] == 0
        assert health._state["rss"]["last_success"] is not None

    def test_failure_records_the_reason(self):
        health.record_failure("reddit", "connection refused")
        assert health._state["reddit"]["last_error"] == "connection refused"
        assert health._state["reddit"]["consecutive_failures"] == 1

    def test_consecutive_failures_accumulate(self):
        for _ in range(3):
            health.record_failure("reddit", "boom")
        assert health._state["reddit"]["consecutive_failures"] == 3

    def test_a_success_clears_the_failure_streak(self):
        health.record_failure("reddit", "boom")
        health.record_failure("reddit", "boom")
        health.record_success("reddit", 5)
        assert health._state["reddit"]["consecutive_failures"] == 0


class TestHealthFileLocation:
    def test_health_file_sits_beside_the_dedup_database(self):
        """The file was written to the working directory while DEDUP_DB_PATH
        used the mounted volume, so it vanished with the container and nothing
        could ever read it."""
        import os
        from pathlib import Path
        import importlib

        os.environ["DEDUP_DB_PATH"] = "/data/scraper_dedup.db"
        os.environ.pop("HEALTH_FILE_PATH", None)
        importlib.reload(health)

        assert Path(health._HEALTH_FILE).parent == Path("/data")

    def test_health_file_path_can_be_overridden(self):
        import os
        import importlib
        from pathlib import Path

        os.environ["HEALTH_FILE_PATH"] = "/tmp/custom_health.json"
        importlib.reload(health)
        assert Path(health._HEALTH_FILE) == Path("/tmp/custom_health.json")
        os.environ.pop("HEALTH_FILE_PATH", None)
        importlib.reload(health)
