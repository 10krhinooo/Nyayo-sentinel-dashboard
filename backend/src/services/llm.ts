import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import type { AlertStats } from "../types/topicContext";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT =
  `You are an analyst for Nyayo Sentinel, Kenya's civic sentiment early-warning dashboard used by government officials. ` +
  `When asked to summarise an alert, write 2-3 plain-English sentences explaining what is happening, why it matters, and what officials should be aware of. ` +
  `Be specific about the county and topic. Do not use bullet points or repeat raw numbers — describe them in plain language.`;

export async function generateAlertSummary(params: {
  county: string;
  topic: string | null;
  triggerType: "THRESHOLD" | "SPIKE";
  stats: Pick<AlertStats, "eventCount" | "negativePercent" | "avgScore">;
  headlines: string[];
}): Promise<string | null> {
  const client = getClient();
  if (!client || params.headlines.length === 0) return null;

  const headlineList = params.headlines
    .slice(0, 15)
    .map((h, i) => `${i + 1}. ${h}`)
    .join("\n");

  const triggerPhrase =
    params.triggerType === "SPIKE"
      ? "an unusual spike in complaint volume"
      : `high negative public sentiment (${params.stats.negativePercent.toFixed(1)}% negative)`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" }
        }
      ] as Anthropic.Messages.TextBlockParam[],
      messages: [
        {
          role: "user",
          content:
            `Alert: ${triggerPhrase} detected for ${params.topic ?? "general issues"} in ${params.county} county ` +
            `over the last 24 hours (${params.stats.eventCount} total events).\n\n` +
            `Recent article headlines driving this alert:\n${headlineList}\n\nWrite the summary:`
        }
      ]
    });

    const block = response.content[0];
    return block.type === "text" ? block.text.trim() : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[llm] generateAlertSummary failed:", err);
    return null;
  }
}
