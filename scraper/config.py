import os
from dotenv import load_dotenv

load_dotenv()

SCRAPER_API_KEY = os.environ["SCRAPER_API_KEY"]
INGEST_URL = os.environ.get("INGEST_URL", "http://localhost:4000/api/ingest/events")
SCRAPE_INTERVAL_MINUTES = int(os.environ.get("SCRAPE_INTERVAL_MINUTES", "60"))
DEDUP_DB_PATH = os.environ.get("DEDUP_DB_PATH", "/data/scraper_dedup.db")

REDDIT_CLIENT_ID = os.environ.get("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.environ.get("REDDIT_CLIENT_SECRET", "")

FACEBOOK_ENABLED = os.environ.get("FACEBOOK_ENABLED", "true").lower() not in ("false", "0", "no")
FACEBOOK_COOKIES = os.environ.get("FACEBOOK_COOKIES", "")

INSTAGRAM_ENABLED  = os.environ.get("INSTAGRAM_ENABLED", "true").lower() not in ("false", "0", "no")
INSTAGRAM_USERNAME = os.environ.get("INSTAGRAM_USERNAME", "")
INSTAGRAM_PASSWORD = os.environ.get("INSTAGRAM_PASSWORD", "")
INSTAGRAM_MAX_POSTS = int(os.environ.get("INSTAGRAM_MAX_POSTS", "30"))

COUNTY_NAMES: list[str] = [
    "Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita-Taveta",
    "Garissa", "Wajir", "Mandera", "Marsabit", "Isiolo", "Meru",
    "Tharaka-Nithi", "Embu", "Kitui", "Machakos", "Makueni",
    "Nyandarua", "Nyeri", "Kirinyaga", "Murang'a", "Kiambu",
    "Turkana", "West Pokot", "Samburu", "Trans-Nzoia", "Uasin Gishu",
    "Elgeyo-Marakwet", "Nandi", "Baringo", "Laikipia", "Nakuru",
    "Narok", "Kajiado", "Kericho", "Bomet", "Kakamega", "Vihiga",
    "Bungoma", "Busia", "Siaya", "Kisumu", "Homa Bay", "Migori",
    "Kisii", "Nyamira", "Nairobi",
]

TOPIC_NAMES: list[str] = [
    "Healthcare", "Education", "Land & Housing", "Water & Sanitation",
    "Roads & Transport", "Security & Police", "Corruption", "Agriculture",
    "Youth Unemployment", "Taxation & Revenue", "Devolution", "Food Security",
]
