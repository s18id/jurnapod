// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Rate limiting middleware for sync API endpoints.
 * Tracks requests per user/API key per endpoint and enforces limits based on sync tier.
 */

/**
 * Rate limit tiers with their corresponding request limits per minute
 */
export const RATE_LIMITS = {
  REALTIME: 120,
  OPERATIONAL: 60,
  MASTER: 30,
  ADMIN: 10
} as const;

export type RateLimitTier = keyof typeof RATE_LIMITS;

/**
 * Configuration for rate limit middleware
 */
export interface RateLimitConfig {
  tier: RateLimitTier;
  windowMs?: number; // default: 60000 (1 minute)
}

/**
 * Information about current rate limit status
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  windowStart: Date;
}

/**
 * Rate limit entry stored in memory
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  windowStart: number;
}

/**
 * Context object containing authenticated user information
 * Compatible with Next.js App Router and Express
 */
export interface RateLimitAuthContext {
  userId: number | string;
  companyId: number;
  email?: string | null;
}

/**
 * Function to extract auth context from request
 * Should be provided by the integrating application
 */
export type AuthContextExtractor = (request: Request) => RateLimitAuthContext | null;

/**
 * Headers added to rate-limited responses
 */
export const RATE_LIMIT_HEADERS = {
  LIMIT: "X-RateLimit-Limit",
  REMAINING: "X-RateLimit-Remaining",
  RESET: "X-RateLimit-Reset",
  RETRY_AFTER: "Retry-After"
} as const;

/**
 * In-memory store for rate limit tracking
 * Structure: Map<key, RateLimitEntry>
 * where key = `${userId}:${tier}:${Math.floor(Date.now() / windowMs)}`
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Cleanup old entries from the rate limit store
 * Removes entries older than 2x the window size
 */
function cleanupOldEntries(windowMs: number): void {
  const cutoffTime = Date.now() - windowMs * 2;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < cutoffTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get or create a rate limit entry for the given key
 */
function getOrCreateEntry(key: string, windowMs: number, now: number): RateLimitEntry {
  const existing = rateLimitStore.get(key);
  
  if (existing && existing.resetTime > now) {
    return existing;
  }
  
  // Create new entry for this window
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const newEntry: RateLimitEntry = {
    count: 0,
    resetTime: windowStart + windowMs,
    windowStart
  };
  
  rateLimitStore.set(key, newEntry);
  return newEntry;
}

/**
 * Build the rate limit key for a user and tier
 */
function buildRateLimitKey(userId: number | string, tier: RateLimitTier, windowMs: number): string {
  const windowIndex = Math.floor(Date.now() / windowMs);
  return `${userId}:${tier}:${windowIndex}`;
}

/**
 * Check if the request exceeds the rate limit
 */
function checkRateLimit(
  userId: number | string,
  tier: RateLimitTier,
  windowMs: number
): { allowed: boolean; info: RateLimitInfo } {
  const limit = RATE_LIMITS[tier];
  const now = Date.now();
  const key = buildRateLimitKey(userId, tier, windowMs);
  
  // Cleanup old entries periodically (approximately every 100 requests)
  if (rateLimitStore.size > 0 && rateLimitStore.size % 100 === 0) {
    cleanupOldEntries(windowMs);
  }
  
  const entry = getOrCreateEntry(key, windowMs, now);
  
  // Check if limit exceeded
  if (entry.count >= limit) {
    return {
      allowed: false,
      info: {
        limit,
        remaining: 0,
        resetTime: new Date(entry.resetTime),
        windowStart: new Date(entry.windowStart)
      }
    };
  }
  
  // Increment counter
  entry.count++;
  
  return {
    allowed: true,
    info: {
      limit,
      remaining: Math.max(0, limit - entry.count),
      resetTime: new Date(entry.resetTime),
      windowStart: new Date(entry.windowStart)
    }
  };
}

/**
 * Create rate limit headers for the response
 */
function createRateLimitHeaders(info: RateLimitInfo): Record<string, string> {
  return {
    [RATE_LIMIT_HEADERS.LIMIT]: String(info.limit),
    [RATE_LIMIT_HEADERS.REMAINING]: String(info.remaining),
    [RATE_LIMIT_HEADERS.RESET]: String(Math.floor(info.resetTime.getTime() / 1000))
  };
}

/**
 * Response body for rate limit exceeded (429)
 */
interface RateLimitExceededResponse {
  success: false;
  error: {
    code: "RATE_LIMIT_EXCEEDED";
    message: string;
    retryAfter: number;
  };
}

/**
 * Create a 429 Too Many Requests response
 */
function createRateLimitResponse(info: RateLimitInfo): Response {
  const retryAfterSeconds = Math.ceil((info.resetTime.getTime() - Date.now()) / 1000);
  const body: RateLimitExceededResponse = {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      retryAfter: retryAfterSeconds
    }
  };
  
  const headers = new Headers({
    "Content-Type": "application/json",
    [RATE_LIMIT_HEADERS.LIMIT]: String(info.limit),
    [RATE_LIMIT_HEADERS.REMAINING]: "0",
    [RATE_LIMIT_HEADERS.RESET]: String(Math.floor(info.resetTime.getTime() / 1000)),
    [RATE_LIMIT_HEADERS.RETRY_AFTER]: String(retryAfterSeconds)
  });
  
  return new Response(JSON.stringify(body), {
    status: 429,
    headers
  });
}

