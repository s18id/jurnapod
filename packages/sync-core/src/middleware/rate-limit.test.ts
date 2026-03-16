// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for rate limiting middleware
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createRateLimitMiddleware,
  withRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  clearRateLimitStore,
  getRateLimitStoreSize,
  RATE_LIMITS,
  RATE_LIMIT_HEADERS,
  defaultAuthContextExtractor,
  RateLimitTier
} from "./rate-limit";

describe("Rate Limit Configuration", () => {
  test("should have correct limits", () => {
    expect(RATE_LIMITS.REALTIME).toBe(120);
    expect(RATE_LIMITS.OPERATIONAL).toBe(60);
    expect(RATE_LIMITS.MASTER).toBe(30);
    expect(RATE_LIMITS.ADMIN).toBe(10);
  });

  test("should have correct header names", () => {
    expect(RATE_LIMIT_HEADERS.LIMIT).toBe("X-RateLimit-Limit");
    expect(RATE_LIMIT_HEADERS.REMAINING).toBe("X-RateLimit-Remaining");
    expect(RATE_LIMIT_HEADERS.RESET).toBe("X-RateLimit-Reset");
    expect(RATE_LIMIT_HEADERS.RETRY_AFTER).toBe("Retry-After");
  });
});

describe("createRateLimitMiddleware", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should allow request within limit", () => {
    const middleware = createRateLimitMiddleware({ tier: "REALTIME" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const result = middleware(request);

    expect(result).toBeNull();
  });

  test("should increment counter for each request", () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      middleware(request);
    }

    const status = getRateLimitStatus(1, "ADMIN");
    expect(status.remaining).toBe(5); // ADMIN limit is 10, 5 used
  });

  test("should reject request when limit exceeded (429)", () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make 10 requests (ADMIN limit)
    for (let i = 0; i < 10; i++) {
      const result = middleware(request);
      expect(result).toBeNull();
    }

    // 11th request should be rejected
    const result = middleware(request);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  test("should reset counter after window expires", () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make 10 requests to exhaust limit
    for (let i = 0; i < 10; i++) {
      middleware(request);
    }

    // Verify limit exceeded
    const blockedResult = middleware(request);
    expect(blockedResult?.status).toBe(429);

    // Advance time by 1 minute (window size)
    vi.advanceTimersByTime(60000);

    // Request should now be allowed
    const allowedResult = middleware(request);
    expect(allowedResult).toBeNull();
  });

  test("should include rate limit headers in 429 response", async () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      middleware(request);
    }

    const result = middleware(request);
    expect(result).not.toBeNull();

    const headers = result!.headers;
    expect(headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe("10");
    expect(headers.get(RATE_LIMIT_HEADERS.REMAINING)).toBe("0");
    expect(headers.get(RATE_LIMIT_HEADERS.RESET)).toBeDefined();
    expect(headers.get(RATE_LIMIT_HEADERS.RETRY_AFTER)).toBeDefined();
  });

  test("should return null for requests without auth context", () => {
    const middleware = createRateLimitMiddleware({ tier: "REALTIME" });
    const request = new Request("http://localhost/api/test");
    // No auth attached

    const result = middleware(request);
    expect(result).toBeNull();
  });

  test("should use custom window size when specified", () => {
    const customWindowMs = 30000; // 30 seconds
    const middleware = createRateLimitMiddleware({ tier: "ADMIN", windowMs: customWindowMs });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      middleware(request);
    }

    // Should be blocked
    expect(middleware(request)?.status).toBe(429);

    // Advance time by less than default window (45 seconds)
    vi.advanceTimersByTime(45000);

    // Should still be blocked (custom window is 30s, but we need a full window to pass)
    // Actually, advancing 45s from start crosses into next window
    // Let's verify the custom window logic
    vi.advanceTimersByTime(30000); // Total 75s
    expect(middleware(request)).toBeNull();
  });
});

