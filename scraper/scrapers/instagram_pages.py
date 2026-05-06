import logging
import time
from datetime import timezone
from itertools import islice

from config import INSTAGRAM_MAX_POSTS, INSTAGRAM_PASSWORD, INSTAGRAM_USERNAME
from scrapers.base import Article, BaseScraper

log = logging.getLogger(__name__)
logging.getLogger("instaloader").setLevel(logging.ERROR)

_TARGET_ACCOUNTS  = ["nairobi_gossip_club"]
_INTER_POST_DELAY = 0.5
_INTER_ACCT_DELAY = 2.0
_TITLE_MAX_LEN    = 120


def _make_title(caption: str) -> str:
    first_line = caption.splitlines()[0].strip() if caption else ""
    return first_line[:_TITLE_MAX_LEN]


class InstagramScraper(BaseScraper):
    source_name = "instagram_nairobi_gossip_club"

    def fetch(self) -> list[Article]:
        try:
            import instaloader
            from instaloader.exceptions import (
                ConnectionException,
                LoginException,
                ProfileNotExistsException,
                QueryReturnedNotFoundException,
                TooManyRequestsException,
            )
        except ImportError as exc:
            log.warning("instaloader not installed — skipping Instagram scrape: %s", exc)
            return []

        loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
        )

        if INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD:
            try:
                loader.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
                log.info("Instagram: logged in as %s", INSTAGRAM_USERNAME)
            except LoginException as exc:
                log.warning(
                    "Instagram login failed — proceeding unauthenticated (public profiles only): %s", exc
                )
        else:
            log.info("Instagram: no credentials set — fetching public profiles unauthenticated")

        articles: list[Article] = []

        for username in _TARGET_ACCOUNTS:
            try:
                profile = instaloader.Profile.from_username(loader.context, username)
            except ProfileNotExistsException:
                log.warning("Instagram: profile not found: @%s", username)
                continue
            except (QueryReturnedNotFoundException, ConnectionException) as exc:
                log.warning("Instagram: could not load @%s: %s", username, exc)
                continue

            try:
                for post in islice(profile.get_posts(), INSTAGRAM_MAX_POSTS):
                    caption = (post.caption or "").strip()
                    if not caption:
                        time.sleep(_INTER_POST_DELAY)
                        continue

                    articles.append(Article(
                        url=f"https://www.instagram.com/p/{post.shortcode}/",
                        title=_make_title(caption),
                        body=caption,
                        published_at=post.date_utc.replace(tzinfo=timezone.utc),
                        source_name=self.source_name,
                    ))
                    time.sleep(_INTER_POST_DELAY)

                log.debug("Instagram: collected %d posts from @%s", len(articles), username)

            except TooManyRequestsException:
                log.warning("Instagram: rate-limited on @%s — stopping this cycle", username)
                break
            except (QueryReturnedNotFoundException, ConnectionException) as exc:
                log.warning("Instagram: error fetching posts from @%s: %s", username, exc)
            except Exception as exc:
                log.warning("Instagram: unexpected error for @%s: %s", username, exc)

            time.sleep(_INTER_ACCT_DELAY)

        return articles
