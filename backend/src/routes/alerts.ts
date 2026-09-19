import { Router } from "express";
import { z } from "zod";
import { AlertSeverity, AlertStatus, MetricType, TriggerType, UserRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireAuth, requireRoles } from "../middleware/auth";
import { resolveScope, countyWhere, canAccessCounty } from "../middleware/scope";

/**
 * National roles see every county's alerts. Membership is decided by role
 * rather than by a null countyId, which a county official can also have.
 */
function isNationalRole(role: UserRole | undefined): boolean {
  return role === UserRole.NATIONAL_ADMIN || role === UserRole.ANALYST;
}
import { audit } from "../middleware/audit";
import { sendAlertEmail } from "../services/email";
import { generateAlertSummary } from "../services/llm";
import { TOPIC_CONTEXT, type AlertStats } from "../types/topicContext";

const router = Router();

const PAGE_LIMIT = 20;

router.get(
  "/",
  requireAuth(),
  resolveScope(),
  audit("VIEW_ALERTS", "ALERT"),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? String(PAGE_LIMIT)), 10) || PAGE_LIMIT));
      const skip = (page - 1) * limit;

      const search = String(req.query.search ?? "").trim();
      const statusQ = String(req.query.status ?? "").trim();
      const startDate = String(req.query.startDate ?? "").trim();
      const endDate = String(req.query.endDate ?? "").trim();

      const validStatuses = Object.values(AlertStatus) as string[];
      const statusFilter = validStatuses.includes(statusQ) ? (statusQ as AlertStatus) : undefined;

      const where: Prisma.AlertWhereInput = { ...countyWhere(req) };
      if (statusFilter) where.status = statusFilter;
      if (startDate || endDate) {
        where.triggeredAt = {};
        if (startDate) where.triggeredAt.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.triggeredAt.lte = end;
        }
      }
      if (search) {
        where.OR = [
          { county: { name: { contains: search, mode: "insensitive" } } },
          { topic: { name: { contains: search, mode: "insensitive" } } },
          { summary: { contains: search, mode: "insensitive" } }
        ];
      }

      const [alerts, total] = await Promise.all([
        prisma.alert.findMany({
          where,
          orderBy: { triggeredAt: "desc" },
          include: { county: true, topic: true },
          skip,
          take: limit
        }),
        prisma.alert.count({ where })
      ]);

      return res.json({ alerts, total, page, limit });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/thresholds",
  requireAuth(),
  requireRoles([UserRole.NATIONAL_ADMIN]),
  audit("VIEW_ALERT_THRESHOLDS", "ALERT_THRESHOLD"),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? "100"), 10) || 100));
      const skip = (page - 1) * limit;

      const [thresholds, total] = await Promise.all([
        prisma.alertThreshold.findMany({
          include: { county: true, topic: true },
          skip,
          take: limit,
        }),
        prisma.alertThreshold.count(),
      ]);
      return res.json({ thresholds, total, page, limit });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

const thresholdSchema = z.object({
  countyId: z.string().optional(),
  topicId: z.string().optional(),
  metricType: z.nativeEnum(MetricType),
  thresholdVal: z.number().refine((v) => v > 0, { message: "thresholdVal must be positive" }),
  severity: z.nativeEnum(AlertSeverity),
  minVolume: z.number().int().min(0).max(100000).optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).optional(),
  active: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (data.metricType === MetricType.NEGATIVE_PERCENT && (data.thresholdVal < 0 || data.thresholdVal > 100)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NEGATIVE_PERCENT must be between 0 and 100", path: ["thresholdVal"] });
  }
  if (data.metricType === MetricType.SPIKE_FACTOR && data.thresholdVal <= 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "SPIKE_FACTOR must be greater than 1", path: ["thresholdVal"] });
  }
});

