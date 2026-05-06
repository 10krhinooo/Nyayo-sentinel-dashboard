-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "llmSummary" TEXT;

-- AlterTable
ALTER TABLE "SentimentEvent" ADD COLUMN     "headline" VARCHAR(220),
ADD COLUMN     "snippet" VARCHAR(500);
