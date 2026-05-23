import os
import sys

# Set required env vars before any scraper module is imported so config.py can
# read them without raising a KeyError.
os.environ.setdefault("SCRAPER_API_KEY", "test-api-key-32-characters-longxx")
os.environ.setdefault("INGEST_URL", "http://testserver/api/ingest/events")
os.environ.setdefault("DEDUP_DB_PATH", ":memory:")

# Ensure the scraper root is on sys.path so imports like `from config import ...` work
_SCRAPER_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SCRAPER_ROOT not in sys.path:
    sys.path.insert(0, _SCRAPER_ROOT)
