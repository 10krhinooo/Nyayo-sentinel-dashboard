-- Alert engine: structured trigger metadata, cooldown, and volume floor.
--
-- All columns are additive and nullable, so this is reversible by dropping
-- them. Existing alerts keep working; the detail endpoint falls back to the
-- old summary parsing when metricType is null.

ALTER TABLE "Alert" ADD COLUMN "metricType"      "MetricType";
ALTER TABLE "Alert" ADD COLUMN "observedValue"   DOUBLE PRECISION;
ALTER TABLE "Alert" ADD COLUMN "thresholdValue"  DOUBLE PRECISION;
ALTER TABLE "Alert" ADD COLUMN "baselineValue"   DOUBLE PRECISION;
ALTER TABLE "Alert" ADD COLUMN "eventCount"      INTEGER;
ALTER TABLE "Alert" ADD COLUMN "windowStart"     TIMESTAMP(3);
ALTER TABLE "Alert" ADD COLUMN "windowEnd"       TIMESTAMP(3);
ALTER TABLE "Alert" ADD COLUMN "thresholdId"     TEXT;
ALTER TABLE "Alert" ADD COLUMN "lastSeenAt"      TIMESTAMP(3);
ALTER TABLE "Alert" ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1;

-- Backfill what is recoverable from existing rows. triggerType is already a
-- column, so metricType follows from it directly rather than from the prose.
UPDATE "Alert"
   SET "metricType" = CASE
         WHEN "triggerType" = 'THRESHOLD' THEN 'NEGATIVE_PERCENT'::"MetricType"
         ELSE 'SPIKE_FACTOR'::"MetricType"
       END,
       "lastSeenAt" = "triggeredAt";

ALTER TABLE "AlertThreshold" ADD COLUMN "minVolume"       INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "AlertThreshold" ADD COLUMN "cooldownMinutes" INTEGER NOT NULL DEFAULT 360;

-- Scanned in full every five minutes with no index.
CREATE INDEX "AlertThreshold_active_idx" ON "AlertThreshold"("active");

-- Nothing prevented creating the same rule twice, and duplicates mean
-- duplicate alerts and duplicate emails. NULLS NOT DISTINCT is needed because
-- countyId and topicId are nullable and null means "all", which must collide
-- with itself. Requires PostgreSQL 15 or newer.
DELETE FROM "AlertThreshold" a
 USING "AlertThreshold" b
 WHERE a.ctid > b.ctid
   AND a."countyId" IS NOT DISTINCT FROM b."countyId"
   AND a."topicId"  IS NOT DISTINCT FROM b."topicId"
   AND a."metricType" = b."metricType";

ALTER TABLE "AlertThreshold"
  ADD CONSTRAINT "AlertThreshold_scope_metric_key"
  UNIQUE NULLS NOT DISTINCT ("countyId", "topicId", "metricType");
