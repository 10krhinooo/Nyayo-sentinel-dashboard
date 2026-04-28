FROM python:3.11-slim

WORKDIR /app

# Install CPU-only PyTorch first — large layer, cache it separately
RUN pip install --no-cache-dir \
    torch==2.3.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake model weights into the image so the container starts instantly
RUN python -c "\
from transformers import pipeline; \
pipeline('sentiment-analysis', \
model='cardiffnlp/twitter-roberta-base-sentiment-latest', \
top_k=None)"

COPY . .

VOLUME ["/data"]

CMD ["python", "main.py"]
