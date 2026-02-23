import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles } from "../middleware/auth";
import { audit } from "../middleware/audit";

const router = Router();

router.get(
  "/weekly-summary",
  authenticate(),
  audit("EXPORT_WEEKLY_REPORT", "REPORT"),
  async (_req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const summary = await prisma.sentimentEvent.groupBy({
      by: ["sentimentLabel"],
      where: { timestamp: { gte: weekAgo } },
      _count: { _all: true }
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=weekly-summary.csv");

    const rows = ["label,count"];
    for (const row of summary) {
      rows.push(`${row.sentimentLabel},${row._count._all}`);
    }
    return res.send(rows.join("\n"));
  }
);

router.get(
  "/county-comparison",
  authenticate(),
  requireRoles([UserRole.NATIONAL_ADMIN, UserRole.ANALYST]),
  audit("EXPORT_COUNTY_COMPARISON", "REPORT"),
  async (_req, res) => {
    const results = await prisma.$queryRaw<
      { county_name: string; avg_score: number; negative_ratio: number }[]
    >`SELECT c.name as county_name,
             AVG(se."sentimentScore") as avg_score,
             AVG(CASE WHEN se."sentimentLabel" = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_ratio
       FROM "SentimentEvent" se
       JOIN "County" c ON c.id = se."countyId"
       GROUP BY c.name
       ORDER BY county_name ASC`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=county-comparison.csv");

    const rows = ["county,avg_score,negative_ratio"];
    for (const r of results) {
      rows.push(`${r.county_name},${r.avg_score},${r.negative_ratio}`);
    }

    return res.send(rows.join("\n"));
  }
);

export default router;

