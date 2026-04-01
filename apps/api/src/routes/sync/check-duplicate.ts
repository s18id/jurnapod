// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Check-Duplicate Routes
 *
 * POST /sync/check-duplicate - Preflight duplicate check for client transaction IDs
 *
 * ## Semantic Boundary (CRITICAL - READ ONLY)
 *
 * This endpoint is a preflight helper only. It provides a lightweight duplicate
 * existence check to help POS clients decide whether to attempt a push.
 *
 * IMPORTANT:
 * - This endpoint does NOT claim idempotency authority
 * - Authoritative idempotency is maintained exclusively in `/sync/push` processing
 * - Push processing handles race conditions, retry deduplication, and conflict resolution
 * - This endpoint may return stale results due to replication lag
 * - Clients MUST still handle DUPLICATE responses from push endpoint
 *
 * ## Security Model
 *
 * - Company-scoped: requests are rejected if company_id does not match authenticated user
 * - Read-only: no writes are performed; no state is modified
 */

import { Hono } from "hono";
import { z } from "zod";
import { authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse } from "../../lib/response.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { checkDuplicateClientTx } from "../../lib/sync/check-duplicate.js";

// Extend Hono context with auth
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const CheckDuplicateRequestSchema = z.object({
  client_tx_id: z.string().uuid(),
  company_id: z.number().int().positive()
});

const checkDuplicateRoutes = new Hono();

// Auth middleware
checkDuplicateRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

checkDuplicateRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const correlationId = getRequestCorrelationId(c.req.raw);

  try {
    const body = await c.req.json();
    const parsed = CheckDuplicateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Invalid request", 400);
    }

    const { client_tx_id, company_id } = parsed.data;

    if (company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot check duplicates for other companies", 403);
    }

    const result = await checkDuplicateClientTx(company_id, client_tx_id);

    if (result.isDuplicate) {
      return c.json({
        is_duplicate: true,
        existing_id: result.existingId,
        created_at: result.createdAt?.toISOString()
      });
    }

    return c.json({ is_duplicate: false });
  } catch (error) {
    console.error("POST /sync/check-duplicate failed", { correlation_id: correlationId, error });
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to check duplicate", 500);
  }
});

export { checkDuplicateRoutes };