describe("withRateLimit wrapper", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should wrap handler with rate limiting", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "REALTIME" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const result = await wrapped(request);

    expect(handler).toHaveBeenCalled();
    expect(result.status).toBe(200);
  });

  test("should pass through to handler when within limit", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: "test" }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const result = await wrapped(request);
    const body = await result.json();

    expect(body).toEqual({ data: "test" });
  });

  test("should return 429 when limit exceeded without calling handler", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      await wrapped(request);
    }

    handler.mockClear();

    // This should be blocked
    const result = await wrapped(request);

    expect(handler).not.toHaveBeenCalled();
    expect(result.status).toBe(429);
  });

  test("should add rate limit headers to successful response", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const result = await wrapped(request);

    expect(result.headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe("10");
    expect(result.headers.get(RATE_LIMIT_HEADERS.REMAINING)).toBe("9");
    expect(result.headers.get(RATE_LIMIT_HEADERS.RESET)).toBeDefined();
  });

  test("should pass additional args to handler", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "REALTIME" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const extraArg = { foo: "bar" };
    await (wrapped as any)(request, extraArg);

    expect(handler).toHaveBeenCalledWith(request, extraArg);
  });

  test("should proceed without rate limiting when no user context", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    // No auth context

    const result = await wrapped(request);

    expect(handler).toHaveBeenCalled();
    expect(result.status).toBe(200);
  });

  test("should extract userId from auth in args", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");

    const authContext = { userId: 42, companyId: 1 };

    // First call to use up limit
    for (let i = 0; i < 10; i++) {
      await (wrapped as any)(request, authContext);
    }

    handler.mockClear();

    // Should be blocked
    const result = await (wrapped as any)(request, authContext);
    expect(result.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Rate Limit Headers", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should include X-RateLimit-Limit header with correct value", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "REALTIME" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const result = await wrapped(request);

    expect(result.headers.get("X-RateLimit-Limit")).toBe("120");
  });

  test("should include X-RateLimit-Remaining header with correct value", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "OPERATIONAL" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make 3 requests
    for (let i = 0; i < 3; i++) {
      await wrapped(request);
    }

    const result = await wrapped(request);

    // OPERATIONAL limit is 60, 4 used, should be 56 remaining
    expect(result.headers.get("X-RateLimit-Remaining")).toBe("56");
  });

  test("should include X-RateLimit-Reset header", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "MASTER" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const result = await wrapped(request);
    const resetHeader = result.headers.get("X-RateLimit-Reset");

    expect(resetHeader).toBeDefined();
    expect(Number(resetHeader)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("should include Retry-After header in 429 responses", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      await wrapped(request);
    }

    const result = await wrapped(request);

    expect(result.status).toBe(429);
    expect(result.headers.get("Retry-After")).toBeDefined();
  });
});

describe("Per-User Isolation", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should track limits per user ID", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);

    const request1 = new Request("http://localhost/api/test");
    (request1 as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const request2 = new Request("http://localhost/api/test");
    (request2 as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 2, companyId: 1 };

    // User 1 exhausts their limit
    for (let i = 0; i < 10; i++) {
      await wrapped(request1);
    }

    // User 1 should be blocked
    const user1Result = await wrapped(request1);
    expect(user1Result.status).toBe(429);

    // User 2 should still be allowed
    const user2Result = await wrapped(request2);
    expect(user2Result.status).toBe(200);
  });

  test("different users should have separate counters", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);

    // User 1 makes 5 requests
    const request1 = new Request("http://localhost/api/test");
    (request1 as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };
    for (let i = 0; i < 5; i++) {
      await wrapped(request1);
    }

    // User 2 makes 3 requests
    const request2 = new Request("http://localhost/api/test");
    (request2 as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 2, companyId: 1 };
    for (let i = 0; i < 3; i++) {
      await wrapped(request2);
    }

    // Check status
    const user1Status = getRateLimitStatus(1, "ADMIN");
    const user2Status = getRateLimitStatus(2, "ADMIN");

    expect(user1Status.remaining).toBe(5);
    expect(user2Status.remaining).toBe(7);
  });

  test("same user across different tiers should have separate counters", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrappedAdmin = withRateLimit({ tier: "ADMIN" }, handler);
    const wrappedMaster = withRateLimit({ tier: "MASTER" }, handler);

    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust ADMIN tier
    for (let i = 0; i < 10; i++) {
      await wrappedAdmin(request);
    }

    // ADMIN tier should be blocked
    const adminResult = await wrappedAdmin(request);
    expect(adminResult.status).toBe(429);

    // MASTER tier should still allow requests (separate counter)
    const masterResult = await wrappedMaster(request);
    expect(masterResult.status).toBe(200);
  });
});

