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
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
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

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Check duplicate request schema
 */
const CheckDuplicateRequestSchemaOpenApi = zodOpenApi
  .object({
    client_tx_id: zodOpenApi.string().uuid().openapi({ description: "Client transaction UUID" }),
    company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  })
  .openapi("CheckDuplicateRequest");

/**
 * Check duplicate response schema (not a duplicate)
 */
const CheckDuplicateNotFoundResponseSchema = zodOpenApi
  .object({
    is_duplicate: zodOpenApi.literal(false).openapi({ example: false }),
  })
  .openapi("CheckDuplicateNotFoundResponse");

/**
 * Check duplicate response schema (is a duplicate)
 */
const CheckDuplicateFoundResponseSchema = zodOpenApi
  .object({
    is_duplicate: zodOpenApi.literal(true).openapi({ example: true }),
    existing_id: zodOpenApi.string().openapi({ description: "Existing transaction ID" }),
    created_at: zodOpenApi.string().openapi({ description: "Creation timestamp" }),
  })
  .openapi("CheckDuplicateFoundResponse");

/**
 * Registers sync check-duplicate routes with an OpenAPIHono instance.
 */
export function registerCheckDuplicateRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  const checkDuplicateRoute = createRoute({
    path: "/sync/check-duplicate",
    method: "post",
    tags: ["Sync"],
    summary: "Check for duplicate transaction",
    description: "Preflight duplicate check for client transaction IDs",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: CheckDuplicateRequestSchemaOpenApi,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: zodOpenApi.union([CheckDuplicateNotFoundResponseSchema, CheckDuplicateFoundResponseSchema]),
          },
        },
        description: "Duplicate check completed",
      },
      400: {
        content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(false), error: zodOpenApi.object({ code: zodOpenApi.string(), message: zodOpenApi.string() }) }) } },
        description: "Validation error",
      },
      401: {
        content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(false), error: zodOpenApi.object({ code: zodOpenApi.string(), message: zodOpenApi.string() }) }) } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(false), error: zodOpenApi.object({ code: zodOpenApi.string(), message: zodOpenApi.string() }) }) } },
        description: "Forbidden",
      },
      500: {
        content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(false), error: zodOpenApi.object({ code: zodOpenApi.string(), message: zodOpenApi.string() }) }) } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(checkDuplicateRoute, (async (c: any) => {
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
  }) as any);
}

export { checkDuplicateRoutes };
