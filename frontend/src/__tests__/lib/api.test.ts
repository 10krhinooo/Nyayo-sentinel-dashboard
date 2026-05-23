import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture interceptor callbacks so tests can invoke them directly
const captured = vi.hoisted(() => ({
  requestInterceptor: undefined as ((config: any) => Promise<any>) | undefined,
  responseSuccess: undefined as ((res: any) => any) | undefined,
  responseError: undefined as ((err: any) => Promise<any>) | undefined,
}));

const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();

// api instance must be callable — the 401 handler calls `api(originalConfig)`
const mockApiInstance: any = vi.fn();

vi.mock("axios", () => {
  Object.assign(mockApiInstance, {
    interceptors: {
      request: {
        use: vi.fn().mockImplementation((fn: any) => {
          captured.requestInterceptor = fn;
        }),
      },
      response: {
        use: vi.fn().mockImplementation((ok: any, err: any) => {
          captured.responseSuccess = ok;
          captured.responseError = err;
        }),
      },
    },
  });

  return {
    default: {
      create: vi.fn().mockReturnValue(mockApiInstance),
      get: mockAxiosGet,
      post: mockAxiosPost,
    },
  };
});

const { api, clearCsrfToken } = await import("../../lib/api");

beforeEach(() => {
  clearCsrfToken();
  mockAxiosGet.mockReset();
  mockAxiosPost.mockReset();
  mockApiInstance.mockReset();
  mockAxiosGet.mockResolvedValue({ data: { token: "csrf-test-token" } });
});

describe("api instance", () => {
  it("is exported and defined", () => {
    expect(api).toBeDefined();
  });

  it("is created with /api in the base URL and withCredentials: true", async () => {
    const axios = (await import("axios")).default;
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining("/api"),
        withCredentials: true,
      })
    );
  });
});

describe("request interceptor (CSRF token handling)", () => {
  it("passes GET request through without fetching or adding a CSRF token", async () => {
    const config = { method: "get", headers: {} as Record<string, string> };
    const result = await captured.requestInterceptor!(config);

    expect(result.headers["x-csrf-token"]).toBeUndefined();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it("fetches and attaches CSRF token to POST request", async () => {
    const config = { method: "post", headers: {} as Record<string, string> };
    const result = await captured.requestInterceptor!(config);

    expect(result.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(mockAxiosGet).toHaveBeenCalledOnce();
  });

  it("attaches CSRF token to PATCH request", async () => {
    const config = { method: "patch", headers: {} as Record<string, string> };
    const result = await captured.requestInterceptor!(config);

    expect(result.headers["x-csrf-token"]).toBe("csrf-test-token");
  });

  it("attaches CSRF token to DELETE request", async () => {
    const config = { method: "delete", headers: {} as Record<string, string> };
    const result = await captured.requestInterceptor!(config);

    expect(result.headers["x-csrf-token"]).toBe("csrf-test-token");
  });

  it("caches the CSRF token — only one fetch for multiple mutating requests", async () => {
    await captured.requestInterceptor!({ method: "post", headers: {} });
    await captured.requestInterceptor!({ method: "put", headers: {} });
    await captured.requestInterceptor!({ method: "delete", headers: {} });

    expect(mockAxiosGet).toHaveBeenCalledOnce();
  });

  it("re-fetches CSRF token after clearCsrfToken() clears the cache", async () => {
    await captured.requestInterceptor!({ method: "post", headers: {} });
    clearCsrfToken();
    await captured.requestInterceptor!({ method: "post", headers: {} });

    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  });
});

describe("response success handler", () => {
  it("passes the response through unchanged", () => {
    const response = { status: 200, data: { ok: true } };
    expect(captured.responseSuccess!(response)).toBe(response);
  });
});

describe("response error interceptor (401 refresh logic)", () => {
  it("rejects non-401 errors immediately without attempting refresh", async () => {
    const error = { response: { status: 403 }, config: { _retry: false } };

    await expect(captured.responseError!(error)).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("does not retry a request already marked _retry (prevents infinite loop)", async () => {
    const error = { response: { status: 401 }, config: { _retry: true } };

    await expect(captured.responseError!(error)).rejects.toBeDefined();
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("retries the original request after a successful token refresh", async () => {
    mockAxiosPost.mockResolvedValueOnce({});
    mockApiInstance.mockResolvedValueOnce({ data: "retried-response" });
    const originalConfig = { _retry: false, url: "/api/protected" };

    const result = await captured.responseError!({
      response: { status: 401 },
      config: originalConfig,
    });

    expect(mockAxiosPost).toHaveBeenCalledOnce();
    expect(mockApiInstance).toHaveBeenCalledWith(originalConfig);
    expect(result).toEqual({ data: "retried-response" });
  });

  it("clears CSRF token and rejects when token refresh fails", async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error("Network error"));

    await expect(
      captured.responseError!({
        response: { status: 401 },
        config: { _retry: false },
      })
    ).rejects.toBeDefined();

    // CSRF token should be cleared — next mutating request will re-fetch
    await captured.requestInterceptor!({ method: "post", headers: {} });
    expect(mockAxiosGet).toHaveBeenCalled();
  });

  it("queues a concurrent 401 and retries it after the in-flight refresh succeeds", async () => {
    let resolveRefresh!: () => void;
    const slowRefresh = new Promise<void>((resolve) => { resolveRefresh = resolve; });
    mockAxiosPost.mockReturnValueOnce(slowRefresh);
    mockApiInstance.mockResolvedValue({ data: "retried" });

    // First 401 starts the refresh (slow)
    const p1 = captured.responseError!({
      response: { status: 401 },
      config: { _retry: false, url: "/api/a" },
    });

    // Second 401 arrives while refresh is in flight — should queue
    const p2 = captured.responseError!({
      response: { status: 401 },
      config: { _retry: false, url: "/api/b" },
    });

    // Resolve the refresh so both requests can complete
    resolveRefresh();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ data: "retried" });
    expect(r2).toEqual({ data: "retried" });
    expect(mockAxiosPost).toHaveBeenCalledOnce();
  });

  it("rejects all queued requests when the in-flight refresh fails", async () => {
    let rejectRefresh!: (err: Error) => void;
    const slowRefresh = new Promise<void>((_, reject) => { rejectRefresh = reject; });
    mockAxiosPost.mockReturnValueOnce(slowRefresh);

    const p1 = captured.responseError!({
      response: { status: 401 },
      config: { _retry: false, url: "/api/a" },
    });
    const p2 = captured.responseError!({
      response: { status: 401 },
      config: { _retry: false, url: "/api/b" },
    });

    rejectRefresh(new Error("Refresh failed"));

    await expect(p1).rejects.toBeDefined();
    await expect(p2).rejects.toBeDefined();
    expect(mockAxiosPost).toHaveBeenCalledOnce();
  });
});