/**
 * Default function to extract user ID from JWT auth context
 * Compatible with the auth-guard pattern used in apps/api
 */
export function defaultAuthContextExtractor(request: Request): RateLimitAuthContext | null {
  // Try to get auth context from request object (set by auth middleware)
  // For Next.js App Router, this might be in a custom property
  const reqWithAuth = request as Request & { auth?: RateLimitAuthContext };
  if (reqWithAuth.auth?.userId) {
    return reqWithAuth.auth;
  }
  
  return null;
}

/**
 * Create rate limit middleware for Next.js App Router
 * 
 * @param config - Rate limit configuration
 * @param authExtractor - Optional function to extract auth context (defaults to defaultAuthContextExtractor)
 * @returns Next.js route handler middleware function
 * 
 * @example
 * ```typescript
 * // In your route.ts
 * import { createRateLimitMiddleware, RATE_LIMITS } from "@jurnapod/sync-core/middleware/rate-limit";
 * import { withAuth } from "@/lib/auth-guard";
 * 
 * const rateLimit = createRateLimitMiddleware({ tier: "REALTIME" });
 * 
 * export const POST = withAuth(async (request, auth) => {
 *   // Attach auth to request for rate limiter
 *   (request as any).auth = auth;
 *   
 *   const rateLimitResult = rateLimit(request);
 *   if (rateLimitResult) {
 *     return rateLimitResult;
 *   }
 *   
 *   // Continue with your handler logic
 *   return Response.json({ success: true });
 * });
 * ```
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig,
  authExtractor: AuthContextExtractor = defaultAuthContextExtractor
): (request: Request) => Response | null {
  const windowMs = config.windowMs ?? 60000; // Default 1 minute
  const limit = RATE_LIMITS[config.tier];
  
  return function rateLimitMiddleware(request: Request): Response | null {
    const auth = authExtractor(request);
    
    if (!auth) {
      // If no auth context, we can't rate limit - let the request through
      // Auth middleware should handle unauthenticated requests
      return null;
    }
    
    const { allowed, info } = checkRateLimit(auth.userId, config.tier, windowMs);
    
    if (!allowed) {
      return createRateLimitResponse(info);
    }
    
    // Request allowed - headers will be added by wrapWithRateLimitHeaders
    return null;
  };
}

/**
 * Higher-order function to wrap a Next.js route handler with rate limiting
 * Automatically adds rate limit headers to successful responses
 * 
 * @param config - Rate limit configuration
 * @param handler - The route handler to wrap
 * @returns Wrapped handler with rate limiting
 * 
 * @example
 * ```typescript
 * // In your route.ts
 * import { withRateLimit } from "@jurnapod/sync-core/middleware/rate-limit";
 * import { withAuth } from "@/lib/auth-guard";
 * 
 * async function handler(request: Request, auth: AuthContext) {
 *   return Response.json({ data: "success" });
 * }
 * 
 * export const POST = withAuth(withRateLimit({ tier: "REALTIME" }, handler));
 * ```
 */
