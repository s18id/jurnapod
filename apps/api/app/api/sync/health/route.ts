// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth } from "@/lib/auth-guard";
import { checkSyncModuleHealth } from "@/lib/sync-modules";
import { readClientIp } from "@/lib/request-meta";

// ADMIN tier rate limit: 10 requests per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(userId: number, ipAddress: string | null): string {
  return `sync-health:${userId}:${ipAddress ?? "unknown"}`;
}

function checkRateLimit(
  key: string
): { allowed: boolean; limit: number; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // New window or expired window
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(key, {
      count: 1,
      resetAt
    });
    return {
      allowed: true,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt
    };
  }

  // Within current window
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: 0,
      resetAt: entry.resetAt
    };
  }

  entry.count++;
  return {
    allowed: true,
    limit: RATE_LIMIT_MAX_REQUESTS,
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
    resetAt: entry.resetAt
  };
}

function createRateLimitResponse(resetAt: number): Response {
  const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
  return Response.json(
    {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit exceeded. Please try again later."
      }
    },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(1, retryAfterSeconds).toString()
      }
    }
  );
}

const healthHandler = async (request: Request, auth: { userId: number; companyId: number }) => {
  // Check rate limit
  const ipAddress = readClientIp(request);
  const rateLimitKey = getRateLimitKey(auth.userId, ipAddress);
  const rateLimitResult = checkRateLimit(rateLimitKey);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult.resetAt);
  }

  try {
    const healthStatus = await checkSyncModuleHealth();

    if (!healthStatus.healthy) {
      return Response.json({
        success: false,
        error: {
          code: "SYNC_UNHEALTHY",
          message: "One or more sync modules are unhealthy",
          modules: healthStatus.modules
        }
      }, {
        status: 503,
        headers: {
          "X-RateLimit-Limit": rateLimitResult.limit.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": Math.ceil(rateLimitResult.resetAt / 1000).toString()
        }
      });
    }

    return Response.json({
      success: true,
      data: {
        status: "healthy",
        modules: healthStatus.modules,
        timestamp: new Date().toISOString()
      }
    }, {
      headers: {
        "X-RateLimit-Limit": rateLimitResult.limit.toString(),
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(rateLimitResult.resetAt / 1000).toString()
      }
    });

  } catch (error) {
    console.error("Sync health check error:", error);
    return Response.json({
      success: false,
      error: {
        code: "HEALTH_CHECK_ERROR",
        message: "Failed to check sync module health"
      }
    }, {
      status: 500,
      headers: {
        "X-RateLimit-Limit": rateLimitResult.limit.toString(),
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(rateLimitResult.resetAt / 1000).toString()
      }
    });
  }
};

export const GET = withAuth(healthHandler);