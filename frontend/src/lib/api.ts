import axios from "axios";
import { clearUser } from "./auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: `${apiBaseUrl}/api`,
  withCredentials: true
});

// Lazy CSRF token — fetched once on the first mutating request, cleared on logout
let csrfToken: string | null = null;
export function clearCsrfToken() { csrfToken = null; }
async function getCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const res = await axios.get<{ token: string }>(
      `${apiBaseUrl}/api/csrf-token`,
      { withCredentials: true }
    );
    csrfToken = res.data.token;
  }
  return csrfToken;
}

// Attach CSRF token to all state-changing requests
api.interceptors.request.use(async (config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const token = await getCsrfToken();
    config.headers["x-csrf-token"] = token;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<(ok: boolean) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error as Error);
    }
    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((ok) => {
          if (ok) resolve(api(original));
          else reject(error as Error);
        });
      });
    }

    isRefreshing = true;
    try {
      await axios.post(`${apiBaseUrl}/api/auth/token/refresh`, {}, { withCredentials: true });
      refreshQueue.forEach((cb) => cb(true));
      refreshQueue = [];
      return api(original);
    } catch {
      refreshQueue.forEach((cb) => cb(false));
      refreshQueue = [];
      csrfToken = null;
      clearUser();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      return Promise.reject(error as Error);
    } finally {
      isRefreshing = false;
    }
  }
);

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
