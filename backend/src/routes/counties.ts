import { Router } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { resolveScope, canAccessCounty } from "../middleware/scope";
import { audit } from "../middleware/audit";

const router = Router();

interface HeatmapRow {
  county_id: string;
  avg_score: number;
  negative_ratio: number;
  volume: bigint;
}

router.get(
  "/heatmap",
  requireAuth(),
  resolveScope(),
  audit("VIEW_HEATMAP", "SENTIMENT"),
  async (req, res) => {
    try {
      const scopedCountyId = req.scope!.countyId;

      // Scoped in SQL rather than by filtering the full result set in JS, which
      // previously aggregated all 47 counties and then discarded 46 of them.
      const results = await prisma.$queryRaw<HeatmapRow[]>`
        SELECT
          "countyId" as county_id,
          AVG("sentimentScore") as avg_score,
          AVG(CASE WHEN "sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_ratio,
          COUNT(*) as volume
        FROM "SentimentEvent"
        WHERE (${scopedCountyId}::text IS NULL OR "countyId" = ${scopedCountyId})
        GROUP BY "countyId"`;

      const countyIds = results.map((r) => r.county_id);
      const counties = await prisma.county.findMany({
        where: { id: { in: countyIds } }
      });

      const data = results.map((r) => ({
        countyId: r.county_id,
        countyName: counties.find((c) => c.id === r.county_id)?.name ?? "Unknown",
        countyCode: counties.find((c) => c.id === r.county_id)?.code ?? null,
        avgScore: Number(r.avg_score),
        negativeRatio: Number(r.negative_ratio),
        volume: Number(r.volume)
      }));

      return res.json({ counties: data });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /counties/:countyId/constituencies/heatmap
router.get(
  "/:countyId/constituencies/heatmap",
  requireAuth(),
  resolveScope(),
  audit("VIEW_CONSTITUENCY_HEATMAP", "SENTIMENT"),
  async (req, res) => {
    const { countyId } = req.params;

    if (!canAccessCounty(req, countyId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    try {
      const results = await prisma.$queryRaw<
        { constituency_id: string; avg_score: number; negative_ratio: number; volume: bigint }[]
      >`SELECT
          "constituencyId" as constituency_id,
          AVG("sentimentScore") as avg_score,
          AVG(CASE WHEN "sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_ratio,
          COUNT(*) as volume
        FROM "SentimentEvent"
        WHERE "countyId" = ${countyId}
          AND "constituencyId" IS NOT NULL
          AND "timestamp" >= NOW() - INTERVAL '30 days'
        GROUP BY "constituencyId"`;

      const constituencyIds = results.map((r) => r.constituency_id);
      const constituencies = await prisma.constituency.findMany({
        where: { id: { in: constituencyIds } }
      });

      const data = results.map((r) => ({
        constituencyId: r.constituency_id,
        name: constituencies.find((c) => c.id === r.constituency_id)?.name ?? "Unknown",
        avgScore: Number(r.avg_score),
        negativeRatio: Number(r.negative_ratio),
        volume: Number(r.volume),
      }));

      return res.json({ constituencies: data });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /counties/:countyId/subcounties/heatmap
router.get(
  "/:countyId/subcounties/heatmap",
  requireAuth(),
  resolveScope(),
  audit("VIEW_SUBCOUNTY_HEATMAP", "SENTIMENT"),
  async (req, res) => {
    const { countyId } = req.params;

    if (!canAccessCounty(req, countyId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    try {
      const results = await prisma.$queryRaw<
        { sub_county_id: string; avg_score: number; negative_ratio: number; volume: bigint }[]
      >`SELECT
          "subCountyId" as sub_county_id,
          AVG("sentimentScore") as avg_score,
          AVG(CASE WHEN "sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_ratio,
          COUNT(*) as volume
        FROM "SentimentEvent"
        WHERE "countyId" = ${countyId}
          AND "subCountyId" IS NOT NULL
          AND "timestamp" >= NOW() - INTERVAL '30 days'
        GROUP BY "subCountyId"`;

      const subCountyIds = results.map((r) => r.sub_county_id);
      const subCounties = await prisma.subCounty.findMany({
        where: { id: { in: subCountyIds } },
      });

      const data = results.map((r) => ({
        subCountyId: r.sub_county_id,
        name: subCounties.find((s) => s.id === r.sub_county_id)?.name ?? "Unknown",
        avgScore: Number(r.avg_score),
        negativeRatio: Number(r.negative_ratio),
        volume: Number(r.volume),
      }));

      return res.json({ subcounties: data });
    } catch (err) {
      logger.error({ err }, "Request handler failed");
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
