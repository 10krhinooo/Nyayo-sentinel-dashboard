from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Article:
    url: str
    title: str
    body: str
    published_at: datetime
    source_name: str


class BaseScraper(ABC):
    source_name: str = ""

    @abstractmethod
    def fetch(self) -> list[Article]:
        """Fetch and return new articles. Implementation handles dedup internally."""
