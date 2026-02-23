import { Router } from "express";
import { AlertSeverity, AlertStatus, MetricType, TriggerType, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

router.get(
  "/",
  authenticate(true),
  audit("VIEW_ALERTS", "ALERT"),
  async (req, res) => {
    const where: any = {};
    if (req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId) {
      where.countyId = req.user.countyId;
    }
    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { triggeredAt: "desc" },
      include: { county: true, topic: true }
    });
    return res.json({ alerts });
  }
);

router.get(
  "/thresholds",
  authenticate(),
  requireRoles([UserRole.NATIONAL_ADMIN]),
  audit("VIEW_ALERT_THRESHOLDS", "ALERT_THRESHOLD"),
  async (_req, res) => {
    const thresholds = await prisma.alertThreshold.findMany({
      include: { county: true, topic: true }
    });
    return res.json({ thresholds });
  }
);

router.post(
  "/thresholds",
  authenticate(),
  requireRoles([UserRole.NATIONAL_ADMIN]),
  audit("UPDATE_ALERT_THRESHOLDS", "ALERT_THRESHOLD"),
  async (req, res) => {
    const { countyId, topicId, metricType, thresholdVal, severity, active } = req.body as {
      countyId?: string;
      topicId?: string;
      metricType: MetricType;
      thresholdVal: number;
      severity: AlertSeverity;
      active?: boolean;
    };

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
  }
);

router.patch(
  "/:id/status",
  authenticate(),
  audit("UPDATE_ALERT_STATUS", "ALERT"),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" };
    const alert = await prisma.alert.update({
      where: { id },
      data: { status }
    });
    return res.json({ alert });
  }
);

export async function evaluateAlertThresholds(io?: import("socket.io").Server) {
  const thresholds = await prisma.alertThreshold.findMany({
    where: { active: true }
  });

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const th of thresholds) {
    const countyIdsToEvaluate = th.countyId
      ? [th.countyId]
      : (
          await prisma.sentimentEvent.findMany({
            where: { timestamp: { gte: oneDayAgo } },
            select: { countyId: true },
            distinct: ["countyId"]
          })
        ).map((r) => r.countyId);

    if (th.metricType === MetricType.NEGATIVE_PERCENT) {
      for (const countyId of countyIdsToEvaluate) {
        const where: any = { timestamp: { gte: oneDayAgo }, countyId };
        if (th.topicId) where.topicId = th.topicId;

        const [negCount, totalCount] = await Promise.all([
          prisma.sentimentEvent.count({
            where: { ...where, sentimentLabel: "NEGATIVE" }
          }),
          prisma.sentimentEvent.count({ where })
        ]);

        const percent = totalCount === 0 ? 0 : (100 * negCount) / totalCount;
        if (percent < th.thresholdVal) continue;

        // Deduplicate: if an active (OPEN/ACKNOWLEDGED) alert already exists, don't create a new one
        const existing = await prisma.alert.findFirst({
          where: {
            countyId,
            topicId: th.topicId ?? null,
            triggerType: TriggerType.THRESHOLD,
            status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] }
          },
          orderBy: { triggeredAt: "desc" }
        });
        if (existing) continue;

        const alert = await prisma.alert.create({
          data: {
            countyId,
            topicId: th.topicId ?? null,
            severity: th.severity,
            triggerType: TriggerType.THRESHOLD,
            summary: `Negative sentiment ${percent.toFixed(1)}% exceeded threshold ${th.thresholdVal}%`
          }
        });
        io?.emit("alert:new", alert);
      }
    }

    if (th.metricType === MetricType.SPIKE_FACTOR) {
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      for (const countyId of countyIdsToEvaluate) {
        const recentWhere: any = { timestamp: { gte: oneDayAgo }, countyId };
        const baselineWhere: any = {
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
          },
          orderBy: { triggeredAt: "desc" }
        });
        if (existing) continue;

        const alert = await prisma.alert.create({
          data: {
            countyId,
            topicId: th.topicId ?? null,
            severity: th.severity,
            triggerType: TriggerType.SPIKE,
            summary: `Complaint volume spiked by factor ${factor.toFixed(2)} (threshold ${th.thresholdVal}x)`
          }
        });
        io?.emit("alert:new", alert);
      }
    }
  }
}

export default router;

