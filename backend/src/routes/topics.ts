import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

router.get(
  "/summary",
  authenticate(true),
  audit("VIEW_TOPICS", "SENTIMENT"),
  async (req, res) => {
    try {
      const { countyId, sentimentLabel } = req.query as {
        countyId?: string;
        sentimentLabel?: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
      };

      const where: { countyId?: string; sentimentLabel?: "POSITIVE" | "NEUTRAL" | "NEGATIVE" } = {};
      if (req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId) {
        where.countyId = req.user.countyId;
      } else if (countyId) {
        where.countyId = countyId;
      }
      if (sentimentLabel) where.sentimentLabel = sentimentLabel;

      const grouped = await prisma.sentimentEvent.groupBy({
        by: ["topicId", "sentimentLabel"],
        where,
        _count: { _all: true }
      });

      const topicIds = Array.from(new Set(grouped.map((g) => g.topicId)));
      const topics = await prisma.topic.findMany({ where: { id: { in: topicIds } } });

      const byTopic: Record<
        string,
        {
          topicId: string;
          name: string;
          counts: { POSITIVE: number; NEUTRAL: number; NEGATIVE: number };
          total: number;
        }
      > = {};

      for (const g of grouped) {
        if (!byTopic[g.topicId]) {
          const topic = topics.find((t) => t.id === g.topicId);
          byTopic[g.topicId] = {
            topicId: g.topicId,
            name: topic?.name ?? "Unknown",
            counts: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
            total: 0
          };
        }
        const entry = byTopic[g.topicId];
        entry.counts[g.sentimentLabel] += g._count._all;
        entry.total += g._count._all;
      }

      return res.json({ topics: Object.values(byTopic) });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
