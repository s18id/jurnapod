// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Period Close Workspace Routes
 * GET /admin/dashboard/period-close-workspace - Period close workspace data
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { errorResponse } from "../../lib/response.js";
import { getPeriodCloseWorkspace } from "../../lib/period-close-workspace.js";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const periodCloseRoutes = new Hono();

// Auth middleware for period close routes
periodCloseRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role
periodCloseRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  await next();
});

// =============================================================================
// Period Close Workspace - GET /admin/dashboard/period-close-workspace
// =============================================================================

const periodCloseWorkspaceQuerySchema = z.object({
  fiscal_year_id: z.string().transform(Number).pipe(z.number().positive()),
});

periodCloseRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;

    // Parse and validate query parameters
    const url = new URL(c.req.url);
    const rawQuery = {
      fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
    };

    const parseResult = periodCloseWorkspaceQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      return errorResponse(
        "BAD_REQUEST",
        `Invalid query parameters: ${parseResult.error.errors.map((e) => e.message).join(", ")}`,
        400
      );
    }

    const validated = parseResult.data;

    // Get period close workspace data
    const workspace = await getPeriodCloseWorkspace({
      companyId,
      fiscalYearId: validated.fiscal_year_id,
    });

    return c.json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/period-close-workspace failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load period close workspace", 500);
  }
});

export { periodCloseRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Registers period close routes with an OpenAPIHono instance.
 */
export function registerPeriodCloseRoutes(app: OpenAPIHono): void {
  // GET /admin/dashboard/period-close-workspace - Period close workspace
  app.openapi(
    createRoute({
      method: "get",
      path: "/admin/dashboard/period-close-workspace",
      operationId: "getPeriodCloseWorkspace",
      summary: "Period close workspace",
      description: "Get period close workspace data for a fiscal year.",
      tags: ["Admin"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          fiscal_year_id: zodOpenApi.string().openapi({ description: "Fiscal year ID" }),
        }),
      },
      responses: {
        200: {
          description: "Period close workspace data",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.any(),
              }).openapi("PeriodCloseWorkspaceResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const companyId = auth.companyId;

      try {
        const url = new URL(c.req.url);
        const rawQuery = {
          fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
        };

        const parseResult = periodCloseWorkspaceQuerySchema.safeParse(rawQuery);
        if (!parseResult.success) {
          return errorResponse("BAD_REQUEST", `Invalid query parameters: ${parseResult.error.errors.map((e) => e.message).join(", ")}`, 400);
        }

        const validated = parseResult.data;
        const workspace = await getPeriodCloseWorkspace({ companyId, fiscalYearId: validated.fiscal_year_id });

        return c.json({ success: true, data: workspace });
      } catch (error) {
        console.error("GET /admin/dashboard/period-close-workspace failed", error);
        return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load period close workspace", 500);
      }
    }
  );
}
