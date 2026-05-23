import pytest
import responses as rsps_lib
import requests

INGEST_URL = "http://testserver/api/ingest/events"


@pytest.fixture(autouse=True)
def patch_ingest_url(monkeypatch):
    """Redirect ingest_client to use the test server URL."""
    import ingest_client
    monkeypatch.setattr(ingest_client, "INGEST_URL", INGEST_URL)


def _make_events(count: int) -> list[dict]:
    return [{"source": f"source-{i}", "countyName": "Nairobi"} for i in range(count)]


class TestPostEvents:
    @rsps_lib.activate
    def test_single_batch_returned_inserted_count(self):
        rsps_lib.add(rsps_lib.POST, INGEST_URL, json={"inserted": 5, "skipped": []})

        from ingest_client import post_events

        result = post_events(_make_events(5))

        assert result["inserted"] == 5
        assert result["skipped"] == []
        assert len(rsps_lib.calls) == 1

    @rsps_lib.activate
    def test_large_batch_split_into_chunks_of_500(self):
        rsps_lib.add(rsps_lib.POST, INGEST_URL, json={"inserted": 500, "skipped": []})
        rsps_lib.add(rsps_lib.POST, INGEST_URL, json={"inserted": 100, "skipped": []})

        from ingest_client import post_events

        result = post_events(_make_events(600))

        assert result["inserted"] == 600
        assert len(rsps_lib.calls) == 2

    @rsps_lib.activate
    def test_retries_on_500_then_succeeds(self, mocker):
        mocker.patch("time.sleep")
        rsps_lib.add(rsps_lib.POST, INGEST_URL, status=500)
        rsps_lib.add(rsps_lib.POST, INGEST_URL, json={"inserted": 1, "skipped": []})

        from ingest_client import post_events

        result = post_events(_make_events(1))

        assert result["inserted"] == 1
        assert len(rsps_lib.calls) == 2

    @rsps_lib.activate
    def test_all_retries_exhausted_returns_zero_inserted(self, mocker):
        mocker.patch("time.sleep")
        # 4 attempts total (initial + 3 retries) all return 500
        for _ in range(4):
            rsps_lib.add(rsps_lib.POST, INGEST_URL, status=500)

        from ingest_client import post_events

        result = post_events(_make_events(1))

        assert result["inserted"] == 0
        assert len(rsps_lib.calls) == 4

    @rsps_lib.activate
    def test_401_not_retried_fails_immediately(self, mocker):
        mocker.patch("time.sleep")
        rsps_lib.add(rsps_lib.POST, INGEST_URL, status=401)

        from ingest_client import post_events

        result = post_events(_make_events(1))

        # 401 is not retriable; post_events catches and logs, returns 0 inserted
        assert result["inserted"] == 0
        assert len(rsps_lib.calls) == 1

    @rsps_lib.activate
    def test_skipped_events_accumulated_across_batches(self):
        skipped_1 = [{"index": 0, "reason": "County not found"}]
        rsps_lib.add(rsps_lib.POST, INGEST_URL, json={"inserted": 499, "skipped": skipped_1})
        rsps_lib.add(rsps_lib.POST, INGEST_URL, json={"inserted": 98, "skipped": [{"index": 2, "reason": "Topic not found"}]})

        from ingest_client import post_events

        result = post_events(_make_events(600))

        assert result["inserted"] == 597
        assert len(result["skipped"]) == 2
