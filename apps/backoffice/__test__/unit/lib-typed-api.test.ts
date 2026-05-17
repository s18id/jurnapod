// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for the typed API client (lib/api/client.ts).
// Tests the auth-aware fetch wrapper: Bearer injection, 401 → refresh → retry,
// and error handling.
//
// Run with:
//   npx vitest run --config apps/backoffice/vitest.config.ts __test__/unit/lib-typed-api.test.ts

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Hoisted mocks — must be defined before any imports that use them
// ============================================================================

const {
  mockGetStoredAccessToken,
  mockStoreAccessToken,
  mockGetApiBaseUrl,
  mockFetch,
  TEST_TOKEN,
  TEST_BASE_URL,
  NEW_TOKEN,
} = vi.hoisted(() => {
  const TEST_TOKEN = "test-access-token-typed-abc";
  const TEST_BASE_URL = "https://typed.jurnapod.example.com/api";
  const NEW_TOKEN = "new-refreshed-token-typed-xyz";

  return {
    mockGetStoredAccessToken: vi.fn().mockReturnValue(TEST_TOKEN),
    mockStoreAccessToken: vi.fn(),
    mockGetApiBaseUrl: vi.fn().mockReturnValue(TEST_BASE_URL),
    mockFetch: vi.fn(),
    TEST_TOKEN,
    TEST_BASE_URL,
    NEW_TOKEN,
  };
});

vi.mock("@/lib/auth-storage", () => ({
  getStoredAccessToken: mockGetStoredAccessToken,
  storeAccessToken: mockStoreAccessToken,
  clearAccessToken: vi.fn(),
}));

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: mockGetApiBaseUrl,
}));

vi.stubGlobal("fetch", mockFetch);

// ============================================================================
// Import module under test
// ============================================================================

import { api, createTypedClient, ApiError } from "@/lib/api/client";

// ============================================================================
// Test helpers
// ============================================================================

function createSuccessResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function create401Response() {
  return Promise.resolve(
    new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Token expired" } }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    ),
  );
}

function createRefreshSuccessResponse(newToken: string) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        success: true,
        data: { access_token: newToken, token_type: "Bearer", expires_in: 3600 },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    ),
  );
}

function createRefreshFailResponse() {
  return Promise.resolve(
    new Response(
      JSON.stringify({ success: false, error: { code: "REFRESH_FAILED", message: "Refresh token expired" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    ),
  );
}

/** Extract the mockFetch's first-arg Request to inspect its properties */
function getFirstCallRequest(): Request {
  const [req] = mockFetch.mock.calls[0] as [Request];
  return req;
}

// ============================================================================
// Tests
// ============================================================================

describe("Typed API Client — Auth Behavior", () => {
  beforeEach(() => {
    mockGetStoredAccessToken.mockReturnValue(TEST_TOKEN);
    mockGetApiBaseUrl.mockReturnValue(TEST_BASE_URL);
    mockStoreAccessToken.mockClear();
    mockFetch.mockClear();
    mockFetch.mockImplementation(() => createSuccessResponse({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // AI-1: Bearer header injection
  // ------------------------------------------------------------------

  test("injects Bearer token from storage on every request", async () => {
    await api.GET("/users");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const req = getFirstCallRequest();
    expect(req.headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  });

  test("does not inject token when storage returns null", async () => {
    mockGetStoredAccessToken.mockReturnValue(null);

    await api.GET("/health");

    const req = getFirstCallRequest();
    expect(req.headers.get("Authorization")).toBeNull();
  });

  // ------------------------------------------------------------------
  // AI-2: 401 → refresh → retry
  // ------------------------------------------------------------------

  test("401 triggers silent refresh and retries with new token", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return create401Response();
      if (callCount === 2) return createRefreshSuccessResponse(NEW_TOKEN);
      return createSuccessResponse({ data: "ok" });
    });

    await api.GET("/users");

    // 1st call: original request, gets 401 → Request object from openapi-fetch
    // 2nd call: refresh request → string URL + init (from silentRefreshToken)
    // 3rd call: retry with new token → Request object from wrapper
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Check refresh endpoint was called (2nd call uses string URL)
    const refreshFirstArg = mockFetch.mock.calls[1][0];
    expect(refreshFirstArg).toBe(`${TEST_BASE_URL}/auth/refresh`);

    // Check retry has new token
    const retryReq = mockFetch.mock.calls[2][0] as Request;
    expect(retryReq.headers.get("Authorization")).toBe(`Bearer ${NEW_TOKEN}`);
    expect(retryReq.headers.get("x-jp-retry")).toBe("1");

    // Token was stored
    expect(mockStoreAccessToken).toHaveBeenCalledWith(NEW_TOKEN);
  });

  test("401 with failed refresh returns the 401 error response", async () => {
    mockFetch
      .mockImplementationOnce(() => create401Response())
      .mockImplementationOnce(() => createRefreshFailResponse());

    const { response } = await api.GET("/users");
    expect(response.status).toBe(401);
  });

  test("does not retry more than once (x-jp-retry guard)", async () => {
    mockFetch.mockImplementation(() => create401Response());

    const { response } = await api.GET("/users");
    expect(response.status).toBe(401);
    // original + refresh attempt = max 2 calls; guard prevents further retry
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
  });

  // ------------------------------------------------------------------
  // AI-3: POST requests with body
  // ------------------------------------------------------------------

  test("sends POST request with Authorization header", async () => {
    await api.POST("/auth/login", {
      body: { companyCode: "C001", email: "user@test.com", password: "pass" },
    });

    const req = getFirstCallRequest();
    expect(req.headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
    // openapi-fetch sets method on the Request object
    expect(req.method).toBe("POST");
  });
});

// ============================================================================
// Factory function tests
// ============================================================================

describe("createTypedClient", () => {
  beforeEach(() => {
    mockGetStoredAccessToken.mockReturnValue(TEST_TOKEN);
    mockGetApiBaseUrl.mockReturnValue(TEST_BASE_URL);
    mockFetch.mockClear();
    mockFetch.mockImplementation(() => createSuccessResponse({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates a client with the default base URL", async () => {
    const client = createTypedClient();
    await client.GET("/health");

    const req = getFirstCallRequest();
    expect(req.url).toBe(`${TEST_BASE_URL}/health`);
  });

  test("creates a client with a custom base URL", async () => {
    const client = createTypedClient({ baseUrl: "https://custom.example.com/api" });
    await client.GET("/health");

    const req = getFirstCallRequest();
    expect(req.url).toBe("https://custom.example.com/api/health");
  });
});

// ============================================================================
// Error class tests
// ============================================================================

describe("ApiError", () => {
  test("creates an ApiError with status, code, and message", () => {
    const err = new ApiError(404, "NOT_FOUND", "Resource not found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Resource not found");
  });
});