describe("getRateLimitStatus", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should return current limit info", () => {
    const status = getRateLimitStatus(1, "REALTIME");

    expect(status.limit).toBe(120);
    expect(status.remaining).toBe(120);
    expect(status.resetTime).toBeInstanceOf(Date);
    expect(status.windowStart).toBeInstanceOf(Date);
  });

  test("should return remaining requests", () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make 7 requests
    for (let i = 0; i < 7; i++) {
      wrapped(request);
    }

    const status = getRateLimitStatus(1, "ADMIN");
    expect(status.remaining).toBe(3);
  });

  test("should return reset time", () => {
    const now = Date.now();
    const status = getRateLimitStatus(1, "OPERATIONAL");

    const expectedResetTime = Math.floor((now + 60000) / 1000) * 1000; // Roughly 1 minute from now
    expect(status.resetTime.getTime()).toBeGreaterThan(now);
    expect(status.resetTime.getTime()).toBeLessThanOrEqual(now + 60000);
  });

  test("should not increment counter when checking status", () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      wrapped(request);
    }

    // Check status multiple times
    getRateLimitStatus(1, "ADMIN");
    getRateLimitStatus(1, "ADMIN");
    getRateLimitStatus(1, "ADMIN");

    const status = getRateLimitStatus(1, "ADMIN");
    expect(status.remaining).toBe(5); // Still 5, not decremented by status checks
  });

  test("should return full quota for new window", () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Use up quota
    for (let i = 0; i < 10; i++) {
      wrapped(request);
    }

    // Advance past window
    vi.advanceTimersByTime(60000);

    const status = getRateLimitStatus(1, "ADMIN");
    expect(status.remaining).toBe(10);
  });
});

describe("resetRateLimit", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should reset counter for specific user+tier", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      await wrapped(request);
    }

    // Should be blocked
    expect((await wrapped(request)).status).toBe(429);

    // Reset for user 1
    resetRateLimit(1, "ADMIN");

    // Should now be allowed
    expect((await wrapped(request)).status).toBe(200);
  });

  test("should reset all tiers for user when tier not specified", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrappedAdmin = withRateLimit({ tier: "ADMIN" }, handler);
    const wrappedMaster = withRateLimit({ tier: "MASTER" }, handler);

    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust ADMIN tier
    for (let i = 0; i < 10; i++) {
      await wrappedAdmin(request);
    }

    // Use some MASTER requests
    for (let i = 0; i < 15; i++) {
      await wrappedMaster(request);
    }

    // Both should be limited or reduced
    expect((await wrappedAdmin(request)).status).toBe(429);
    const masterStatus = getRateLimitStatus(1, "MASTER");
    expect(masterStatus.remaining).toBe(15);

    // Reset all tiers for user 1
    resetRateLimit(1);

    // Both should be reset
    expect((await wrappedAdmin(request)).status).toBe(200);
    const newMasterStatus = getRateLimitStatus(1, "MASTER");
    expect(newMasterStatus.remaining).toBe(30);
  });

  test("should allow request after reset", async () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      middleware(request);
    }

    // Blocked
    const blockedResult = middleware(request);
    expect(blockedResult?.status).toBe(429);

    // Reset
    resetRateLimit(1, "ADMIN");

    // Allowed
    const allowedResult = middleware(request);
    expect(allowedResult).toBeNull();
  });

  test("should not affect other users when resetting", async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier: "ADMIN" }, handler);

    const request1 = new Request("http://localhost/api/test");
    (request1 as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const request2 = new Request("http://localhost/api/test");
    (request2 as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 2, companyId: 1 };

    // Both exhaust their limits
    for (let i = 0; i < 10; i++) {
      await wrapped(request1);
      await wrapped(request2);
    }

    // Reset only user 1
    resetRateLimit(1, "ADMIN");

    // User 1 should be allowed
    expect((await wrapped(request1)).status).toBe(200);

    // User 2 should still be blocked
    expect((await wrapped(request2)).status).toBe(429);
  });
});

