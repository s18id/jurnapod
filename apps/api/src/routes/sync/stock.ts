// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Stock Routes
 *
 * Routes for stock sync operations.
 * These are outlet-scoped and follow the /outlets/:outletId/stock pattern.
 *
 * NOTE: Stock-specific sync routes were migrated in story 14.2.2
 * to /outlets/:outletId/stock/sync, /outlets/:outletId/stock/reserve, etc.
 * This stub handles any remaining sync-specific stock endpoints.
 */

import { Hono } from "hono";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const stockSyncRoutes = new Hono();

// Auth middleware
stockSyncRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Placeholder - stock sync routes are now under /outlets/:outletId/stock/*
stockSyncRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_FOUND", message: "Stock sync moved to /outlets/:outletId/stock" } }, 404);
});

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Stock sync error response schema
 */
const StockSyncErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Error message" }),
      })
      .openapi("StockSyncErrorDetail"),
  })
  .openapi("StockSyncErrorResponse");

/**
 * Registers sync stock routes with an OpenAPIHono instance.
 */
export function registerSyncStockRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  const stockSyncRoute = createRoute({
    path: "/sync/stock",
    method: "get",
    tags: ["Sync"],
    summary: "Stock sync (deprecated)",
    description: "Stock sync has moved to /outlets/:outletId/stock",
    security: [{ BearerAuth: [] }],
    responses: {
      404: {
        content: { "application/json": { schema: StockSyncErrorResponseSchema } },
        description: "Stock sync endpoint moved",
      },
      401: {
        content: { "application/json": { schema: StockSyncErrorResponseSchema } },
        description: "Unauthorized",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(stockSyncRoute, (async (c: any) => {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Stock sync moved to /outlets/:outletId/stock" } }, 404);
  }) as any);
}

export { stockSyncRoutes };
