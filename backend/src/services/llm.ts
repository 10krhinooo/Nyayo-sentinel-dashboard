import OpenAI from "openai";
import { env } from "../config/env";
import type { AlertStats } from "../types/topicContext";

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

const ALERT_SYSTEM_PROMPT =
  `You are an analyst for Nyayo Sentinel, Kenya's civic sentiment early-warning dashboard used by government officials. ` +
  `When asked to summarise an alert, write 2-3 plain-English sentences explaining what is happening, why it matters, and what officials should be aware of. ` +
  `Be specific about the county and topic. Do not use bullet points or repeat raw numbers — describe them in plain language.`;

const BRIEFING_SYSTEM_PROMPT =
  `You are an analyst for Nyayo Sentinel, Kenya's national civic sentiment dashboard. ` +
  `Write a concise 3-4 sentence daily briefing for senior government officials summarising the current national sentiment picture: ` +
  `which topics are generating the most concern, whether the overall mood is improving or worsening, and what areas warrant attention. ` +
  `Use plain English, avoid jargon, and do not repeat raw numbers — describe trends in human terms.`;

export async function generateAlertSummary(params: {
  county: string;
  topic: string | null;
  triggerType: "THRESHOLD" | "SPIKE";
  stats: Pick<AlertStats, "eventCount" | "negativePercent" | "avgScore"> & { negativeCount?: number; sources?: unknown[] };
  headlines: string[];
  isBriefing?: boolean;
}): Promise<string | null> {
  const client = getClient();
  if (!client || params.headlines.length === 0) return null;

  const headlineList = params.headlines
    .slice(0, 15)
    .map((h, i) => `${i + 1}. ${h}`)
    .join("\n");

  const systemPrompt = params.isBriefing ? BRIEFING_SYSTEM_PROMPT : ALERT_SYSTEM_PROMPT;

  const userContent = params.isBriefing
    ? `National sentiment snapshot (last 24 hours):\n` +
      `- Total events: ${params.stats.eventCount}\n` +
      `- Negative sentiment: ${params.stats.negativePercent.toFixed(1)}%\n` +
      `- Leading concern topics: ${params.topic ?? "general"}\n\n` +
      `Recent article headlines:\n${headlineList}\n\nWrite the daily briefing:`
    : `Alert: ${params.triggerType === "SPIKE" ? "an unusual spike in complaint volume" : `high negative public sentiment (${params.stats.negativePercent.toFixed(1)}% negative)`} detected for ${params.topic ?? "general issues"} in ${params.county} county ` +
      `over the last 24 hours (${params.stats.eventCount} total events).\n\n` +
      `Recent article headlines driving this alert:\n${headlineList}\n\nWrite the summary:`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: params.isBriefing ? 300 : 200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    });

    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[llm] generateAlertSummary failed:", err);
    return null;
  }
}
