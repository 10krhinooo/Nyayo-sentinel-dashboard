import logging
import time

import requests

from config import INGEST_URL, SCRAPER_API_KEY

log = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    "X-API-Key": SCRAPER_API_KEY,
    "Content-Type": "application/json",
})

_BATCH_SIZE = 500
_RETRY_DELAYS = [2, 4, 8]  # seconds between attempts


def _post_with_retry(chunk: list[dict]) -> dict:
    last_exc: Exception | None = None
    for attempt, delay in enumerate([0] + _RETRY_DELAYS, start=1):
        if delay:
            time.sleep(delay)
        try:
            resp = _SESSION.post(INGEST_URL, json={"events": chunk}, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            last_exc = exc
            is_5xx = (
                hasattr(exc, "response")
                and exc.response is not None
                and exc.response.status_code >= 500
            )
            is_conn = isinstance(exc, (requests.ConnectionError, requests.Timeout))
            if not (is_5xx or is_conn):
                raise
            log.warning("Ingest attempt %d/%d failed: %s", attempt, len(_RETRY_DELAYS) + 1, exc)
    sources = list({e.get("source", "?") for e in chunk[:5]})
    log.error(
        "Ingest batch of %d events failed after all retries. Sources: %s",
        len(chunk), sources,
    )
    raise last_exc  # type: ignore[misc]


def post_events(events: list[dict]) -> dict:
    """POST events to backend in batches of 500 with exponential backoff retry."""
    result: dict = {"inserted": 0, "skipped": []}
    for i in range(0, len(events), _BATCH_SIZE):
        chunk = events[i : i + _BATCH_SIZE]
        try:
            data = _post_with_retry(chunk)
            result["inserted"] += data.get("inserted", 0)
            result["skipped"].extend(data.get("skipped", []))
        except requests.RequestException as exc:
            body = exc.response.text if hasattr(exc, "response") and exc.response is not None else ""
            log.error("Ingest POST permanently failed (batch %d): %s — %s", i // _BATCH_SIZE, exc, body)
    return result
