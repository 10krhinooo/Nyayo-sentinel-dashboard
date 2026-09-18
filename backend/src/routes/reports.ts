import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRoles } from "../middleware/auth";
import { resolveScope, countyWhere } from "../middleware/scope";
import { audit } from "../middleware/audit";

const router = Router();

/**
 * Quotes a value for CSV and neutralises spreadsheet formula injection.
 *
 * A cell beginning with = + - @ or a control character is executed as a
 * formula by Excel, Google Sheets and LibreOffice when the file is opened.
 * Prefixing with a single quote renders the cell as text. The previous code
 * escaped embedded quotes but not the leading character.
 */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const needsGuard = /^[=+\-@\t\r]/.test(raw);
  const guarded = needsGuard ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

router.get(
  "/weekly-summary",
  requireAuth(),
  resolveScope(),
  audit("EXPORT_WEEKLY_REPORT", "REPORT"),
  async (req, res) => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Previously unscoped, so a county official could export national totals.
      const summary = await prisma.sentimentEvent.groupBy({
        by: ["sentimentLabel"],
        where: { timestamp: { gte: weekAgo }, ...countyWhere(req) },
        _count: { _all: true }
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=weekly-summary.csv");

      const rows = ["label,count"];
      for (const row of summary) {
        rows.push(`${csvCell(row.sentimentLabel)},${row._count._all}`);
      }
      return res.send(rows.join("\n"));
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/county-comparison",
  requireAuth(),
  requireRoles([UserRole.NATIONAL_ADMIN, UserRole.ANALYST]),
  audit("EXPORT_COUNTY_COMPARISON", "REPORT"),
  async (_req, res) => {
    try {
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
        rows.push(`${csvCell(r.county_name)},${r.avg_score},${r.negative_ratio}`);
      }

      return res.send(rows.join("\n"));
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export { csvCell };
export default router;
