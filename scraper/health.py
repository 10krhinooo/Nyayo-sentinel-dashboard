"""Per-scraper health tracking. In-memory; written to health.json after each cycle."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)

_HEALTH_FILE = Path("scraper_health.json")

_state: dict[str, dict] = {}


def record_success(scraper_name: str, article_count: int) -> None:
    entry = _state.setdefault(scraper_name, {"consecutive_failures": 0, "total_articles_this_cycle": 0})
    entry["last_success"] = datetime.now(timezone.utc).isoformat()
    entry["consecutive_failures"] = 0
    entry["total_articles_this_cycle"] += article_count


def record_failure(scraper_name: str, error: str) -> None:
    entry = _state.setdefault(scraper_name, {"consecutive_failures": 0, "total_articles_this_cycle": 0})
    entry["consecutive_failures"] = entry.get("consecutive_failures", 0) + 1
    entry["last_error"] = error
    if entry["consecutive_failures"] >= 3:
        log.warning("SCRAPER UNHEALTHY: %s has failed %d consecutive times (last: %s)",
                    scraper_name, entry["consecutive_failures"], error)


def reset_cycle_counts() -> None:
    for entry in _state.values():
        entry["total_articles_this_cycle"] = 0


def dump() -> None:
    try:
        _HEALTH_FILE.write_text(json.dumps(_state, indent=2))
    except OSError as exc:
        log.debug("Could not write health file: %s", exc)


def get_health() -> dict:
    return dict(_state)
