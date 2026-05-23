-- Add missing indexes for Alert.topicId, Alert.triggeredAt, AuditLog queries
CREATE INDEX IF NOT EXISTS "Alert_topicId_idx" ON "Alert"("topicId");
CREATE INDEX IF NOT EXISTS "Alert_triggeredAt_idx" ON "Alert"("triggeredAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");
