import hashlib
import sqlite3
import time

from config import DEDUP_DB_PATH


def _conn() -> sqlite3.Connection:
    return sqlite3.connect(DEDUP_DB_PATH)


def init_db() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS seen_urls (
                url_hash TEXT PRIMARY KEY,
                seen_at  REAL NOT NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_seen_at ON seen_urls(seen_at)")


def _hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


def is_seen(url: str) -> bool:
    with _conn() as con:
        row = con.execute(
            "SELECT 1 FROM seen_urls WHERE url_hash = ?", (_hash(url),)
        ).fetchone()
    return row is not None


def mark_seen(url: str) -> None:
    with _conn() as con:
        con.execute(
            "INSERT OR IGNORE INTO seen_urls (url_hash, seen_at) VALUES (?, ?)",
            (_hash(url), time.time()),
        )


def purge_old(days: int = 30) -> None:
    cutoff = time.time() - days * 86400
    with _conn() as con:
        con.execute("DELETE FROM seen_urls WHERE seen_at < ?", (cutoff,))
