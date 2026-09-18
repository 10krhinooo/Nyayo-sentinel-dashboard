FROM python:3.11-slim

WORKDIR /app

# Install ML dependencies first — large layer, cache it separately
COPY requirements-ml.txt .
RUN pip install --no-cache-dir -r requirements-ml.txt

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake model weights into the image so the container starts instantly and can
# run without outbound internet. MUST match nlp/sentiment.py MODEL_NAME.
ARG SENTIMENT_MODEL=cardiffnlp/twitter-xlm-roberta-base-sentiment
ENV SENTIMENT_MODEL=$SENTIMENT_MODEL
RUN python -c "\
import os; \
from transformers import pipeline; \
pipeline('sentiment-analysis', model=os.environ['SENTIMENT_MODEL'], top_k=None)"

COPY . .

# Run as an unprivileged user rather than root.
RUN useradd --create-home --uid 10001 scraper \
    && mkdir -p /data \
    && chown -R scraper:scraper /app /data
USER scraper

VOLUME ["/data"]

CMD ["python", "main.py"]
