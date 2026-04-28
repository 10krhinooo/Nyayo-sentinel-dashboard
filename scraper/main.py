import logging
import time

import schedule

from config import SCRAPE_INTERVAL_MINUTES
from dedup import init_db, is_seen, mark_seen, purge_old
from ingest_client import post_events
from nlp.county_detector import detect_county
from nlp.sentiment import analyze
from nlp.topic_detector import detect_topics
from scrapers.reddit_kenya import RedditScraper
from scrapers.rss_feeds import RssFeedScraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("main")

SCRAPERS = [RssFeedScraper(), RedditScraper()]


def run_pipeline() -> None:
    log.info("=== Scrape cycle starting ===")
    all_events: list[dict] = []

    for scraper in SCRAPERS:
        log.info("Scraping %s …", scraper.source_name)
        try:
            articles = scraper.fetch()
        except Exception as exc:
            log.warning("%s scraper raised: %s", scraper.source_name, exc)
            continue

        log.info("  %d articles fetched from %s", len(articles), scraper.source_name)
        new_count = 0

        for article in articles:
            if is_seen(article.url):
                continue

            text = f"{article.title}. {article.body}"
            county = detect_county(text)
            topics = detect_topics(text)

            mark_seen(article.url)

            if county is None:
                log.debug("No county detected: %s", article.url)
                continue
            if not topics:
                log.debug("No topics detected: %s", article.url)
                continue

            sentiment = analyze(text)

            for topic in topics:
                all_events.append({
                    "countyName":     county,
                    "topicName":      topic,
                    "sentimentScore": sentiment["score"],
                    "sentimentLabel": sentiment["label"],
                    "source":         article.source_name,
                    "timestamp":      article.published_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "volumeWeight":   1,
                })
            new_count += 1

        log.info("  %d new articles processed from %s", new_count, scraper.source_name)

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
    log.info("=== Scrape cycle done ===")


if __name__ == "__main__":
    init_db()
    run_pipeline()  # run immediately on startup

    schedule.every(SCRAPE_INTERVAL_MINUTES).minutes.do(run_pipeline)
    log.info("Scheduler running — every %d minutes", SCRAPE_INTERVAL_MINUTES)

    while True:
        schedule.run_pending()
        time.sleep(30)
