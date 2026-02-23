import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

router.get(
  "/overview",
  authenticate(true),
  audit("VIEW_DASHBOARD", "SENTIMENT"),
  async (req, res) => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const countyScope =
      req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId
        ? req.user.countyId
        : undefined;

    const baseWhere: any = {};
    if (countyScope) {
      baseWhere.countyId = countyScope;
    }

    const [counts, recentEvents] = await Promise.all([
      prisma.sentimentEvent.groupBy({
        by: ["sentimentLabel"],
        where: baseWhere,
        _count: { _all: true }
      }),
      prisma.sentimentEvent.findMany({
        where: { ...baseWhere, timestamp: { gte: oneWeekAgo } },
        orderBy: { timestamp: "asc" }
      })
    ]);

    const total = counts.reduce((sum, c) => sum + c._count._all, 0);

    const distribution = {
      positive:
        total === 0
          ? 0
          : Math.round(
              (100 * (counts.find((c) => c.sentimentLabel === "POSITIVE")?._count._all ?? 0)) / total
            ),
      neutral:
        total === 0
          ? 0
          : Math.round(
              (100 * (counts.find((c) => c.sentimentLabel === "NEUTRAL")?._count._all ?? 0)) / total
            ),
      negative:
        total === 0
          ? 0
          : Math.round(
              (100 * (counts.find((c) => c.sentimentLabel === "NEGATIVE")?._count._all ?? 0)) / total
            )
    };

    const rollingWindow = 50;
    const sentimentScores = recentEvents.map((e) => e.sentimentScore);
    const lastScores = sentimentScores.slice(-rollingWindow);
    const sentimentScore =
      lastScores.length === 0
        ? 0
        : lastScores.reduce((sum, s) => sum + s, 0) / lastScores.length;

    let trendByDay: { day: string; avg_score: number }[] = [];
    if (countyScope) {
      trendByDay = await prisma.$queryRaw<
        { day: string; avg_score: number }[]
      >`SELECT date_trunc('day', "timestamp")::date as day, AVG("sentimentScore") as avg_score
         FROM "SentimentEvent"
         WHERE "timestamp" >= ${oneWeekAgo} AND "countyId" = ${countyScope}
         GROUP BY day
         ORDER BY day ASC`;
    } else {
      trendByDay = await prisma.$queryRaw<
        { day: string; avg_score: number }[]
      >`SELECT date_trunc('day', "timestamp")::date as day, AVG("sentimentScore") as avg_score
         FROM "SentimentEvent"
         WHERE "timestamp" >= ${oneWeekAgo}
         GROUP BY day
         ORDER BY day ASC`;
    }

    const topTopics = await prisma.sentimentEvent.groupBy({
      by: ["topicId"],
      _count: { topicId: true },
      where: { ...baseWhere, sentimentLabel: "NEGATIVE" },
      orderBy: { _count: { topicId: "desc" } },
      take: 5
    });

    const topicIds = topTopics.map((t) => t.topicId);
    const topics = await prisma.topic.findMany({
      where: { id: { in: topicIds } }
    });

    const topEmergingTopics = topTopics.map((t) => ({
      topicId: t.topicId,
      name: topics.find((x) => x.id === t.topicId)?.name ?? "Unknown",
      negativeCount: t._count.topicId
    }));

    return res.json({
      distribution,
      sentimentScore,
      trendByDay,
      topEmergingTopics
    });
  }
);

export default router;