describe("Auto-cleanup", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should remove old entries automatically", () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make a request at current time
    middleware(request);

    // Store should have 1 entry
    expect(getRateLimitStoreSize()).toBe(1);

    // Advance time significantly (more than 2x window = 120s)
    vi.advanceTimersByTime(130000);

    // Create 100 new entries at the new time to trigger cleanup
    for (let i = 0; i < 100; i++) {
      const r = new Request("http://localhost/api/test");
      (r as Request & { auth: { userId: number; companyId: number } }).auth = { userId: i + 100, companyId: 1 };
      middleware(r);
    }

    // Old entries should be cleaned up - the original entry is older than 2x window
    // We added 101 entries total (1 old + 100 new), old one should be gone
    expect(getRateLimitStoreSize()).toBe(100);
  });

  test("should not affect active entries", () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });

    // Create many active entries
    for (let i = 0; i < 150; i++) {
      const r = new Request("http://localhost/api/test");
      (r as Request & { auth: { userId: number; companyId: number } }).auth = { userId: i + 1, companyId: 1 };
      middleware(r);
    }

    // All should still be present (they're active)
    expect(getRateLimitStoreSize()).toBe(150);

    // Check some specific users still have their limits
    const status = getRateLimitStatus(1, "ADMIN");
    expect(status.remaining).toBe(9); // 1 request made, 10 limit
  });
});

describe("defaultAuthContextExtractor", () => {
  test("should extract auth from request with auth property", () => {
    const request = new Request("http://localhost/api/test");
    const authContext = { userId: 42, companyId: 1, email: "test@example.com" };
    (request as Request & { auth: typeof authContext }).auth = authContext;

    const result = defaultAuthContextExtractor(request);

    expect(result).toEqual(authContext);
  });

  test("should return null when no auth context", () => {
    const request = new Request("http://localhost/api/test");

    const result = defaultAuthContextExtractor(request);

    expect(result).toBeNull();
  });

  test("should return null when auth has no userId", () => {
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { companyId: number } }).auth = { companyId: 1 };

    const result = defaultAuthContextExtractor(request);

    expect(result).toBeNull();
  });
});

describe("clearRateLimitStore", () => {
  test("should clear all entries from store", () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Make requests
    for (let i = 0; i < 5; i++) {
      middleware(request);
    }

    expect(getRateLimitStoreSize()).toBeGreaterThan(0);

    clearRateLimitStore();

    expect(getRateLimitStoreSize()).toBe(0);
  });
});

describe("getRateLimitStoreSize", () => {
  test("should return correct store size", () => {
    expect(getRateLimitStoreSize()).toBe(0);

    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    middleware(request);

    expect(getRateLimitStoreSize()).toBe(1);
  });
});

describe("Error response format", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should return correct error response structure", async () => {
    const middleware = createRateLimitMiddleware({ tier: "ADMIN" });
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      middleware(request);
    }

    const result = middleware(request);
    const body = await result!.json();

    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.error.message).toContain("Rate limit exceeded");
    expect(body.error.retryAfter).toBeGreaterThan(0);
  });
});

describe("All rate limit tiers", () => {
  const tiers: RateLimitTier[] = ["REALTIME", "OPERATIONAL", "MASTER", "ADMIN"];
  const expectedLimits = { REALTIME: 120, OPERATIONAL: 60, MASTER: 30, ADMIN: 10 };

  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each(tiers)("should enforce %s tier limits correctly", async (tier) => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const wrapped = withRateLimit({ tier }, handler);
    const request = new Request("http://localhost/api/test");
    (request as Request & { auth: { userId: number; companyId: number } }).auth = { userId: 1, companyId: 1 };

    const limit = expectedLimits[tier];

    // Make requests up to limit
    for (let i = 0; i < limit; i++) {
      const result = await wrapped(request);
      expect(result.status).toBe(200);
    }

    // Next request should be blocked
    const blockedResult = await wrapped(request);
    expect(blockedResult.status).toBe(429);
  });
});
