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
  }
);

export default router;

