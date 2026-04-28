import logging
import time
from datetime import datetime, timezone

import feedparser
import requests
from bs4 import BeautifulSoup

from scrapers.base import Article, BaseScraper

log = logging.getLogger(__name__)

FEEDS = [
    ("nation_africa",   "https://nation.africa/kenya/rss.xml"),
    ("standard_media",  "https://www.standardmedia.co.ke/rss/kenya.xml"),
    ("citizen_tv",      "https://citizentv.co.ke/feed/"),
    ("kbc",             "https://www.kbc.co.ke/feed/"),
    # Swahili-language sources
    ("taifa_leo",       "https://taifaleodaily.co.ke/feed/"),
    ("kbc_kiswahili",   "https://www.kbc.co.ke/category/kiswahili/feed/"),
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NyayoSentinelBot/1.0; "
        "+https://github.com/nyayo-sentinel)"
    )
}
_REQUEST_TIMEOUT = 15
_POLITE_DELAY = 1.0  # seconds between full-body fetches


def _parse_date(entry: feedparser.FeedParserDict) -> datetime:
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _fetch_body(url: str) -> str:
    """Fetch first two paragraphs from article URL as plain text."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        paragraphs = soup.select("p")[:5]
        return " ".join(p.get_text(" ", strip=True) for p in paragraphs)
    except Exception as exc:
        log.debug("Body fetch failed for %s: %s", url, exc)
        return ""


class RssFeedScraper(BaseScraper):
    source_name = "rss"

    def fetch(self) -> list[Article]:
        articles: list[Article] = []
        for source_name, feed_url in FEEDS:
            try:
                feed = feedparser.parse(feed_url)
            except Exception as exc:
                log.warning("RSS parse failed for %s: %s", feed_url, exc)
                continue

            for entry in feed.entries:
                url = getattr(entry, "link", None)
                if not url:
                    continue

                title = getattr(entry, "title", "")
                # Use RSS summary if present, otherwise fetch full body
                summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
                if len(summary) < 100:
                    time.sleep(_POLITE_DELAY)
                    body = _fetch_body(url)
                else:
                    body = BeautifulSoup(summary, "lxml").get_text(" ", strip=True)

                articles.append(Article(
                    url=url,
                    title=title,
                    body=body,
                    published_at=_parse_date(entry),
                    source_name=source_name,
                ))

        return articles
