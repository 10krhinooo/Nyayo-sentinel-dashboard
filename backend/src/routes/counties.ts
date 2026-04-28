import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

router.get(
  "/heatmap",
  authenticate(true),
  audit("VIEW_HEATMAP", "SENTIMENT"),
  async (req, res) => {
    try {
      const results = await prisma.$queryRaw<
        { county_id: string; avg_score: number; negative_ratio: number; volume: number }[]
      >`SELECT
          "countyId" as county_id,
          AVG("sentimentScore") as avg_score,
          AVG(CASE WHEN "sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_ratio,
          COUNT(*) as volume
        FROM "SentimentEvent"
        GROUP BY "countyId"`;

      const scopedResults =
        req.user?.role === UserRole.COUNTY_OFFICIAL && req.user.countyId
          ? results.filter((r) => r.county_id === req.user?.countyId)
          : results;

      const countyIds = scopedResults.map((r) => r.county_id);
      const counties = await prisma.county.findMany({
        where: { id: { in: countyIds } }
      });

      const data = scopedResults.map((r) => ({
        countyId: r.county_id,
        countyName: counties.find((c) => c.id === r.county_id)?.name ?? "Unknown",
        avgScore: Number(r.avg_score),
        negativeRatio: Number(r.negative_ratio),
        volume: Number(r.volume)
      }));

      return res.json({ counties: data });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /counties/:countyId/constituencies/heatmap
router.get(
  "/:countyId/constituencies/heatmap",
  authenticate(true),
  audit("VIEW_CONSTITUENCY_HEATMAP", "SENTIMENT"),
  async (req, res) => {
    const { countyId } = req.params;

    // County officials can only view their own county
    if (
      req.user?.role === UserRole.COUNTY_OFFICIAL &&
      req.user.countyId !== countyId
    ) {
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
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /counties/:countyId/subcounties/heatmap
router.get(
  "/:countyId/subcounties/heatmap",
  authenticate(true),
  audit("VIEW_SUBCOUNTY_HEATMAP", "SENTIMENT"),
  async (req, res) => {
    const { countyId } = req.params;

    if (
      req.user?.role === UserRole.COUNTY_OFFICIAL &&
      req.user.countyId !== countyId
    ) {
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
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
