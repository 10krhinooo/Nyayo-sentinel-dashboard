import { Router } from "express";
import { z } from "zod";
import { AlertSeverity, AlertStatus, MetricType, TriggerType, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles } from "../middleware/auth";
import { audit } from "../middleware/audit";
import { sendAlertEmail } from "../services/email";
import { generateAlertSummary } from "../services/llm";
import { TOPIC_CONTEXT, type AlertStats } from "../types/topicContext";

const router = Router();

const PAGE_LIMIT = 20;

router.get(
  "/",
  authenticate(true),
  audit("VIEW_ALERTS", "ALERT"),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? String(PAGE_LIMIT)), 10) || PAGE_LIMIT));
      const skip = (page - 1) * limit;

      const where: { countyId?: string } = {};
      if (req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId) {
        where.countyId = req.user.countyId;
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
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/thresholds",
  authenticate(),
  requireRoles([UserRole.NATIONAL_ADMIN]),
  audit("VIEW_ALERT_THRESHOLDS", "ALERT_THRESHOLD"),
  async (_req, res) => {
    try {
      const thresholds = await prisma.alertThreshold.findMany({
        include: { county: true, topic: true }
      });
      return res.json({ thresholds });
    } catch {
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
  authenticate(),
  requireRoles([UserRole.NATIONAL_ADMIN]),
  audit("UPDATE_ALERT_THRESHOLDS", "ALERT_THRESHOLD"),
  async (req, res) => {
    try {
      const parsed = thresholdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
      }

      const { countyId, topicId, metricType, thresholdVal, severity, active } = parsed.data;
      const threshold = await prisma.alertThreshold.create({
        data: {
          countyId: countyId ?? null,
          topicId: topicId ?? null,
          metricType,
          thresholdVal,
          severity,
          active: active ?? true
        }
      });

      return res.status(201).json({ threshold });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

const statusSchema = z.object({
  status: z.nativeEnum(AlertStatus)
});

router.patch(
  "/:id/status",
  authenticate(),
  audit("UPDATE_ALERT_STATUS", "ALERT"),
  async (req, res) => {
    try {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid status", errors: parsed.error.flatten().fieldErrors });
      }

      const { id } = req.params;
      const alert = await prisma.alert.update({
        where: { id },
        data: { status: parsed.data.status }
      });
      return res.json({ alert });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/:id/details",
  authenticate(),
  audit("VIEW_ALERT_DETAILS", "ALERT"),
  async (req, res) => {
    try {
      const alert = await prisma.alert.findUnique({
        where: { id: req.params.id },
        include: { county: true, topic: true }
      });
      if (!alert) return res.status(404).json({ message: "Alert not found" });

      if (req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId && alert.countyId !== req.user.countyId) {
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

      let triggerExplanation: string;
      if (alert.triggerType === TriggerType.THRESHOLD) {
        const pct = total === 0 ? 0 : (100 * negCount) / total;
        triggerExplanation = `${pct.toFixed(1)}% negative sentiment (${negCount} of ${total} events) exceeded the configured threshold in the 24-hour window.`;
      } else {
        const m = alert.summary.match(/factor\s+([\d.]+)/);
        const factor = m ? parseFloat(m[1]) : null;
        const baseline = factor ? Math.round(total / factor) : null;
        triggerExplanation = factor
          ? `Volume spiked ${factor.toFixed(1)}× above 24-hour baseline (${total} vs ~${baseline} events).`
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
        llmSummary:         alert.llmSummary ?? null
      });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export async function evaluateAlertThresholds(io?: import("socket.io").Server) {
  const thresholds = await prisma.alertThreshold.findMany({
    where: { active: true }
  });

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Fetch distinct county IDs once, reuse across all thresholds
  const allCountyIds = (
    await prisma.sentimentEvent.findMany({
      where: { timestamp: { gte: oneDayAgo } },
      select: { countyId: true },
      distinct: ["countyId"]
    })
  ).map((r) => r.countyId);

  for (const th of thresholds) {
    const countyIdsToEvaluate = th.countyId ? [th.countyId] : allCountyIds;

    if (th.metricType === MetricType.NEGATIVE_PERCENT) {
      for (const countyId of countyIdsToEvaluate) {
        const where: { timestamp: object; countyId: string; topicId?: string } = {
          timestamp: { gte: oneDayAgo },
          countyId
        };
        if (th.topicId) where.topicId = th.topicId;

        const [negCount, totalCount] = await Promise.all([
          prisma.sentimentEvent.count({
            where: { ...where, sentimentLabel: "NEGATIVE" }
          }),
          prisma.sentimentEvent.count({ where })
        ]);

        const percent = totalCount === 0 ? 0 : (100 * negCount) / totalCount;
        if (percent < th.thresholdVal) continue;

        const existing = await prisma.alert.findFirst({
          where: {
            countyId,
            topicId: th.topicId ?? null,
            triggerType: TriggerType.THRESHOLD,
            status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }
          }
        });
        if (existing) continue;

        const alert = await prisma.alert.create({
          data: {
            countyId,
            topicId: th.topicId ?? null,
            severity: th.severity,
            triggerType: TriggerType.THRESHOLD,
            summary: `Negative sentiment ${percent.toFixed(1)}% exceeded threshold ${th.thresholdVal}%`
          },
          include: { county: true, topic: true }
        });

        if (io) {
          io.sockets.sockets.forEach((socket) => {
            const socketUser = socket.data.user as { countyId?: string | null } | undefined;
            if (!socketUser) return;
            if (socketUser.countyId == null || socketUser.countyId === countyId) {
              socket.emit("alert:new", alert);
            }
          });
        }

        const rawThresholdEvents = await prisma.sentimentEvent.findMany({
          where,
          select: { sentimentScore: true, source: true }
        });
        const thAvgScore = rawThresholdEvents.length === 0
          ? null
          : rawThresholdEvents.reduce((s, e) => s + e.sentimentScore, 0) / rawThresholdEvents.length;
        const thSrcMap = new Map<string, number>();
        for (const e of rawThresholdEvents) thSrcMap.set(e.source, (thSrcMap.get(e.source) ?? 0) + 1);
        const thresholdStats: AlertStats = {
          eventCount:      totalCount,
          negativeCount:   negCount,
          negativePercent: totalCount === 0 ? 0 : Math.round((1000 * negCount) / totalCount) / 10,
          avgScore:        thAvgScore !== null ? Math.round(thAvgScore * 100) / 100 : null,
          sources:         [...thSrcMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([source, count]) => ({ source, count }))
        };

        void notifyAlertRecipients(alert, thresholdStats);
      }
    }

    if (th.metricType === MetricType.SPIKE_FACTOR) {
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      for (const countyId of countyIdsToEvaluate) {
        const recentWhere: { timestamp: object; countyId: string; topicId?: string } = {
          timestamp: { gte: oneDayAgo },
          countyId
        };
        const baselineWhere: { timestamp: object; countyId: string; topicId?: string } = {
          timestamp: { gte: twoDaysAgo, lt: oneDayAgo },
          countyId
        };
        if (th.topicId) {
          recentWhere.topicId = th.topicId;
          baselineWhere.topicId = th.topicId;
        }

        const [recentCount, baselineCount] = await Promise.all([
          prisma.sentimentEvent.count({ where: recentWhere }),
          prisma.sentimentEvent.count({ where: baselineWhere })
        ]);

        if (baselineCount <= 0) continue;

        const factor = recentCount / baselineCount;
        if (factor < th.thresholdVal) continue;

        const existing = await prisma.alert.findFirst({
          where: {
            countyId,
            topicId: th.topicId ?? null,
            triggerType: TriggerType.SPIKE,
            status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }
          }
        });
        if (existing) continue;

        const alert = await prisma.alert.create({
          data: {
            countyId,
            topicId: th.topicId ?? null,
            severity: th.severity,
            triggerType: TriggerType.SPIKE,
            summary: `Complaint volume spiked by factor ${factor.toFixed(2)} (threshold ${th.thresholdVal}x)`
          },
          include: { county: true, topic: true }
        });

        if (io) {
          io.sockets.sockets.forEach((socket) => {
            const socketUser = socket.data.user as { countyId?: string | null } | undefined;
            if (!socketUser) return;
            if (socketUser.countyId == null || socketUser.countyId === countyId) {
              socket.emit("alert:new", alert);
            }
          });
        }

        const [rawSpikeEvents, spikeNegCount] = await Promise.all([
          prisma.sentimentEvent.findMany({
            where: recentWhere,
            select: { sentimentScore: true, source: true }
          }),
          prisma.sentimentEvent.count({ where: { ...recentWhere, sentimentLabel: "NEGATIVE" } })
        ]);
        const spikeAvgScore = rawSpikeEvents.length === 0
          ? null
          : rawSpikeEvents.reduce((s, e) => s + e.sentimentScore, 0) / rawSpikeEvents.length;
        const spikeSrcMap = new Map<string, number>();
        for (const e of rawSpikeEvents) spikeSrcMap.set(e.source, (spikeSrcMap.get(e.source) ?? 0) + 1);
        const spikeStats: AlertStats = {
          eventCount:      recentCount,
          negativeCount:   spikeNegCount,
          negativePercent: recentCount === 0 ? 0 : Math.round((1000 * spikeNegCount) / recentCount) / 10,
          avgScore:        spikeAvgScore !== null ? Math.round(spikeAvgScore * 100) / 100 : null,
          sources:         [...spikeSrcMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([source, count]) => ({ source, count }))
        };

        void notifyAlertRecipients(alert, spikeStats);
      }
    }
  }
}

async function notifyAlertRecipients(
  alert: { id: string; countyId: string; topicId?: string | null; summary: string; severity: string; triggeredAt: Date; county?: { name: string } | null; topic?: { name: string } | null },
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
        triggerType: alert.summary.startsWith("Complaint volume") ? "SPIKE" : "THRESHOLD",
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
