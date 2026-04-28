import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireApiKey } from "../middleware/apiKey";
import { audit } from "../middleware/audit";
import { env } from "../config/env";

const router = Router();

const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(env.INGEST_RATE_LIMIT_RPM),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Ingest rate limit exceeded" }
});

const eventSchema = z
  .object({
    countyName:     z.string().min(1).optional(),
    countyCode:     z.string().regex(/^\d{3}$/).optional(),
    topicName:      z.string().min(1),
    sentimentScore: z.number().min(-1).max(1),
    sentimentLabel: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
    source:         z.string().min(1).max(120),
    timestamp:      z.string().datetime().optional(),
    volumeWeight:   z.number().int().min(1).max(100).default(1)
  })
  .refine((d) => d.countyName !== undefined || d.countyCode !== undefined, {
    message: "Provide countyName or countyCode"
  });

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(500)
});

// POST /api/ingest/events
router.post(
  "/events",
  ingestLimiter,
  requireApiKey,
  audit("INGEST_EVENTS", "SENTIMENT"),
  async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten().fieldErrors });
    }

    const { events } = parsed.data;

    // Load lookup maps once per request
    const [counties, topics] = await Promise.all([
      prisma.county.findMany({ select: { id: true, name: true, code: true } }),
      prisma.topic.findMany({ select: { id: true, name: true }, where: { isActive: true } })
    ]);

    const countyByName = new Map(counties.map((c) => [c.name.toLowerCase(), c.id]));
    const countyByCode = new Map(counties.map((c) => [c.code, c.id]));
    const topicByName  = new Map(topics.map((t) => [t.name.toLowerCase(), t.id]));

    const rows: {
      countyId: string;
      topicId: string;
      sentimentScore: number;
      sentimentLabel: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
      source: string;
      timestamp: Date;
      volumeWeight: number;
    }[] = [];

    const skipped: { index: number; reason: string }[] = [];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];

      const countyId =
        (e.countyCode && countyByCode.get(e.countyCode)) ||
        (e.countyName && countyByName.get(e.countyName.toLowerCase())) ||
        undefined;

      if (!countyId) {
        skipped.push({ index: i, reason: `County not found: ${e.countyCode ?? e.countyName}` });
        continue;
      }

      const topicId = topicByName.get(e.topicName.toLowerCase());
      if (!topicId) {
        skipped.push({ index: i, reason: `Topic not found: ${e.topicName}` });
        continue;
      }

      rows.push({
        countyId,
        topicId,
        sentimentScore: e.sentimentScore,
        sentimentLabel: e.sentimentLabel,
        source: e.source,
        timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        volumeWeight: e.volumeWeight
      });
    }

    if (rows.length > 0) {
      await prisma.sentimentEvent.createMany({ data: rows });
    }

    return res.status(201).json({ inserted: rows.length, skipped });
  }
);

export default router;
