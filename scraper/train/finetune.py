"""
Phase 2 fine-tuning script.

Run manually after collecting ~1,500 human-labeled ScrapedArticle rows:
    python scraper/train/finetune.py \
        --db-url postgres://nyayo:password@localhost:5432/nyayo_sentinel \
        --output-dir scraper/models/kenya-sentiment-v1

Requirements (install before running):
    pip install psycopg2-binary datasets scikit-learn evaluate accelerate
"""
import argparse
import json
from pathlib import Path

BASE_MODEL = "Davlan/afro-xlmr-large"  # multilingual, covers English + Swahili

LABEL2ID = {"NEGATIVE": 0, "NEUTRAL": 1, "POSITIVE": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}


def load_data(db_url: str) -> list[dict]:
    import psycopg2

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT title, body, "humanLabel"
        FROM "ScrapedArticle"
        WHERE labeled = true AND "humanLabel" IS NOT NULL
        """
    )
    rows = cur.fetchall()
    conn.close()
    return [{"text": f"{r[0]}. {r[1]}", "label": LABEL2ID[r[2]]} for r in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-url", required=True)
    parser.add_argument("--output-dir", default="models/kenya-sentiment-v1")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()

    from datasets import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )
    import evaluate
    import numpy as np

    print("Loading labeled data from DB …")
    rows = load_data(args.db_url)
    print(f"  {len(rows)} labeled examples loaded")
    if len(rows) < 100:
        print("WARNING: Very few examples — results will be unreliable. Aim for 1,500+.")

    dataset = Dataset.from_list(rows)
    split = dataset.train_test_split(test_size=0.2, seed=42)

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

    def tokenize(batch: dict) -> dict:
        return tokenizer(batch["text"], truncation=True, max_length=512)

    tokenized = split.map(tokenize, batched=True)

    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    accuracy = evaluate.load("accuracy")
    f1 = evaluate.load("f1")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {
            "accuracy": accuracy.compute(predictions=preds, references=labels)["accuracy"],
            "f1":       f1.compute(predictions=preds, references=labels, average="weighted")["f1"],
        }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        logging_steps=10,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["test"],
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    print("Fine-tuning …")
    trainer.train()

    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    # Write a pointer so nlp/sentiment.py knows to use the local model
    config_path = output_dir / "scraper_model_config.json"
    config_path.write_text(json.dumps({"model_path": str(output_dir.resolve())}))

    print(f"\nDone. Model saved to {output_dir}")
    print("To use: set MODEL_PATH env var to", output_dir.resolve())
    print("  then update nlp/sentiment.py MODEL_NAME to read from MODEL_PATH")


if __name__ == "__main__":
    main()
