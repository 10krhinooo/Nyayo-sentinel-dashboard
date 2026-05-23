import { Router } from "express";
import { AlertStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { audit } from "../middleware/audit";
import { generateAlertSummary } from "../services/llm";
import { TOPIC_CONTEXT } from "../types/topicContext";

const router = Router();

router.get(
  "/overview",
  authenticate(true),
  audit("VIEW_DASHBOARD", "SENTIMENT"),
  async (req, res) => {
    try {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneDayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const countyScope =
        req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId
          ? req.user.countyId
          : undefined;

      const baseWhere: { countyId?: string } = {};
      if (countyScope) baseWhere.countyId = countyScope;

      const [counts, avgResult] = await Promise.all([
        prisma.sentimentEvent.groupBy({
          by: ["sentimentLabel"],
          where: baseWhere,
          _count: { _all: true }
        }),
        prisma.sentimentEvent.aggregate({
          _avg: { sentimentScore: true },
          where: { ...baseWhere, timestamp: { gte: oneWeekAgo } }
        })
      ]);

      const total = counts.reduce((sum, c) => sum + c._count._all, 0);

      const distribution = {
        positive: total === 0 ? 0 : Math.round((100 * (counts.find((c) => c.sentimentLabel === "POSITIVE")?._count._all ?? 0)) / total),
        neutral:  total === 0 ? 0 : Math.round((100 * (counts.find((c) => c.sentimentLabel === "NEUTRAL")?._count._all  ?? 0)) / total),
        negative: total === 0 ? 0 : Math.round((100 * (counts.find((c) => c.sentimentLabel === "NEGATIVE")?._count._all ?? 0)) / total)
      };

      const sentimentScore = avgResult._avg.sentimentScore ?? 0;

      let trendByDay: { day: string; avg_score: number }[] = [];
      if (countyScope) {
        trendByDay = await prisma.$queryRaw<{ day: string; avg_score: number }[]>`
          SELECT date_trunc('day', "timestamp")::date as day, AVG("sentimentScore") as avg_score
          FROM "SentimentEvent"
          WHERE "timestamp" >= ${oneWeekAgo} AND "countyId" = ${countyScope}
          GROUP BY day ORDER BY day ASC`;
      } else {
        trendByDay = await prisma.$queryRaw<{ day: string; avg_score: number }[]>`
          SELECT date_trunc('day', "timestamp")::date as day, AVG("sentimentScore") as avg_score
          FROM "SentimentEvent"
          WHERE "timestamp" >= ${oneWeekAgo}
          GROUP BY day ORDER BY day ASC`;
      }

      const topTopics = await prisma.sentimentEvent.groupBy({
        by: ["topicId"],
        _count: { topicId: true },
        where: { ...baseWhere, sentimentLabel: "NEGATIVE" },
        orderBy: { _count: { topicId: "desc" } },
        take: 5
      });

      const topicIds = topTopics.map((t) => t.topicId);
      const topics = await prisma.topic.findMany({ where: { id: { in: topicIds } } });

      const topEmergingTopics = topTopics.map((t) => ({
        topicId: t.topicId,
        name: topics.find((x) => x.id === t.topicId)?.name ?? "Unknown",
        negativeCount: t._count.topicId
      }));

      // ── KPIs (national admin + analyst only — skip for county officials) ──────
      let kpis: {
        eventsToday: number;
        eventsYesterday: number;
        openAlerts: number;
        countiesAtRisk: number;
        mostActiveCounty: string | null;
        countiesWithData: number;
      } | null = null;

      if (!countyScope) {
        const [
          eventsToday,
          eventsYesterday,
          openAlerts,
          countiesAtRisk,
          countyVolumes,
          countiesWithData
        ] = await Promise.all([
          prisma.sentimentEvent.count({ where: { timestamp: { gte: oneDayAgo } } }),
          prisma.sentimentEvent.count({ where: { timestamp: { gte: twoDaysAgo, lt: oneDayAgo } } }),
          prisma.alert.count({ where: { status: AlertStatus.OPEN } }),
          // Counties with >40% negative in last 24h — approximated via groupBy
          prisma.$queryRaw<{ cnt: bigint }[]>`
            SELECT COUNT(DISTINCT "countyId") as cnt
            FROM (
              SELECT "countyId",
                SUM(CASE WHEN "sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END)::float / COUNT(*) as neg_ratio
              FROM "SentimentEvent"
              WHERE "timestamp" >= ${oneDayAgo}
              GROUP BY "countyId"
              HAVING SUM(CASE WHEN "sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END)::float / COUNT(*) > 0.4
            ) risky`,
          prisma.sentimentEvent.groupBy({
            by: ["countyId"],
            where: { timestamp: { gte: oneDayAgo } },
            _count: { _all: true },
            orderBy: { _count: { countyId: "desc" } },
            take: 1
          }),
          prisma.sentimentEvent.groupBy({
            by: ["countyId"],
            where: { timestamp: { gte: oneDayAgo } },
            _count: { _all: true }
          }).then((r) => r.length)
        ]);

        let mostActiveCountyName: string | null = null;
        if (countyVolumes.length > 0) {
          const topCounty = await prisma.county.findUnique({
            where: { id: countyVolumes[0].countyId },
            select: { name: true }
          });
          mostActiveCountyName = topCounty?.name ?? null;
        }

        kpis = {
          eventsToday,
          eventsYesterday,
          openAlerts,
          countiesAtRisk: Number((countiesAtRisk[0] as { cnt: bigint })?.cnt ?? 0),
          mostActiveCounty: mostActiveCountyName,
          countiesWithData
        };
      }

      return res.json({
        distribution,
        sentimentScore,
        trendByDay,
        topEmergingTopics,
        kpis
      });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// AI national briefing — national admins/analysts only
router.get(
  "/briefing",
  authenticate(true),
  async (req, res) => {
    if (req.user?.role === UserRole.COUNTY_OFFICIAL) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get top 3 negative topics with headline samples
      const topNeg = await prisma.sentimentEvent.groupBy({
        by: ["topicId"],
        where: { sentimentLabel: "NEGATIVE", timestamp: { gte: oneDayAgo } },
        _count: { topicId: true },
        orderBy: { _count: { topicId: "desc" } },
        take: 3
      });

      const topicIds = topNeg.map((t) => t.topicId).filter(Boolean) as string[];
      const [topicRecords, headlineEvents, totalNeg, totalAll] = await Promise.all([
        prisma.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true } }),
        prisma.sentimentEvent.findMany({
          where: { sentimentLabel: "NEGATIVE", timestamp: { gte: oneDayAgo }, headline: { not: null } },
          select: { headline: true },
          orderBy: { timestamp: "desc" },
          take: 15
        }),
        prisma.sentimentEvent.count({ where: { sentimentLabel: "NEGATIVE", timestamp: { gte: oneDayAgo } } }),
        prisma.sentimentEvent.count({ where: { timestamp: { gte: oneDayAgo } } })
      ]);

      const topicsForPrompt = topNeg.map((t) => ({
        name: topicRecords.find((r) => r.id === t.topicId)?.name ?? "Unknown",
        count: t._count.topicId,
        context: t.topicId ? (TOPIC_CONTEXT[topicRecords.find((r) => r.id === t.topicId)?.name ?? ""] ?? null) : null
      }));

      const headlines = headlineEvents.map((e) => e.headline as string);
      const negPct = totalAll === 0 ? 0 : Math.round((100 * totalNeg) / totalAll);

      const summary = await generateAlertSummary({
        county: "Kenya (national)",
        topic: topicsForPrompt.map((t) => t.name).join(", ") || null,
        triggerType: "THRESHOLD",
        stats: {
          eventCount: totalAll,
          negativeCount: totalNeg,
          negativePercent: negPct,
          avgScore: null,
          sources: []
        },
        headlines,
        isBriefing: true
      });

      return res.json({ briefing: summary });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
