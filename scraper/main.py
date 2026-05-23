import logging
import time

import schedule

from config import FACEBOOK_ENABLED, INSTAGRAM_ENABLED, SCRAPE_INTERVAL_MINUTES
from dedup import init_db, is_seen, mark_seen, purge_old
from health import dump as dump_health, record_failure, record_success, reset_cycle_counts
from ingest_client import post_events
from nlp.county_detector import detect_county
from nlp.sentiment import analyze
from nlp.topic_detector import detect_topics
from scrapers.facebook_pages import FacebookPagesScraper
from scrapers.instagram_pages import InstagramScraper
from scrapers.reddit_kenya import RedditScraper
from scrapers.rss_feeds import RssFeedScraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("main")

SCRAPERS = [RssFeedScraper(), RedditScraper()]
if FACEBOOK_ENABLED:
    SCRAPERS.append(FacebookPagesScraper())
if INSTAGRAM_ENABLED:
    SCRAPERS.append(InstagramScraper())

_COUNTY_CONFIDENCE_THRESHOLD = 0.65
_TOPIC_CONFIDENCE_THRESHOLD = 0.60

try:
    from langdetect import detect as _langdetect
    from langdetect import LangDetectException

    def detect_language(text: str) -> str:
        try:
            return _langdetect(text[:500])
        except LangDetectException:
            return "en"
except ImportError:
    log.warning("langdetect not installed — language detection disabled")

    def detect_language(text: str) -> str:  # type: ignore[misc]
        return "en"


def run_pipeline() -> None:
    log.info("=== Scrape cycle starting ===")
    reset_cycle_counts()
    all_events: list[dict] = []

    for scraper in SCRAPERS:
        log.info("Scraping %s …", scraper.source_name)
        try:
            articles = scraper.fetch()
            record_success(scraper.source_name, 0)
        except Exception as exc:
            log.warning("%s scraper raised: %s", scraper.source_name, exc)
            record_failure(scraper.source_name, str(exc))
            continue

        log.info("  %d articles fetched from %s", len(articles), scraper.source_name)
        new_count = 0
        filtered_county = 0
        filtered_topic = 0

        for article in articles:
            if is_seen(article.url):
                continue

            text = f"{article.title}. {article.body}"
            lang = detect_language(text)

            county_name, county_confidence = detect_county(text)
            topic_results = detect_topics(text)

            mark_seen(article.url)

            if county_name is None or county_confidence < _COUNTY_CONFIDENCE_THRESHOLD:
                if county_name is None:
                    log.debug("No county detected: %s", article.url)
                else:
                    log.debug("Low county confidence (%.2f): %s", county_confidence, article.url)
                    filtered_county += 1
                continue

            high_confidence_topics = [
                (topic, conf) for topic, conf in topic_results
                if conf >= _TOPIC_CONFIDENCE_THRESHOLD
            ]
            if not high_confidence_topics:
                log.debug("No topics above threshold: %s", article.url)
                filtered_topic += 1
                continue

            sentiment = analyze(text)

            for topic, topic_confidence in high_confidence_topics:
                all_events.append({
                    "countyName":     county_name,
                    "topicName":      topic,
                    "sentimentScore": sentiment["score"],
                    "sentimentLabel": sentiment["label"],
                    "source":         article.source_name,
                    "timestamp":      article.published_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "volumeWeight":   1,
                    "headline":       article.title[:220] if article.title else None,
                    "snippet":        article.body[:500]  if article.body  else None,
                })
            new_count += 1

        record_success(scraper.source_name, new_count)
        log.info(
            "  %d new articles from %s (filtered: %d low-county-conf, %d low-topic-conf)",
            new_count, scraper.source_name, filtered_county, filtered_topic,
        )

    if all_events:
        result = post_events(all_events)
        log.info(
            "Ingest complete — inserted: %d, skipped: %d",
            result["inserted"],
            len(result["skipped"]),
        )
        if result["skipped"]:
            log.debug("Skipped details: %s", result["skipped"][:10])
    else:
        log.info("No new events this cycle")

    purge_old(days=30)
    dump_health()
    log.info("=== Scrape cycle done ===")


if __name__ == "__main__":
    init_db()
    run_pipeline()  # run immediately on startup

    schedule.every(SCRAPE_INTERVAL_MINUTES).minutes.do(run_pipeline)
    log.info("Scheduler running — every %d minutes", SCRAPE_INTERVAL_MINUTES)

    while True:
        schedule.run_pending()
        time.sleep(30)
