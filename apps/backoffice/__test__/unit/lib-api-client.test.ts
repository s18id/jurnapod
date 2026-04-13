// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Behavioral regression tests for backoffice API client.
// Run with: npx vitest run --config apps/backoffice/vitest.config.ts

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks - use vi.hoisted() so mocks are available at top-level hoisting time
// ============================================================================

const { mockGetStoredAccessToken, mockGetApiBaseUrl, mockRequestRefreshToken, mockFetch, TEST_TOKEN, TEST_BASE_URL, NEW_TOKEN } = vi.hoisted(() => {
  const TEST_TOKEN = "test-access-token-12345";
  const TEST_BASE_URL = "https://test.jurnapod.example.com/api";
  const NEW_TOKEN = "new-refreshed-token-67890";

  return {
    mockGetStoredAccessToken: vi.fn().mockReturnValue(TEST_TOKEN),
    mockGetApiBaseUrl: vi.fn().mockReturnValue(TEST_BASE_URL),
    mockRequestRefreshToken: vi.fn(),
    mockFetch: vi.fn(),
    TEST_TOKEN,
    TEST_BASE_URL,
    NEW_TOKEN,
  };
});

vi.mock("@/lib/auth-storage", () => ({
  getStoredAccessToken: mockGetStoredAccessToken,
}));

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: mockGetApiBaseUrl,
}));

vi.mock("@/lib/auth-refresh", () => ({
  requestRefreshToken: mockRequestRefreshToken,
}));

// Set up global fetch mock BEFORE importing the module under test
// This ensures the module uses our mocked fetch when it accesses the global
vi.stubGlobal("fetch", mockFetch);

// ============================================================================
// Import module under test
// ============================================================================

import { resolveToken, apiRequest, uploadWithProgress, ApiError } from "@/lib/api-client";

// ============================================================================
// Test Helpers
// ============================================================================

function createSuccessfulResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function create401Response() {
  return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Token expired" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

// ============================================================================
// AI-1: resolveToken() token resolution tests
// ============================================================================

describe("resolveToken", () => {
  beforeEach(() => {
    // Reset mocks to default behavior before each test
    mockGetStoredAccessToken.mockReturnValue(TEST_TOKEN);
    mockGetApiBaseUrl.mockReturnValue(TEST_BASE_URL);
    mockRequestRefreshToken.mockClear();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("resolveToken with explicit string returns string unchanged", () => {
    const result = resolveToken("my-explicit-token");
    expect(result).toBe("my-explicit-token");
  });

  test("resolveToken with options.accessToken uses options override", () => {
    const result = resolveToken({ accessToken: "override-token" });
    expect(result).toBe("override-token");
  });

  test("resolveToken falls back to getStoredAccessToken when called with no args", () => {
    mockGetStoredAccessToken.mockReturnValue("stored-token-value");

    const result = resolveToken();

    expect(mockGetStoredAccessToken).toHaveBeenCalled();
    expect(result).toBe("stored-token-value");
  });

  test("resolveToken with skipAuth=true returns undefined even if token exists", () => {
    mockGetStoredAccessToken.mockReturnValue("some-token");

    const result = resolveToken({ skipAuth: true });

    expect(result).toBeUndefined();
    // getStoredAccessToken should NOT be called when skipAuth is true
    expect(mockGetStoredAccessToken).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AI-1: apiRequest sets Bearer header from stored token
// ============================================================================

describe("apiRequest sets Bearer header from stored token", () => {
  beforeEach(() => {
    mockGetStoredAccessToken.mockReturnValue(TEST_TOKEN);
    mockGetApiBaseUrl.mockReturnValue(TEST_BASE_URL);
    mockRequestRefreshToken.mockClear();
    mockFetch.mockClear().mockResolvedValue(
      createSuccessfulResponse({ success: true })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("apiRequest sets Authorization header with Bearer token from storage", async () => {
    await apiRequest("/test-endpoint", {}, { accessToken: TEST_TOKEN });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/test-endpoint`,
      expect.objectContaining({
        credentials: "include",
      })
    );

    // Headers is a proper Headers object, use .get() to check values
    const callArgs = mockFetch.mock.calls[0];
    const headersArg = callArgs[1].headers as Headers;
    expect(headersArg.get("authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  });
});

// ============================================================================
// AI-2: 401 refresh-and-retry cycle tests
// ============================================================================

describe("apiRequest 401 refresh-and-retry cycle", () => {
  beforeEach(() => {
    mockGetStoredAccessToken.mockReturnValue(TEST_TOKEN);
    mockGetApiBaseUrl.mockReturnValue(TEST_BASE_URL);
    mockRequestRefreshToken.mockClear();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("apiRequest on 401 calls requestRefreshToken and retries with new token", async () => {
    // First call returns 401, second call returns success
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return create401Response();
      }
      return createSuccessfulResponse({ data: "success-after-refresh" });
    });

    mockRequestRefreshToken.mockResolvedValue(NEW_TOKEN);

    const result = await apiRequest<{ data: string }>("/protected-endpoint");

    expect(mockRequestRefreshToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: "success-after-refresh" });

    // Verify retry used new token
    const secondCall = mockFetch.mock.calls[1];
    // Access headers from the second call - Headers object stores values differently
    const headers = secondCall[1].headers;
    expect(headers.get("authorization")).toBe(`Bearer ${NEW_TOKEN}`);
  });

  test("apiRequest on 401 with failed refresh throws ApiError", async () => {
    mockFetch.mockResolvedValue(create401Response());
    mockRequestRefreshToken.mockResolvedValue(null);

    await expect(apiRequest("/protected-endpoint")).rejects.toThrow(ApiError);

    expect(mockRequestRefreshToken).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// AI-3: uploadWithProgress progress callback tests
// ============================================================================

describe("uploadWithProgress", () => {
  beforeEach(() => {
    mockGetStoredAccessToken.mockReturnValue(TEST_TOKEN);
    mockGetApiBaseUrl.mockReturnValue(TEST_BASE_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uploadWithProgress fires progress callback with correct percentage", async () => {
    // Create mock XHR instance
    const mockXHREvents: Record<string, Array<(event: ProgressEvent) => void>> = {
      progress: [],
      load: [],
      error: [],
      abort: [],
    };

    const mockXHR = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      upload: {
        addEventListener: vi.fn((event: string, handler: (event: ProgressEvent) => void) => {
          mockXHREvents[event]?.push(handler);
        }),
      },
      addEventListener: vi.fn((event: string, handler: (event: ProgressEvent) => void) => {
        mockXHREvents[event]?.push(handler);
      }),
      status: 200,
      responseText: JSON.stringify({ success: true }),
    };

    vi.stubGlobal("XMLHttpRequest", vi.fn(() => mockXHR));

    const progressCallback = vi.fn();
    const formData = new FormData();
    formData.append("file", new Blob(["test"], { type: "image/png" }), "test.png");

    const uploadPromise = uploadWithProgress("/upload-endpoint", formData, progressCallback);

    // Simulate progress event: 500 out of 1000 bytes = 50%
    const progressHandler = mockXHREvents.progress[0];
    const mockProgressEvent = {
      lengthComputable: true,
      loaded: 500,
      total: 1000,
    } as unknown as ProgressEvent;

    progressHandler(mockProgressEvent);
    expect(progressCallback).toHaveBeenCalledWith(50); // 500/1000 = 50%

    // Simulate load completion to resolve promise
    const loadHandler = mockXHREvents.load[0];
    loadHandler({} as ProgressEvent);

    await uploadPromise;
  });

  test("uploadWithProgress does not fire callback when lengthNotComputable", async () => {
    const mockXHREvents: Record<string, Array<(event: ProgressEvent) => void>> = {
      progress: [],
      load: [],
      error: [],
      abort: [],
    };

    const mockXHR = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      upload: {
        addEventListener: vi.fn((event: string, handler: (event: ProgressEvent) => void) => {
          mockXHREvents[event]?.push(handler);
        }),
      },
      addEventListener: vi.fn((event: string, handler: (event: ProgressEvent) => void) => {
        mockXHREvents[event]?.push(handler);
      }),
      status: 200,
      responseText: JSON.stringify({ success: true }),
    };

    vi.stubGlobal("XMLHttpRequest", vi.fn(() => mockXHR));

    const progressCallback = vi.fn();
    const formData = new FormData();

    const uploadPromise = uploadWithProgress("/upload-endpoint", formData, progressCallback);

    // Simulate non-computable progress event
    const progressHandler = mockXHREvents.progress[0];
    const mockProgressEvent = {
      lengthComputable: false,
      loaded: 500,
      total: 0,
    } as unknown as ProgressEvent;

    progressHandler(mockProgressEvent);
    expect(progressCallback).not.toHaveBeenCalled();

    // Simulate load completion
    const loadHandler = mockXHREvents.load[0];
    loadHandler({} as ProgressEvent);

    await uploadPromise;
  });

  test("uploadWithProgress calculates 100% when upload completes", async () => {
    const mockXHREvents: Record<string, Array<(event: ProgressEvent) => void>> = {
      progress: [],
      load: [],
      error: [],
      abort: [],
    };

    const mockXHR = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      upload: {
        addEventListener: vi.fn((event: string, handler: (event: ProgressEvent) => void) => {
          mockXHREvents[event]?.push(handler);
        }),
      },
      addEventListener: vi.fn((event: string, handler: (event: ProgressEvent) => void) => {
        mockXHREvents[event]?.push(handler);
      }),
      status: 200,
      responseText: JSON.stringify({ success: true }),
    };

    vi.stubGlobal("XMLHttpRequest", vi.fn(() => mockXHR));

    const progressCallback = vi.fn();
    const formData = new FormData();
    formData.append("file", new Blob(["test"], { type: "image/png" }), "test.png");

    const uploadPromise = uploadWithProgress("/upload-endpoint", formData, progressCallback);

    // Simulate progress at 100%
    const progressHandler = mockXHREvents.progress[0];
    progressHandler({
      lengthComputable: true,
      loaded: 1000,
      total: 1000,
    } as unknown as ProgressEvent);

    expect(progressCallback).toHaveBeenCalledWith(100);

    // Complete upload
    const loadHandler = mockXHREvents.load[0];
    loadHandler({} as ProgressEvent);

    await uploadPromise;
  });
});
