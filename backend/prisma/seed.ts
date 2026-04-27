import { PrismaClient, SentimentLabel, AlertSeverity, MetricType, AlertStatus, TriggerType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// ── Counties ──────────────────────────────────────────────────────────────────

const COUNTIES = [
  { name: "Mombasa",          code: "001", region: "Coast" },
  { name: "Kwale",            code: "002", region: "Coast" },
  { name: "Kilifi",           code: "003", region: "Coast" },
  { name: "Tana River",       code: "004", region: "Coast" },
  { name: "Lamu",             code: "005", region: "Coast" },
  { name: "Taita-Taveta",     code: "006", region: "Coast" },
  { name: "Garissa",          code: "007", region: "North Eastern" },
  { name: "Wajir",            code: "008", region: "North Eastern" },
  { name: "Mandera",          code: "009", region: "North Eastern" },
  { name: "Marsabit",         code: "010", region: "Eastern" },
  { name: "Isiolo",           code: "011", region: "Eastern" },
  { name: "Meru",             code: "012", region: "Eastern" },
  { name: "Tharaka-Nithi",    code: "013", region: "Eastern" },
  { name: "Embu",             code: "014", region: "Eastern" },
  { name: "Kitui",            code: "015", region: "Eastern" },
  { name: "Machakos",         code: "016", region: "Eastern" },
  { name: "Makueni",          code: "017", region: "Eastern" },
  { name: "Nyandarua",        code: "018", region: "Central" },
  { name: "Nyeri",            code: "019", region: "Central" },
  { name: "Kirinyaga",        code: "020", region: "Central" },
  { name: "Murang'a",         code: "021", region: "Central" },
  { name: "Kiambu",           code: "022", region: "Central" },
  { name: "Turkana",          code: "023", region: "Rift Valley" },
  { name: "West Pokot",       code: "024", region: "Rift Valley" },
  { name: "Samburu",          code: "025", region: "Rift Valley" },
  { name: "Trans-Nzoia",      code: "026", region: "Rift Valley" },
  { name: "Uasin Gishu",      code: "027", region: "Rift Valley" },
  { name: "Elgeyo-Marakwet",  code: "028", region: "Rift Valley" },
  { name: "Nandi",            code: "029", region: "Rift Valley" },
  { name: "Baringo",          code: "030", region: "Rift Valley" },
  { name: "Laikipia",         code: "031", region: "Rift Valley" },
  { name: "Nakuru",           code: "032", region: "Rift Valley" },
  { name: "Narok",            code: "033", region: "Rift Valley" },
  { name: "Kajiado",          code: "034", region: "Rift Valley" },
  { name: "Kericho",          code: "035", region: "Rift Valley" },
  { name: "Bomet",            code: "036", region: "Rift Valley" },
  { name: "Kakamega",         code: "037", region: "Western" },
  { name: "Vihiga",           code: "038", region: "Western" },
  { name: "Bungoma",          code: "039", region: "Western" },
  { name: "Busia",            code: "040", region: "Western" },
  { name: "Siaya",            code: "041", region: "Nyanza" },
  { name: "Kisumu",           code: "042", region: "Nyanza" },
  { name: "Homa Bay",         code: "043", region: "Nyanza" },
  { name: "Migori",           code: "044", region: "Nyanza" },
  { name: "Kisii",            code: "045", region: "Nyanza" },
  { name: "Nyamira",          code: "046", region: "Nyanza" },
  { name: "Nairobi",          code: "047", region: "Nairobi" },
];

// ── Topics ────────────────────────────────────────────────────────────────────

const TOPICS = [
  { name: "Healthcare",           category: "Social Services" },
  { name: "Education",            category: "Social Services" },
  { name: "Land & Housing",       category: "Governance" },
  { name: "Water & Sanitation",   category: "Infrastructure" },
  { name: "Roads & Transport",    category: "Infrastructure" },
  { name: "Security & Police",    category: "Governance" },
  { name: "Corruption",           category: "Governance" },
  { name: "Agriculture",          category: "Economy" },
  { name: "Youth Unemployment",   category: "Economy" },
  { name: "Taxation & Revenue",   category: "Economy" },
  { name: "Devolution",           category: "Governance" },
  { name: "Food Security",        category: "Social Services" },
];

// ── Sentiment helpers ─────────────────────────────────────────────────────────

// Per-topic baseline negative probability (some topics trend more negative)
const TOPIC_NEG_BIAS: Record<string, number> = {
  "Corruption":        0.65,
  "Youth Unemployment":0.58,
  "Land & Housing":    0.52,
  "Taxation & Revenue":0.50,
  "Roads & Transport": 0.42,
  "Water & Sanitation":0.40,
  "Security & Police": 0.38,
  "Healthcare":        0.35,
  "Food Security":     0.34,
  "Devolution":        0.30,
  "Agriculture":       0.28,
  "Education":         0.22,
};

// Counties with historically elevated frustration
const HIGH_TENSION_COUNTIES = new Set(["Turkana", "Mandera", "Wajir", "Garissa", "Tana River", "Kilifi", "Kwale"]);

function randomSentiment(topicName: string, countyName: string): { score: number; label: SentimentLabel } {
  let negProb = TOPIC_NEG_BIAS[topicName] ?? 0.35;
  if (HIGH_TENSION_COUNTIES.has(countyName)) negProb = Math.min(negProb + 0.15, 0.85);

  const rand = Math.random();
  if (rand < negProb) {
    const score = -(0.3 + Math.random() * 0.7); // -0.3 to -1.0
    return { score, label: SentimentLabel.NEGATIVE };
  } else if (rand < negProb + 0.25) {
    const score = -0.1 + Math.random() * 0.2; // -0.1 to +0.1
    return { score, label: SentimentLabel.NEUTRAL };
  } else {
    const score = 0.2 + Math.random() * 0.8; // +0.2 to +1.0
    return { score, label: SentimentLabel.POSITIVE };
  }
}

// Event volume per county per day (urban > rural)
const HIGH_VOLUME = new Set(["Nairobi", "Mombasa", "Nakuru", "Kisumu", "Kiambu", "Uasin Gishu"]);
const MED_VOLUME  = new Set(["Machakos", "Meru", "Kakamega", "Bungoma", "Nyeri", "Murang'a"]);

function dailyVolume(countyName: string): number {
  if (HIGH_VOLUME.has(countyName)) return 18 + Math.floor(Math.random() * 12);
  if (MED_VOLUME.has(countyName))  return 8  + Math.floor(Math.random() * 8);
  return 3 + Math.floor(Math.random() * 5);
}

const SOURCES = ["twitter", "facebook", "news_api", "survey", "citizen_report", "radio_monitor"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database…");

  // 1. Counties
  const countyRecords = await Promise.all(
    COUNTIES.map((c) =>
      prisma.county.upsert({
        where: { code: c.code },
        update: { name: c.name, region: c.region },
        create: c,
      })
    )
  );
  console.log(`  ✓ ${countyRecords.length} counties`);

  const countyByName = new Map(countyRecords.map((c) => [c.name, c]));

  // 2. Constituencies — extracted from GeoJSON
  const geoPath = path.resolve(__dirname, "../../frontend/public/geo/kenya-counties.geojson");
  const geojson = JSON.parse(fs.readFileSync(geoPath, "utf-8")) as {
    features: Array<{ properties: { CONSTITUEN: string; CONST_CODE: number; COUNTY_NAM: string } }>;
  };

  // De-duplicate by CONST_CODE
  const constitMap = new Map<number, { name: string; code: string; countyName: string }>();
  for (const feat of geojson.features) {
    const { CONSTITUEN, CONST_CODE, COUNTY_NAM } = feat.properties;
    if (CONSTITUEN && CONST_CODE && !constitMap.has(CONST_CODE)) {
      constitMap.set(CONST_CODE, {
        name: CONSTITUEN,
        code: String(CONST_CODE),
        countyName: COUNTY_NAM,
      });
    }
  }

  const constituencyRecords = await Promise.all(
    Array.from(constitMap.values()).map(({ name, code, countyName }) => {
      const county = countyByName.get(
        // GeoJSON uses ALL_CAPS; match case-insensitively
        [...countyByName.keys()].find((k) => k.toUpperCase() === countyName.toUpperCase()) ?? ""
      );
      if (!county) return null;
      return prisma.constituency.upsert({
        where: { code },
        update: { name, countyId: county.id },
        create: { name, code, countyId: county.id },
      });
    })
  );
  const validConstituencies = constituencyRecords.filter(Boolean) as Awaited<ReturnType<typeof prisma.constituency.upsert>>[];
  console.log(`  ✓ ${validConstituencies.length} constituencies`);

  // Group constituencies by countyId for fast lookup when seeding events
  const constitByCounty = new Map<string, typeof validConstituencies>();
  for (const c of validConstituencies) {
    const list = constitByCounty.get(c.countyId) ?? [];
    list.push(c);
    constitByCounty.set(c.countyId, list);
  }

  // 3. Topics
  const topicRecords = await Promise.all(
    TOPICS.map((t) =>
      prisma.topic.upsert({
        where: { name: t.name },
        update: { category: t.category },
        create: t,
      })
    )
  );
  console.log(`  ✓ ${topicRecords.length} topics`);

  // 3. Users
  const passwordHash = await bcrypt.hash("Nyayo2024!", 10);

  const nairobi  = countyByName.get("Nairobi")!;
  const mombasa  = countyByName.get("Mombasa")!;
  const kisumu   = countyByName.get("Kisumu")!;
  const nakuru   = countyByName.get("Nakuru")!;

  const users = [
    {
      email: "admin@sentinel.ke",
      role: UserRole.NATIONAL_ADMIN,
      countyId: null,
    },
    {
      email: "analyst@sentinel.ke",
      role: UserRole.ANALYST,
      countyId: null,
    },
    {
      email: "analyst2@sentinel.ke",
      role: UserRole.ANALYST,
      countyId: null,
    },
    {
      email: "nairobi.official@county.ke",
      role: UserRole.COUNTY_OFFICIAL,
      countyId: nairobi.id,
    },
    {
      email: "mombasa.official@county.ke",
      role: UserRole.COUNTY_OFFICIAL,
      countyId: mombasa.id,
    },
    {
      email: "kisumu.official@county.ke",
      role: UserRole.COUNTY_OFFICIAL,
      countyId: kisumu.id,
    },
    {
      email: "nakuru.official@county.ke",
      role: UserRole.COUNTY_OFFICIAL,
      countyId: nakuru.id,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, mfaEnabled: false },
    });
  }
  console.log(`  ✓ ${users.length} users (password: Nyayo2024!)`);

  // 4. Sentiment events — last 30 days
  const now = new Date();
  let eventCount = 0;

  // Build batches per day to keep memory bounded
  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const dayStart = new Date(now);
    dayStart.setDate(now.getDate() - daysAgo);
    dayStart.setHours(0, 0, 0, 0);

    const batch: Parameters<typeof prisma.sentimentEvent.create>[0]["data"][] = [];

    for (const county of countyRecords) {
      const volume = dailyVolume(county.name);
      for (let i = 0; i < volume; i++) {
        const topic = pick(topicRecords);
        const { score, label } = randomSentiment(topic.name, county.name);

        // Spread events across the day
        const ts = new Date(dayStart.getTime() + Math.random() * 86_400_000);

        // 50% of events get a constituency assignment
        const countyConstits = constitByCounty.get(county.id) ?? [];
        const constituencyId =
          countyConstits.length > 0 && Math.random() < 0.5
            ? pick(countyConstits).id
            : undefined;

        batch.push({
          countyId:       county.id,
          topicId:        topic.id,
          constituencyId: constituencyId ?? null,
          timestamp:      ts,
          sentimentScore: Math.round(score * 1000) / 1000,
          sentimentLabel: label,
          source:         pick(SOURCES),
          volumeWeight:   1,
        });
      }
    }

    await prisma.sentimentEvent.createMany({ data: batch, skipDuplicates: false });
    eventCount += batch.length;
  }
  console.log(`  ✓ ${eventCount} sentiment events (last 30 days)`);

  // 5. Alert thresholds
  const corruptionTopic = topicRecords.find((t) => t.name === "Corruption")!;
  const unemployTopic   = topicRecords.find((t) => t.name === "Youth Unemployment")!;
  const healthTopic     = topicRecords.find((t) => t.name === "Healthcare")!;

  const thresholds = [
    // National: trigger HIGH alert when >60% negative on Corruption
    {
      countyId: null,
      topicId: corruptionTopic.id,
      metricType: MetricType.NEGATIVE_PERCENT,
      thresholdVal: 60,
      severity: AlertSeverity.HIGH,
      active: true,
    },
    // National: CRITICAL when >75% negative on any topic
    {
      countyId: null,
      topicId: null,
      metricType: MetricType.NEGATIVE_PERCENT,
      thresholdVal: 75,
      severity: AlertSeverity.CRITICAL,
      active: true,
    },
    // National: MEDIUM when complaint volume spikes 2x on Youth Unemployment
    {
      countyId: null,
      topicId: unemployTopic.id,
      metricType: MetricType.SPIKE_FACTOR,
      thresholdVal: 2.0,
      severity: AlertSeverity.MEDIUM,
      active: true,
    },
    // Nairobi: HIGH alert when >50% negative on Healthcare
    {
      countyId: nairobi.id,
      topicId: healthTopic.id,
      metricType: MetricType.NEGATIVE_PERCENT,
      thresholdVal: 50,
      severity: AlertSeverity.HIGH,
      active: true,
    },
    // Mombasa: MEDIUM when >45% negative overall
    {
      countyId: mombasa.id,
      topicId: null,
      metricType: MetricType.NEGATIVE_PERCENT,
      thresholdVal: 45,
      severity: AlertSeverity.MEDIUM,
      active: true,
    },
    // Low-severity national spike detector (3x volume on any topic)
    {
      countyId: null,
      topicId: null,
      metricType: MetricType.SPIKE_FACTOR,
      thresholdVal: 3.0,
      severity: AlertSeverity.LOW,
      active: true,
    },
  ];

  await prisma.alertThreshold.createMany({ data: thresholds, skipDuplicates: false });
  console.log(`  ✓ ${thresholds.length} alert thresholds`);

  // 6. Sample alerts (representative mix of statuses & severities)
  const turkana = countyByName.get("Turkana")!;
  const garissa = countyByName.get("Garissa")!;
  const landTopic = topicRecords.find((t) => t.name === "Land & Housing")!;
  const waterTopic = topicRecords.find((t) => t.name === "Water & Sanitation")!;
  const roadTopic  = topicRecords.find((t) => t.name === "Roads & Transport")!;

  const daysAgoDate = (d: number) => new Date(now.getTime() - d * 86_400_000);

  const alerts = [
    {
      countyId: nairobi.id,
      topicId: corruptionTopic.id,
      severity: AlertSeverity.HIGH,
      triggerType: TriggerType.THRESHOLD,
      triggeredAt: daysAgoDate(1),
      status: AlertStatus.OPEN,
      summary: "Negative sentiment on Corruption reached 68.4% in Nairobi, exceeding the 60% threshold.",
    },
    {
      countyId: mombasa.id,
      topicId: healthTopic.id,
      severity: AlertSeverity.MEDIUM,
      triggerType: TriggerType.THRESHOLD,
      triggeredAt: daysAgoDate(2),
      status: AlertStatus.ACKNOWLEDGED,
      summary: "Negative sentiment on Healthcare hit 52.1% in Mombasa, above the 45% county threshold.",
    },
    {
      countyId: turkana.id,
      topicId: waterTopic.id,
      severity: AlertSeverity.CRITICAL,
      triggerType: TriggerType.THRESHOLD,
      triggeredAt: daysAgoDate(3),
      status: AlertStatus.OPEN,
      summary: "Negative sentiment on Water & Sanitation reached 78.9% in Turkana — CRITICAL threshold breached.",
    },
    {
      countyId: kisumu.id,
      topicId: unemployTopic.id,
      severity: AlertSeverity.MEDIUM,
      triggerType: TriggerType.SPIKE,
      triggeredAt: daysAgoDate(4),
      status: AlertStatus.RESOLVED,
      summary: "Youth Unemployment complaint volume spiked 2.3x in Kisumu versus the previous 24-hour baseline.",
    },
    {
      countyId: garissa.id,
      topicId: null,
      severity: AlertSeverity.HIGH,
      triggerType: TriggerType.THRESHOLD,
      triggeredAt: daysAgoDate(5),
      status: AlertStatus.ACKNOWLEDGED,
      summary: "Overall negative sentiment in Garissa exceeded 76.2%, triggering national CRITICAL threshold.",
    },
    {
      countyId: nakuru.id,
      topicId: landTopic.id,
      severity: AlertSeverity.MEDIUM,
      triggerType: TriggerType.THRESHOLD,
      triggeredAt: daysAgoDate(6),
      status: AlertStatus.RESOLVED,
      summary: "Negative sentiment on Land & Housing reached 55.7% in Nakuru over the past 24 hours.",
    },
    {
      countyId: nairobi.id,
      topicId: roadTopic.id,
      severity: AlertSeverity.LOW,
      triggerType: TriggerType.SPIKE,
      triggeredAt: daysAgoDate(7),
      status: AlertStatus.RESOLVED,
      summary: "Roads & Transport complaint volume spiked 3.1x in Nairobi following heavy rainfall reports.",
    },
    {
      countyId: kisumu.id,
      topicId: corruptionTopic.id,
      severity: AlertSeverity.HIGH,
      triggerType: TriggerType.THRESHOLD,
      triggeredAt: daysAgoDate(0),
      status: AlertStatus.OPEN,
      summary: "Corruption negative sentiment reached 71.3% in Kisumu in the last 24 hours.",
    },
  ];

  await prisma.alert.createMany({ data: alerts });
  console.log(`  ✓ ${alerts.length} sample alerts`);

  console.log("\nSeed complete.\n");
  console.log("Login credentials:");
  console.log("  admin@sentinel.ke          / Nyayo2024!  (NATIONAL_ADMIN)");
  console.log("  analyst@sentinel.ke         / Nyayo2024!  (ANALYST)");
  console.log("  nairobi.official@county.ke  / Nyayo2024!  (COUNTY_OFFICIAL – Nairobi)");
  console.log("  mombasa.official@county.ke  / Nyayo2024!  (COUNTY_OFFICIAL – Mombasa)");
  console.log("  kisumu.official@county.ke   / Nyayo2024!  (COUNTY_OFFICIAL – Kisumu)");
  console.log("  nakuru.official@county.ke   / Nyayo2024!  (COUNTY_OFFICIAL – Nakuru)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
