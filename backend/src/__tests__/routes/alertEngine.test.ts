import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/env", () => ({
  env: { OPENAI_API_KEY: undefined, NODE_ENV: "test", LOG_LEVEL: "silent" },
}));

vi.mock("../../services/llm", () => ({
  generateAlertSummary: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/email", () => ({
  sendAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockPrisma = {
  $queryRaw: vi.fn(),
  alertThreshold: { findMany: vi.fn() },
  alert: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  sentimentEvent: { groupBy: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
};
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

const { evaluateAlertThresholds } = await import("../../routes/alerts");

function threshold(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    countyId: null,
    topicId: null,
    metricType: "NEGATIVE_PERCENT",
    thresholdVal: 50,
    severity: "HIGH",
    active: true,
    minVolume: 20,
    cooldownMinutes: 360,
    ...over,
  };
}

/** One aggregate row as the SQL returns it, with bigint counts. */
function aggRow(over: Record<string, unknown> = {}) {
  return {
    countyId: "county-a",
    topicId: "topic-1",
    recent_total: 100n,
    recent_negative: 80n,
    recent_score_sum: -40,
    baseline_total: 50n,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.alert.findFirst.mockResolvedValue(null);
  mockPrisma.alert.create.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: "a1", triggeredAt: new Date(), ...data })
  );
  mockPrisma.alert.update.mockResolvedValue({});
  mockPrisma.sentimentEvent.groupBy.mockResolvedValue([]);
  mockPrisma.sentimentEvent.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
});

describe("query volume", () => {
  // The previous implementation issued two counts plus a findMany for every
  // threshold x county pair: roughly 282 round trips per tick at 6 thresholds
  // across 47 counties.
  it("issues one aggregate query regardless of how many counties are in play", async () => {
    const manyCounties = Array.from({ length: 47 }, (_, i) =>
      aggRow({ countyId: `county-${i}`, recent_negative: 10n, recent_total: 100n })
    );
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ id: "t1" }),
      threshold({ id: "t2", metricType: "SPIKE_FACTOR", thresholdVal: 3 }),
      threshold({ id: "t3", thresholdVal: 90 }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue(manyCounties);

    await evaluateAlertThresholds();

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("does not query at all when no thresholds are active", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([]);
    const result = await evaluateAlertThresholds();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, suppressed: 0 });
  });
});

describe("NEGATIVE_PERCENT rules", () => {
  it("fires when the negative share exceeds the threshold", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow()]);

    const result = await evaluateAlertThresholds();

    expect(result.created).toBe(1);
    const data = mockPrisma.alert.create.mock.calls[0][0].data;
    expect(data.triggerType).toBe("THRESHOLD");
    expect(data.observedValue).toBeCloseTo(80);
    expect(data.thresholdValue).toBe(50);
  });

  it("does not fire below the threshold", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow({ recent_negative: 10n })]);

    const result = await evaluateAlertThresholds();
    expect(result.created).toBe(0);
    expect(mockPrisma.alert.create).not.toHaveBeenCalled();
  });

  // Ratios computed from a handful of events are noise.
  it("ignores a combination below the minimum volume", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ topicId: "topic-1", minVolume: 20 }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      aggRow({ recent_total: 5n, recent_negative: 5n }),
    ]);

    const result = await evaluateAlertThresholds();
    expect(result.created).toBe(0);
  });

  it("records the structured trigger metadata rather than only prose", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow()]);

    await evaluateAlertThresholds();

    const data = mockPrisma.alert.create.mock.calls[0][0].data;
    expect(data.metricType).toBe("NEGATIVE_PERCENT");
    expect(data.eventCount).toBe(100);
    expect(data.thresholdId).toBe("t1");
    expect(data.windowStart).toBeInstanceOf(Date);
    expect(data.windowEnd).toBeInstanceOf(Date);
  });
});

describe("SPIKE_FACTOR rules", () => {
  it("fires when volume rises above the baseline by the configured factor", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ metricType: "SPIKE_FACTOR", thresholdVal: 1.5, topicId: "topic-1" }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      aggRow({ recent_total: 100n, baseline_total: 50n }),
    ]);

    const result = await evaluateAlertThresholds();

    expect(result.created).toBe(1);
    const data = mockPrisma.alert.create.mock.calls[0][0].data;
    expect(data.triggerType).toBe("SPIKE");
    expect(data.observedValue).toBeCloseTo(2);
    expect(data.baselineValue).toBe(50);
  });

  it("skips a combination with no baseline, which would divide by zero", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ metricType: "SPIKE_FACTOR", thresholdVal: 1.5, topicId: "topic-1" }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      aggRow({ recent_total: 100n, baseline_total: 0n }),
    ]);

    const result = await evaluateAlertThresholds();
    expect(result.created).toBe(0);
  });
});

