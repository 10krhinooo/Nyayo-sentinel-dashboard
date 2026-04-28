import logging

import requests

from config import INGEST_URL, SCRAPER_API_KEY

log = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    "X-API-Key": SCRAPER_API_KEY,
    "Content-Type": "application/json",
})

_BATCH_SIZE = 500


def post_events(events: list[dict]) -> dict:
    """POST events to backend in batches of 500. Returns aggregated result."""
    result: dict = {"inserted": 0, "skipped": []}
    for i in range(0, len(events), _BATCH_SIZE):
        chunk = events[i : i + _BATCH_SIZE]
        try:
            resp = _SESSION.post(INGEST_URL, json={"events": chunk}, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            result["inserted"] += data.get("inserted", 0)
            result["skipped"].extend(data.get("skipped", []))
        except requests.RequestException as exc:
            body = exc.response.text if hasattr(exc, "response") and exc.response is not None else ""
            log.error("Ingest POST failed (batch %d): %s — %s", i // _BATCH_SIZE, exc, body)
    return result