router.post(
  "/thresholds",
  requireAuth(),
  requireRoles([UserRole.NATIONAL_ADMIN]),
  audit("UPDATE_ALERT_THRESHOLDS", "ALERT_THRESHOLD"),
  async (req, res) => {
    try {
      const parsed = thresholdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
      }

      const {
        countyId, topicId, metricType, thresholdVal, severity, active,
        minVolume, cooldownMinutes
      } = parsed.data;

      const threshold = await prisma.alertThreshold.create({
        data: {
          countyId: countyId ?? null,
          topicId: topicId ?? null,
          metricType,
          thresholdVal,
          severity,
          active: active ?? true,
          ...(minVolume !== undefined ? { minVolume } : {}),
          ...(cooldownMinutes !== undefined ? { cooldownMinutes } : {})
        }
      });

      return res.status(201).json({ threshold });
    } catch (err) {
      // Duplicate rules mean duplicate alerts and duplicate emails, so the
      // database rejects them. Report that as a conflict rather than as an
      // opaque server error.
      if (
        err &&
        typeof err === "object" &&
        (err as { code?: string }).code === "P2002"
      ) {
        return res.status(409).json({
          message: "A threshold for this county, topic and metric already exists."
        });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

const statusSchema = z.object({
  status: z.nativeEnum(AlertStatus)
});

router.patch(
  "/:id/status",
  requireAuth(),
  resolveScope(),
  audit("UPDATE_ALERT_STATUS", "ALERT"),
  async (req, res) => {
    try {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid status", errors: parsed.error.flatten().fieldErrors });
      }

      const { id } = req.params;

      // Previously a blind update by id with no ownership check, so any
      // authenticated county official could acknowledge or resolve an alert
      // belonging to any other county.
      const existing = await prisma.alert.findUnique({
        where: { id },
        select: { id: true, countyId: true }
      });
      if (!existing) {
        return res.status(404).json({ message: "Alert not found" });
      }
      if (!canAccessCounty(req, existing.countyId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const alert = await prisma.alert.update({
        where: { id },
        data: { status: parsed.data.status }
      });
      return res.json({ alert });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/:id/details",
  requireAuth(),
  resolveScope(),
  audit("VIEW_ALERT_DETAILS", "ALERT"),
  async (req, res) => {
    try {
      const alert = await prisma.alert.findUnique({
        where: { id: req.params.id },
        include: { county: true, topic: true }
      });
      if (!alert) return res.status(404).json({ message: "Alert not found" });

      if (!canAccessCounty(req, alert.countyId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const windowStart = new Date(alert.triggeredAt.getTime() - 24 * 60 * 60 * 1000);
      const events = await prisma.sentimentEvent.findMany({
        where: {
          countyId: alert.countyId,
          ...(alert.topicId ? { topicId: alert.topicId } : {}),
          timestamp: { gte: windowStart, lte: alert.triggeredAt }
        },
        select: { sentimentLabel: true, sentimentScore: true, source: true }
      });

      const total    = events.length;
      const negCount = events.filter(e => e.sentimentLabel === "NEGATIVE").length;
      const neuCount = events.filter(e => e.sentimentLabel === "NEUTRAL").length;
      const posCount = events.filter(e => e.sentimentLabel === "POSITIVE").length;
      const avgScore = total === 0 ? 0 : events.reduce((s, e) => s + e.sentimentScore, 0) / total;

      const srcMap = new Map<string, number>();
      for (const e of events) srcMap.set(e.source, (srcMap.get(e.source) ?? 0) + 1);
      const sources = [...srcMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([source, count]) => ({ source, count }));

      // Prefer the values recorded when the rule fired. Alerts created before
      // those columns existed fall back to parsing the summary, which is what
      // the whole code path used to do and why a reworded string broke it.
      let triggerExplanation: string;
      if (alert.triggerType === TriggerType.THRESHOLD) {
        const pct =
          alert.observedValue ?? (total === 0 ? 0 : (100 * negCount) / total);
        const observedCount = alert.eventCount ?? total;
        triggerExplanation = `${pct.toFixed(1)}% negative sentiment (${negCount} of ${observedCount} events) exceeded the configured threshold${
          alert.thresholdValue !== null && alert.thresholdValue !== undefined
            ? ` of ${alert.thresholdValue}%`
            : ""
        } in the 24-hour window.`;
      } else {
        const legacyMatch = alert.summary.match(/factor\s+([\d.]+)/);
        const factor =
          alert.observedValue ?? (legacyMatch ? parseFloat(legacyMatch[1]) : null);
        const baseline =
          alert.baselineValue ?? (factor ? Math.round(total / factor) : null);
        triggerExplanation = factor
          ? `Volume spiked ${factor.toFixed(1)}× above the 24-hour baseline (${
              alert.eventCount ?? total
            } vs ~${baseline} events).`
          : `Complaint volume spiked significantly in the 24-hour window (${total} events).`;
      }

      return res.json({
        eventCount:      total,
        negativeCount:   negCount,
        neutralCount:    neuCount,
        positiveCount:   posCount,
        negativePercent: total === 0 ? 0 : Math.round((1000 * negCount) / total) / 10,
        neutralPercent:  total === 0 ? 0 : Math.round((1000 * neuCount)  / total) / 10,
        positivePercent: total === 0 ? 0 : Math.round((1000 * posCount)  / total) / 10,
        avgScore:        Math.round(avgScore * 100) / 100,
        sources,
        topicContext:       alert.topic?.name ? (TOPIC_CONTEXT[alert.topic.name] ?? null) : null,
        triggerExplanation,
        occurrenceCount:    alert.occurrenceCount,
        lastSeenAt:         alert.lastSeenAt,
        llmSummary:         alert.llmSummary ?? null
      });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

/**
 * Per (county, topic) aggregate over the evaluation windows.
 *
 * One row per pair, computed in a single pass, replacing the previous
 * threshold x county loop that issued two counts plus a findMany per
 * combination: roughly 282 round trips every five minutes at 6 thresholds
 * across 47 counties.
 */
interface WindowAggregate {
  countyId: string;
  topicId: string;
  recentTotal: number;
  recentNegative: number;
  recentScoreSum: number;
  baselineTotal: number;
}

async function loadWindowAggregates(
  recentFrom: Date,
  baselineFrom: Date
): Promise<WindowAggregate[]> {
  const rows = await prisma.$queryRaw<
    {
      countyId: string;
      topicId: string;
      recent_total: bigint;
      recent_negative: bigint;
      recent_score_sum: number | null;
      baseline_total: bigint;
    }[]
  >`
    SELECT
      "countyId",
      "topicId",
      COUNT(*) FILTER (WHERE "timestamp" >= ${recentFrom})                      AS recent_total,
      COUNT(*) FILTER (WHERE "timestamp" >= ${recentFrom}
                         AND "sentimentLabel" = 'NEGATIVE')                     AS recent_negative,
      SUM("sentimentScore") FILTER (WHERE "timestamp" >= ${recentFrom})         AS recent_score_sum,
      COUNT(*) FILTER (WHERE "timestamp" >= ${baselineFrom}
                         AND "timestamp" < ${recentFrom})                       AS baseline_total
    FROM "SentimentEvent"
    WHERE "timestamp" >= ${baselineFrom}
    GROUP BY "countyId", "topicId"`;

  return rows.map((r) => ({
    countyId: r.countyId,
    topicId: r.topicId,
    recentTotal: Number(r.recent_total),
    recentNegative: Number(r.recent_negative),
    recentScoreSum: Number(r.recent_score_sum ?? 0),
    baselineTotal: Number(r.baseline_total)
  }));
}

/** Collapses per-topic rows to a county total, for rules with no topic. */
function foldToCounty(rows: WindowAggregate[]): Map<string, WindowAggregate> {
  const byCounty = new Map<string, WindowAggregate>();
  for (const r of rows) {
    const acc = byCounty.get(r.countyId);
    if (!acc) {
      byCounty.set(r.countyId, { ...r, topicId: "" });
      continue;
    }
    acc.recentTotal += r.recentTotal;
    acc.recentNegative += r.recentNegative;
    acc.recentScoreSum += r.recentScoreSum;
    acc.baselineTotal += r.baselineTotal;
  }
  return byCounty;
}

/** Top sources for a fired alert, fetched only for combinations that fire. */
async function sourceBreakdown(where: Prisma.SentimentEventWhereInput) {
  const grouped = await prisma.sentimentEvent.groupBy({
    by: ["source"],
    where,
    _count: { _all: true },
    orderBy: { _count: { source: "desc" } },
    take: 5
  });
  return grouped.map((g) => ({ source: g.source, count: g._count._all }));
}

export interface EvaluationResult {
  created: number;
  suppressed: number;
}

export async function evaluateAlertThresholds(
  io?: import("socket.io").Server
): Promise<EvaluationResult> {
  const thresholds = await prisma.alertThreshold.findMany({ where: { active: true } });
  if (thresholds.length === 0) return { created: 0, suppressed: 0 };

  const now = new Date();
  const recentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const baselineFrom = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const aggregates = await loadWindowAggregates(recentFrom, baselineFrom);
  const byCounty = foldToCounty(aggregates);

  let created = 0;
  let suppressed = 0;

  for (const th of thresholds) {
    // A rule with a topic reads the per-topic rows; a rule without one reads
    // the county totals.
    const candidates: WindowAggregate[] = th.topicId
      ? aggregates.filter((a) => a.topicId === th.topicId)
      : [...byCounty.values()];

    const scoped = th.countyId
      ? candidates.filter((a) => a.countyId === th.countyId)
      : candidates;

    for (const agg of scoped) {
      const isSpike = th.metricType === MetricType.SPIKE_FACTOR;

      // Below this, ratios are dominated by sampling noise.
      if (agg.recentTotal < th.minVolume) continue;

      let observed: number;
      let baseline: number | null = null;

      if (isSpike) {
        if (agg.baselineTotal <= 0) continue;
        baseline = agg.baselineTotal;
        observed = agg.recentTotal / agg.baselineTotal;
      } else {
        observed = (100 * agg.recentNegative) / agg.recentTotal;
      }

      if (observed < th.thresholdVal) continue;

      const triggerType = isSpike ? TriggerType.SPIKE : TriggerType.THRESHOLD;
      const cooldownStart = new Date(now.getTime() - th.cooldownMinutes * 60 * 1000);

      // Suppress on recency, not on status. Keying off OPEN or ACKNOWLEDGED
      // meant an alert nobody ever resolved silenced that county and topic
      // permanently.
      const recent = await prisma.alert.findFirst({
        where: {
          countyId: agg.countyId,
          topicId: th.topicId ?? null,
          triggerType,
          triggeredAt: { gte: cooldownStart }
        },
        orderBy: { triggeredAt: "desc" }
      });

      if (recent) {
        // Still true, so record another occurrence rather than another row.
        await prisma.alert.update({
          where: { id: recent.id },
          data: {
            lastSeenAt: now,
            occurrenceCount: { increment: 1 },
            observedValue: observed
          }
        });
        suppressed++;
        continue;
      }

      const summary = isSpike
        ? `Complaint volume spiked by factor ${observed.toFixed(2)} (threshold ${th.thresholdVal}x)`
        : `Negative sentiment ${observed.toFixed(1)}% exceeded threshold ${th.thresholdVal}%`;

      const alert = await prisma.alert.create({
        data: {
          countyId: agg.countyId,
          topicId: th.topicId ?? null,
          severity: th.severity,
          triggerType,
          summary,
          metricType: th.metricType,
          observedValue: observed,
          thresholdValue: th.thresholdVal,
          baselineValue: baseline,
          eventCount: agg.recentTotal,
          windowStart: recentFrom,
          windowEnd: now,
          thresholdId: th.id,
          lastSeenAt: now
        },
        include: { county: true, topic: true }
      });
      created++;

      if (io) {
        emitAlert(io, alert, agg.countyId);
      }

      const statsWhere: Prisma.SentimentEventWhereInput = {
        countyId: agg.countyId,
        ...(th.topicId ? { topicId: th.topicId } : {}),
        timestamp: { gte: recentFrom }
      };

      const stats: AlertStats = {
        eventCount: agg.recentTotal,
        negativeCount: agg.recentNegative,
        negativePercent:
          agg.recentTotal === 0
            ? 0
            : Math.round((1000 * agg.recentNegative) / agg.recentTotal) / 10,
        avgScore:
          agg.recentTotal === 0
            ? null
            : Math.round((agg.recentScoreSum / agg.recentTotal) * 100) / 100,
        sources: await sourceBreakdown(statsWhere)
      };

      void notifyAlertRecipients(alert, stats);
    }
  }

  return { created, suppressed };
}

function emitAlert(io: import("socket.io").Server, alert: unknown, countyId: string) {
  io.sockets.sockets.forEach((socket) => {
    const socketUser = socket.data.user as
      | { role?: UserRole; countyId?: string | null }
      | undefined;
    if (!socketUser) return;
    if (isNationalRole(socketUser.role) || socketUser.countyId === countyId) {
      socket.emit("alert:new", alert);
    }
  });
}

async function notifyAlertRecipients(
  alert: { id: string; countyId: string; topicId?: string | null; summary: string; severity: string; triggerType: TriggerType; triggeredAt: Date; county?: { name: string } | null; topic?: { name: string } | null },
  stats?: AlertStats
) {
  const oneDayAgo = new Date(alert.triggeredAt.getTime() - 24 * 60 * 60 * 1000);

  const snippetEvents = await prisma.sentimentEvent.findMany({
    where: {
      countyId: alert.countyId,
      ...(alert.topicId ? { topicId: alert.topicId } : {}),
      timestamp: { gte: oneDayAgo, lte: alert.triggeredAt },
      headline: { not: null }
    },
    select: { headline: true },
    orderBy: { timestamp: "desc" },
    take: 15
  });
  const headlines = snippetEvents.map((e) => e.headline as string);

  const llmSummary = stats
    ? await generateAlertSummary({
        county:      alert.county?.name ?? alert.countyId,
        topic:       alert.topic?.name ?? null,
        triggerType: alert.triggerType,
        stats,
        headlines
      })
    : null;

  if (llmSummary) {
    await prisma.alert.update({ where: { id: alert.id }, data: { llmSummary } });
  }

  const recipients = await prisma.user.findMany({
    where: {
      OR: [
        { role: UserRole.NATIONAL_ADMIN },
        { role: UserRole.COUNTY_OFFICIAL, countyId: alert.countyId }
      ]
    },
    select: { email: true }
  });
  const emails = recipients.map((u) => u.email);
  if (emails.length > 0) {
    const topicCtx = alert.topic?.name ? (TOPIC_CONTEXT[alert.topic.name] ?? undefined) : undefined;
    await sendAlertEmail(emails, { ...alert, llmSummary: llmSummary ?? undefined }, stats, topicCtx);
  }
}

export default router;