export function withRateLimit<T extends (request: Request, ...args: unknown[]) => Promise<Response> | Response>(
  config: RateLimitConfig,
  handler: T
): (request: Request, ...args: Parameters<T> extends [Request, ...infer Rest] ? Rest : never[]) => Promise<Response> {
  const windowMs = config.windowMs ?? 60000;
  
  return async function rateLimitedHandler(
    request: Request,
    ...args: Parameters<T> extends [Request, ...infer Rest] ? Rest : never[]
  ): Promise<Response> {
    // Extract user ID - try to get from request context or args
    let userId: number | string | undefined;
    
    // Check if auth context is in request
    const reqWithAuth = request as Request & { auth?: RateLimitAuthContext };
    if (reqWithAuth.auth?.userId) {
      userId = reqWithAuth.auth.userId;
    }
    
    // Check if auth is in args (from withAuth wrapper)
    for (const arg of args) {
      if (
        typeof arg === "object" &&
        arg !== null &&
        "userId" in arg &&
        (typeof arg.userId === "number" || typeof arg.userId === "string")
      ) {
        userId = arg.userId;
        break;
      }
    }
    
    if (!userId) {
      // No user context found - proceed without rate limiting
      return handler(request, ...args) as Promise<Response>;
    }
    
    const { allowed, info } = checkRateLimit(userId, config.tier, windowMs);
    
    if (!allowed) {
      return createRateLimitResponse(info);
    }
    
    // Call the handler
    const response = await handler(request, ...args);
    
    // Add rate limit headers to successful response
    const headers = createRateLimitHeaders(info);
    const newHeaders = new Headers(response.headers);
    
    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  };
}

/**
 * Create a rate limit middleware specifically for Express-style applications
 * 
 * @param config - Rate limit configuration
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * // Express usage
 * import { createExpressRateLimitMiddleware } from "@jurnapod/sync-core/middleware/rate-limit";
 * 
 * app.use("/api/sync", createExpressRateLimitMiddleware({ tier: "OPERATIONAL" }));
 * ```
 */
export function createExpressRateLimitMiddleware(config: RateLimitConfig) {
  const windowMs = config.windowMs ?? 60000;
  
  return function expressRateLimitMiddleware(
    req: { user?: { id: number | string } },
    res: {
      status: (code: number) => { json: (body: unknown) => void; set: (header: string, value: string) => void };
      set: (header: string, value: string) => void;
      json: (body: unknown) => void;
    },
    next: () => void
  ): void {
    const userId = req.user?.id;
    
    if (!userId) {
      // No user context - proceed (auth middleware should handle this)
      next();
      return;
    }
    
    const { allowed, info } = checkRateLimit(userId, config.tier, windowMs);
    
    // Add rate limit headers to all responses
    const headers = createRateLimitHeaders(info);
    for (const [key, value] of Object.entries(headers)) {
      res.set(key, value);
    }
    
    if (!allowed) {
      const retryAfterSeconds = Math.ceil((info.resetTime.getTime() - Date.now()) / 1000);
      res.set(RATE_LIMIT_HEADERS.RETRY_AFTER, String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
          retryAfter: retryAfterSeconds
        }
      });
      return;
    }
    
    next();
  };
}

/**
 * Get current rate limit status for a user without incrementing the counter
 * Useful for health checks or status endpoints
 * 
 * @param userId - The user ID to check
 * @param tier - The rate limit tier
 * @param windowMs - Optional custom window size (default: 60000)
 * @returns Current rate limit info
 */
export function getRateLimitStatus(
  userId: number | string,
  tier: RateLimitTier,
  windowMs: number = 60000
): RateLimitInfo {
  const limit = RATE_LIMITS[tier];
  const key = buildRateLimitKey(userId, tier, windowMs);
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetTime <= now) {
    // No active entry or expired - full quota available
    const windowStart = Math.floor(now / windowMs) * windowMs;
    return {
      limit,
      remaining: limit,
      resetTime: new Date(windowStart + windowMs),
      windowStart: new Date(windowStart)
    };
  }
  
  return {
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetTime: new Date(entry.resetTime),
    windowStart: new Date(entry.windowStart)
  };
}

/**
 * Reset rate limit for a specific user (useful for testing or admin operations)
 * 
 * @param userId - The user ID to reset
 * @param tier - Optional tier to reset (if not provided, resets all tiers)
 * @param windowMs - Optional custom window size (default: 60000)
 */
export function resetRateLimit(
  userId: number | string,
  tier?: RateLimitTier,
  windowMs: number = 60000
): void {
  const windowIndex = Math.floor(Date.now() / windowMs);
  
  if (tier) {
    const key = `${userId}:${tier}:${windowIndex}`;
    rateLimitStore.delete(key);
  } else {
    // Reset all tiers for this user
    for (const tierKey of Object.keys(RATE_LIMITS) as RateLimitTier[]) {
      const key = `${userId}:${tierKey}:${windowIndex}`;
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get current size of the rate limit store (useful for monitoring)
 */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

/**
 * Clear all entries from the rate limit store (useful for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

// Export the store for advanced use cases (e.g., monitoring, custom cleanup)
export { rateLimitStore };
