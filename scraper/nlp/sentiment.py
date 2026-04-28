import threading
from typing import TypedDict

_lock = threading.Lock()
_pipe = None

MODEL_NAME = "cardiffnlp/twitter-xlm-roberta-base-sentiment"


def _get_pipeline():
    global _pipe
    with _lock:
        if _pipe is None:
            from transformers import pipeline  # deferred import so tests can mock it
            _pipe = pipeline(
                "sentiment-analysis",
                model=MODEL_NAME,
                top_k=None,
                truncation=True,
                max_length=512,
            )
    return _pipe


class SentimentResult(TypedDict):
    label: str   # "POSITIVE" | "NEUTRAL" | "NEGATIVE"
    score: float  # -1.0 to 1.0


def analyze(text: str) -> SentimentResult:
    """Classify sentiment of text. Returns label and score in [-1, 1]."""
    pipe = _get_pipeline()
    # Cap to 1024 chars before tokenisation (tokeniser still truncates at 512 tokens)
    results: list[dict] = pipe(text[:1024])[0]  # type: ignore[index]

    scores = {r["label"].lower(): r["score"] for r in results}

    raw_label = max(scores, key=lambda k: scores[k])
    label_map = {"positive": "POSITIVE", "neutral": "NEUTRAL", "negative": "NEGATIVE"}
    label = label_map.get(raw_label, "NEUTRAL")

    # Map to [-1, 1]: positive confidence minus negative confidence
    score = round(scores.get("positive", 0.0) - scores.get("negative", 0.0), 4)

    return SentimentResult(label=label, score=score)
