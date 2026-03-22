// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Health Routes
 *
 * GET /sync/health - Check sync module health
 */

import { Hono } from "hono";
import { checkSyncModuleHealth } from "../../lib/sync-modules.js";
import { readClientIp } from "../../lib/request-meta.js";
import { authenticateRequest } from "../../lib/auth-guard.js";
import type { AuthContext } from "../../lib/auth-guard.js";

// Extend Hono context with auth
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// ADMIN tier rate limit: 10 requests per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function getRateLimitKey(userId: number, ipAddress: string | null): string {
  return `sync-health:${userId}:${ipAddress ?? "unknown"}`;
}

function checkRateLimit(key: string): { allowed: boolean; limit: number; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, limit: RATE_LIMIT_MAX_REQUESTS, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, limit: RATE_LIMIT_MAX_REQUESTS, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, limit: RATE_LIMIT_MAX_REQUESTS, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

function createRateLimitResponse(resetAt: number): Response {
  const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
  return Response.json(
    {
      success: false,
      error: { code: "RATE_LIMIT_EXCEEDED", message: "Rate limit exceeded. Please try again later." }
    },
    { status: 429, headers: { "Retry-After": Math.max(1, retryAfterSeconds).toString() } }
  );
}

const healthRoutes = new Hono();

// Auth middleware for health routes - MUST be applied BEFORE route handlers
healthRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

healthRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const ipAddress = readClientIp(c.req.raw);
  const rateLimitKey = getRateLimitKey(auth.userId, ipAddress);
  const rateLimitResult = checkRateLimit(rateLimitKey);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult.resetAt);
  }

  try {
    const healthStatus = await checkSyncModuleHealth();

    if (!healthStatus.healthy) {
      return Response.json(
        {
          success: false,
          error: { code: "SYNC_UNHEALTHY", message: "One or more sync modules are unhealthy", modules: healthStatus.modules }
        },
        {
          status: 503,
          headers: {
            "X-RateLimit-Limit": rateLimitResult.limit.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": Math.ceil(rateLimitResult.resetAt / 1000).toString()
          }
        }
      );
    }

    return Response.json(
      {
        success: true,
        data: { status: "healthy", modules: healthStatus.modules, timestamp: new Date().toISOString() }
      },
      {
        headers: {
          "X-RateLimit-Limit": rateLimitResult.limit.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": Math.ceil(rateLimitResult.resetAt / 1000).toString()
        }
      }
    );
  } catch (error) {
    console.error("Sync health check error:", error);
    return Response.json(
      { success: false, error: { code: "HEALTH_CHECK_ERROR", message: "Failed to check sync module health" } },
      { status: 500 }
    );
  }
});

export { healthRoutes };
