-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_countyId_idx" ON "Alert"("countyId");

-- CreateIndex
CREATE INDEX "SentimentEvent_timestamp_idx" ON "SentimentEvent"("timestamp");

-- CreateIndex
CREATE INDEX "SentimentEvent_countyId_idx" ON "SentimentEvent"("countyId");

-- CreateIndex
CREATE INDEX "SentimentEvent_topicId_idx" ON "SentimentEvent"("topicId");
