import logging
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import feedparser
import requests
from bs4 import BeautifulSoup

from config import FACEBOOK_COOKIES
from scrapers.base import Article, BaseScraper

log = logging.getLogger(__name__)
logging.getLogger("facebook_scraper").setLevel(logging.ERROR)

_POSTS_PER_PAGE = 30  # facebook-scraper "pages" param (each page ≈ 8–12 posts)
_MAX_PAGES = 3

# Major Kenyan public news / civic Facebook pages (page slugs)
_TARGET_PAGES = [
    "NationAfrica",
    "StandardKenya",
    "citizentvkenya",
    "KBCChannel1",
    "TukoKenya",
    "TheStarKenya",
    "KenyaRedCross",
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NyayoSentinelBot/1.0; "
        "+https://github.com/nyayo-sentinel)"
    )
}
_REQUEST_TIMEOUT = 15
_POLITE_DELAY = 0.5
_FALLBACK_LIMIT_PER_SOURCE = 10

_FALLBACK_SOURCES = [
    {
        "source": "facebook_pages:tuko",
        "homepage": "https://www.tuko.co.ke/",
        "link_prefixes": ("https://www.tuko.co.ke/", "https://kiswahili.tuko.co.ke/"),
    },
    {
        "source": "facebook_pages:the_star",
        "homepage": "https://www.the-star.co.ke/",
        "link_prefixes": ("https://www.the-star.co.ke/",),
    },
    {
        "source": "facebook_pages:kenya_red_cross",
        "feed": "https://www.redcross.or.ke/feed/",
    },
]


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _fetch_article_body(url: str) -> tuple[str, datetime]:
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as exc:
        log.debug("Fallback article fetch failed for %s: %s", url, exc)
        return "", datetime.now(timezone.utc)

    paragraphs = soup.select("article p") or soup.select("p")
    body = " ".join(p.get_text(" ", strip=True) for p in paragraphs[:6])
    published = (
        soup.select_one("meta[property='article:published_time']")
        or soup.select_one("meta[name='article:published_time']")
        or soup.select_one("time[datetime]")
    )
    if published and published.name == "meta":
        published_at = _parse_datetime(published.get("content"))
    elif published:
        published_at = _parse_datetime(published.get("datetime"))
    else:
        published_at = datetime.now(timezone.utc)
    return body, published_at


def _feed_articles(source_name: str, feed_url: str) -> list[Article]:
    feed = feedparser.parse(feed_url)
    articles: list[Article] = []
    for entry in feed.entries[:_FALLBACK_LIMIT_PER_SOURCE]:
        url = getattr(entry, "link", None)
        if not url:
            continue
        published_at: datetime | None = None
        if getattr(entry, "published_parsed", None):
            published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
        body = BeautifulSoup(summary, "lxml").get_text(" ", strip=True)
        if len(body) < 100:
            body, fetched_at = _fetch_article_body(url)
            published_at = published_at or fetched_at
        articles.append(Article(
            url=url,
            title=getattr(entry, "title", ""),
            body=body,
            published_at=published_at or datetime.now(timezone.utc),
            source_name=source_name,
        ))
    return articles


def _homepage_articles(source_name: str, homepage: str, link_prefixes: tuple[str, ...]) -> list[Article]:
    try:
        resp = requests.get(homepage, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as exc:
        log.warning("Fallback source failed for %s: %s", homepage, exc)
        return []

    articles: list[Article] = []
    seen: set[str] = set()
    for link in soup.select("a[href]"):
        title = link.get_text(" ", strip=True)
        url = urljoin(homepage, link.get("href", ""))
        if not title or len(title) < 25 or url in seen:
            continue
        if not any(url.startswith(prefix) for prefix in link_prefixes):
            continue
        if any(skip in url for skip in ("/about-us", "/contact", "/privacy", "/tags/", "/authors/")):
            continue

        seen.add(url)
        time.sleep(_POLITE_DELAY)
        body, published_at = _fetch_article_body(url)
        if not body:
            body = title
        articles.append(Article(
            url=url,
            title=title,
            body=body,
            published_at=published_at,
            source_name=source_name,
        ))
        if len(articles) >= _FALLBACK_LIMIT_PER_SOURCE:
            break
    return articles


def _fallback_articles() -> list[Article]:
    articles: list[Article] = []
    for source in _FALLBACK_SOURCES:
        if "feed" in source:
            articles.extend(_feed_articles(source["source"], source["feed"]))
        else:
            articles.extend(_homepage_articles(
                source["source"],
                source["homepage"],
                source["link_prefixes"],
            ))
    return articles


class FacebookPagesScraper(BaseScraper):
    source_name = "facebook_pages"

    def fetch(self) -> list[Article]:
        if not FACEBOOK_COOKIES:
            return _fallback_articles()

        try:
            from facebook_scraper import get_posts, exceptions as fb_exc
        except ImportError as exc:
            log.warning("facebook-scraper import failed — skipping Facebook scrape: %s", exc)
            return _fallback_articles()

        articles: list[Article] = []
        for page_slug in _TARGET_PAGES:
            try:
                for post in get_posts(
                    page_slug,
                    pages=_MAX_PAGES,
                    cookies=FACEBOOK_COOKIES or None,
                    options={"allow_extra_requests": False, "progress": False},
                ):
                    text = (post.get("text") or "").strip()
                    if not text:
                        continue
                    url = post.get("post_url") or f"https://www.facebook.com/{post.get('post_id', '')}"
                    published_at = post.get("time")
                    if published_at is None:
                        continue
                    # Ensure UTC-aware datetime
                    if published_at.tzinfo is None:
                        published_at = published_at.replace(tzinfo=timezone.utc)
                    articles.append(Article(
                        url=url,
                        title="",
                        body=text,
                        published_at=published_at,
                        source_name=self.source_name,
                    ))
                log.debug("  Scraped Facebook/%s", page_slug)
                time.sleep(1.0)  # polite delay between pages
            except fb_exc.TemporarilyBanned:
                log.warning("Facebook temporarily rate-limited — stopping this cycle")
                break
            except Exception as exc:
                log.warning("Facebook scrape failed for %s: %s", page_slug, exc)
        if articles:
            return articles

        fallback = _fallback_articles()
        if fallback:
            log.info("Facebook returned no posts; fetched %d articles from fallback publisher sources", len(fallback))
        return fallback
