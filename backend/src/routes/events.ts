import { Router } from "express";
import { SentimentLabel, UserRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

const PAGE_LIMIT = 50;

router.get(
  "/",
  authenticate(),
  audit("VIEW_EVENTS", "SENTIMENT"),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? String(PAGE_LIMIT)), 10) || PAGE_LIMIT));
      const skip = (page - 1) * limit;

      const search      = String(req.query.search ?? "").trim();
      const countyQ     = String(req.query.county ?? "").trim();
      const topicQ      = String(req.query.topic ?? "").trim();
      const sentimentQ  = String(req.query.sentiment ?? "").trim().toUpperCase();
      const startDate   = String(req.query.startDate ?? "").trim();
      const endDate     = String(req.query.endDate ?? "").trim();

      const validLabels = Object.values(SentimentLabel) as string[];
      const sentimentFilter = validLabels.includes(sentimentQ) ? (sentimentQ as SentimentLabel) : undefined;

      const where: Prisma.SentimentEventWhereInput = {};

      // COUNTY_OFFICIAL: scope to own county only
      if (req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId) {
        where.countyId = req.user.countyId;
      } else if (countyQ) {
        where.county = { name: { contains: countyQ, mode: "insensitive" } };
      }

      if (topicQ) {
        where.topic = { name: { contains: topicQ, mode: "insensitive" } };
      }
      if (sentimentFilter) where.sentimentLabel = sentimentFilter;
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.timestamp.lte = end;
        }
      }
      if (search) {
        where.OR = [
          { headline: { contains: search, mode: "insensitive" } },
          { snippet:  { contains: search, mode: "insensitive" } }
        ];
      }

      const [events, total] = await Promise.all([
        prisma.sentimentEvent.findMany({
          where,
          orderBy: { timestamp: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            timestamp: true,
            sentimentLabel: true,
            sentimentScore: true,
            source: true,
            headline: true,
            countyId: true,
            topicId: true,
            county: { select: { name: true } },
            topic: { select: { name: true } }
          }
        }),
        prisma.sentimentEvent.count({ where })
      ]);

      return res.json({ events, total, page, limit });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
