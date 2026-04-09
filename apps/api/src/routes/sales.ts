// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Routes
 *
 * Hono route module for sales endpoints.
 * Includes invoices, orders, payments, and credit-notes.
 */

import { Hono } from "hono";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { invoiceRoutes } from "./sales/invoices.js";
import { orderRoutes } from "./sales/orders.js";
import { paymentRoutes } from "./sales/payments.js";
import { creditNoteRoutes } from "./sales/credit-notes.js";
import { telemetryMiddleware } from "../middleware/telemetry.js";
import { authenticateRequest } from "../lib/auth-guard.js";
import type { AuthContext } from "../lib/auth-guard.js";

// Extend Hono context with auth
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// Create sales routes Hono instance
const salesRoutes = new Hono();

// Apply telemetry middleware to all sales routes
salesRoutes.use(telemetryMiddleware());

// Auth middleware
salesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Mount sub-routes
salesRoutes.route("/invoices", invoiceRoutes);
salesRoutes.route("/orders", orderRoutes);
salesRoutes.route("/payments", paymentRoutes);
salesRoutes.route("/credit-notes", creditNoteRoutes);

export { salesRoutes };

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Sales common error response schema
 */
const SalesErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Human-readable error message" }),
      })
      .openapi("SalesErrorDetail"),
  })
  .openapi("SalesErrorResponse");

/**
 * Registers sales routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the sales endpoints.
 */
export function registerSalesRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /sales - Sales health check
  const salesHealthRoute = createRoute({
    path: "/sales",
    method: "get",
    tags: ["Sales"],
    summary: "Sales module health",
    description: "Check if sales module is accessible (requires auth)",
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: zodOpenApi.object({
              success: zodOpenApi.literal(true).openapi({ example: true }),
              data: zodOpenApi.object({
                status: zodOpenApi.literal("ok").openapi({ example: "ok" }),
                module: zodOpenApi.literal("sales").openapi({ example: "sales" }),
              }).openapi("SalesHealthData"),
            }).openapi("SalesHealthResponse"),
          },
        },
        description: "Sales module is accessible",
      },
      401: {
        content: { "application/json": { schema: SalesErrorResponseSchema } },
        description: "Unauthorized",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(salesHealthRoute, (async (c: any) => {
    return c.json({
      success: true,
      data: {
        status: "ok",
        module: "sales",
      },
    });
  }) as any);
}
