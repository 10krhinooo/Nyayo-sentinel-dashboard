import logging
import time
from datetime import datetime, timezone

import requests

from scrapers.base import Article, BaseScraper

log = logging.getLogger(__name__)

_SUBREDDIT = "Kenya"
_POST_LIMIT = 100
_API_URL = f"https://www.reddit.com/r/{_SUBREDDIT}/new.json?limit={_POST_LIMIT}"
_HEADERS = {"User-Agent": "nyayo-sentinel/1.0 (public read-only)"}


class RedditScraper(BaseScraper):
    source_name = "reddit_kenya"

    def fetch(self) -> list[Article]:
        articles: list[Article] = []
        try:
            resp = requests.get(_API_URL, headers=_HEADERS, timeout=15)
            resp.raise_for_status()
            posts = resp.json()["data"]["children"]
            for post in posts:
                d = post["data"]
                url = f"https://www.reddit.com{d['permalink']}"
                body = d.get("selftext") or d.get("title", "")
                articles.append(Article(
                    url=url,
                    title=d.get("title", ""),
                    body=body,
                    published_at=datetime.fromtimestamp(d["created_utc"], tz=timezone.utc),
                    source_name=self.source_name,
                ))
                time.sleep(0.05)  # polite delay
        except Exception as exc:
            log.warning("Reddit scrape failed: %s", exc)
        return articles