describe("cooldown", () => {
  // Suppression used to key off OPEN or ACKNOWLEDGED status, so an alert
  // nobody resolved silenced its county and topic forever.
  it("records another occurrence instead of a duplicate row inside the cooldown", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow()]);
    mockPrisma.alert.findFirst.mockResolvedValue({ id: "existing", triggeredAt: new Date() });

    const result = await evaluateAlertThresholds();

    expect(result.created).toBe(0);
    expect(result.suppressed).toBe(1);
    expect(mockPrisma.alert.create).not.toHaveBeenCalled();
    const upd = mockPrisma.alert.update.mock.calls[0][0];
    expect(upd.where.id).toBe("existing");
    expect(upd.data.occurrenceCount).toEqual({ increment: 1 });
  });

  it("queries by recency, not by alert status", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ topicId: "topic-1", cooldownMinutes: 120 }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow()]);

    await evaluateAlertThresholds();

    const where = mockPrisma.alert.findFirst.mock.calls[0][0].where;
    expect(where.triggeredAt.gte).toBeInstanceOf(Date);
    expect(where.status).toBeUndefined();
  });

  it("fires again once the cooldown has elapsed", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow()]);
    mockPrisma.alert.findFirst.mockResolvedValue(null);

    const result = await evaluateAlertThresholds();
    expect(result.created).toBe(1);
  });
});

describe("rule scoping", () => {
  it("evaluates only the named county when the rule has one", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ countyId: "county-a", topicId: "topic-1" }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      aggRow({ countyId: "county-a" }),
      aggRow({ countyId: "county-b" }),
    ]);

    const result = await evaluateAlertThresholds();

    expect(result.created).toBe(1);
    expect(mockPrisma.alert.create.mock.calls[0][0].data.countyId).toBe("county-a");
  });

  // A rule with no topic is about the county as a whole, so per-topic rows
  // have to be folded together before the ratio is taken.
  it("sums across topics for a rule with no topic", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([
      threshold({ topicId: null, thresholdVal: 50 }),
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      aggRow({ topicId: "topic-1", recent_total: 60n, recent_negative: 50n }),
      aggRow({ topicId: "topic-2", recent_total: 40n, recent_negative: 30n }),
    ]);

    const result = await evaluateAlertThresholds();

    expect(result.created).toBe(1);
    const data = mockPrisma.alert.create.mock.calls[0][0].data;
    expect(data.eventCount).toBe(100);
    expect(data.observedValue).toBeCloseTo(80);
    expect(data.topicId).toBeNull();
  });

  it("creates one alert per county for a national rule", async () => {
    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([
      aggRow({ countyId: "county-a" }),
      aggRow({ countyId: "county-b" }),
    ]);

    const result = await evaluateAlertThresholds();
    expect(result.created).toBe(2);
  });
});

describe("socket fan-out", () => {
  function socketFor(user: unknown) {
    return { data: { user }, emit: vi.fn() };
  }

  it("emits to national roles and to the matching county only", async () => {
    const national = socketFor({ role: "NATIONAL_ADMIN", countyId: null });
    const analyst = socketFor({ role: "ANALYST", countyId: null });
    const matching = socketFor({ role: "COUNTY_OFFICIAL", countyId: "county-a" });
    const other = socketFor({ role: "COUNTY_OFFICIAL", countyId: "county-b" });
    // A county official whose county was cleared must not receive everything.
    const countyless = socketFor({ role: "COUNTY_OFFICIAL", countyId: null });

    const io = {
      sockets: {
        sockets: [national, analyst, matching, other, countyless],
      },
    } as unknown as import("socket.io").Server;

    mockPrisma.alertThreshold.findMany.mockResolvedValue([threshold({ topicId: "topic-1" })]);
    mockPrisma.$queryRaw.mockResolvedValue([aggRow({ countyId: "county-a" })]);

    await evaluateAlertThresholds(io);

    expect(national.emit).toHaveBeenCalledWith("alert:new", expect.anything());
    expect(analyst.emit).toHaveBeenCalled();
    expect(matching.emit).toHaveBeenCalled();
    expect(other.emit).not.toHaveBeenCalled();
    expect(countyless.emit).not.toHaveBeenCalled();
  });
});
