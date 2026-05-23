import { describe, it, expect, vi, beforeEach } from "vitest";

// mockCreate is defined outside beforeEach so tests can assert on calls
const mockCreate = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockCreate.mockReset();

  // Re-register mocks after resetModules clears the module registry.
  // Must use a class (not arrow fn) so `new OpenAI(...)` works in llm.ts.
  const _create = mockCreate;
  vi.doMock("openai", () => ({
    default: class MockOpenAI {
      chat = { completions: { create: _create } };
    },
  }));
});

const BASE_PARAMS = {
  county: "Nairobi",
  topic: "Healthcare",
  triggerType: "THRESHOLD" as const,
  stats: { eventCount: 50, negativePercent: 72.5, avgScore: -0.48 },
  headlines: ["Nairobi hospital turns away patients over drug shortage"],
};

describe("generateAlertSummary", () => {
  it("returns null when OPENAI_API_KEY is not set", async () => {
    vi.doMock("../../config/env", () => ({
      env: { OPENAI_API_KEY: undefined },
    }));
    const { generateAlertSummary } = await import("../../services/llm");

    const result = await generateAlertSummary(BASE_PARAMS);

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns null when headlines array is empty", async () => {
    vi.doMock("../../config/env", () => ({
      env: { OPENAI_API_KEY: "sk-test-key" },
    }));
    const { generateAlertSummary } = await import("../../services/llm");

    const result = await generateAlertSummary({ ...BASE_PARAMS, headlines: [] });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("calls OpenAI with gpt-4o-mini and returns trimmed summary text", async () => {
    vi.doMock("../../config/env", () => ({
      env: { OPENAI_API_KEY: "sk-test-key" },
    }));
    const { generateAlertSummary } = await import("../../services/llm");
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "  Summary of the alert situation.  " } }],
    });

    const result = await generateAlertSummary(BASE_PARAMS);

    expect(result).toBe("Summary of the alert situation.");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" })
    );
  });

  it("includes county and topic in the prompt sent to OpenAI", async () => {
    vi.doMock("../../config/env", () => ({
      env: { OPENAI_API_KEY: "sk-test-key" },
    }));
    const { generateAlertSummary } = await import("../../services/llm");
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Brief summary." } }],
    });

    await generateAlertSummary(BASE_PARAMS);

    const call = mockCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userMessage = call.messages.find((m) => m.content.includes("Nairobi"));
    expect(userMessage).toBeTruthy();
    expect(userMessage?.content).toContain("Healthcare");
  });

  it("returns null and does not throw when OpenAI throws an error", async () => {
    vi.doMock("../../config/env", () => ({
      env: { OPENAI_API_KEY: "sk-test-key" },
    }));
    const { generateAlertSummary } = await import("../../services/llm");
    mockCreate.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const result = await generateAlertSummary(BASE_PARAMS);

    expect(result).toBeNull();
  });
});
