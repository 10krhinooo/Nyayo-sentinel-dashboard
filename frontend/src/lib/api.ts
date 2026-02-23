import axios from "axios";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: `${apiBaseUrl}/api`,
  withCredentials: true
});

export interface SentimentOverview {
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  sentimentScore: number;
  trendByDay: { day: string; avg_score: number }[];
  topEmergingTopics: { topicId: string; name: string; negativeCount: number }[];
}

