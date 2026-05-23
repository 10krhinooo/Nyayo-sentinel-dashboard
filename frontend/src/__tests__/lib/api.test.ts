import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios before importing api.ts so the module uses the mocked version
const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();
const mockAxiosCreate = vi.fn();

vi.mock("axios", () => {
  const interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };

  const instance = {
    interceptors,
    get: vi.fn(),
    post: vi.fn(),
  };

  mockAxiosCreate.mockReturnValue(instance);

  return {
    default: {
      create: mockAxiosCreate,
      get: mockAxiosGet,
      post: mockAxiosPost,
    },
    get: mockAxiosGet,
    post: mockAxiosPost,
    create: mockAxiosCreate,
  };
});

const { api, clearCsrfToken } = await import("../../lib/api");

describe("api module", () => {
  it("exports the api axios instance", () => {
    expect(api).toBeDefined();
  });

  it("creates the axios instance with /api base path", () => {
    expect(mockAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining("/api"),
        withCredentials: true,
      })
    );
  });

  it("registers a request interceptor", () => {
    const instance = mockAxiosCreate.mock.results[0]?.value;
    expect(instance?.interceptors.request.use).toHaveBeenCalled();
  });

  it("registers a response interceptor", () => {
    const instance = mockAxiosCreate.mock.results[0]?.value;
    expect(instance?.interceptors.response.use).toHaveBeenCalled();
  });
});

describe("clearCsrfToken", () => {
  beforeEach(() => {
    clearCsrfToken();
    mockAxiosGet.mockReset();
    mockAxiosGet.mockResolvedValue({ data: { token: "fresh-csrf-token" } });
  });

  it("is exported as a function", () => {
    expect(typeof clearCsrfToken).toBe("function");
  });

  it("does not throw when called", () => {
    expect(() => clearCsrfToken()).not.toThrow();
  });
});
