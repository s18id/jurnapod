// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Audit Routes
 * 
 * Routes for audit log queries:
 * GET /audit/period-transitions - Query period transition audit logs
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { authenticateRequest, requireAccess, type AuthContext } from "@/lib/auth-guard.js";
import { errorResponse } from "@/lib/response.js";
import { getPeriodTransitionAuditService } from "@/lib/audit.js";
import {
  type PeriodTransitionAuditQuery
} from "@jurnapod/modules-platform/audit/period-transition";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Route Setup
// =============================================================================

const auditRoutes = new Hono();

// Auth middleware for all audit routes
auditRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role for audit queries
auditRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
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
// Query Schema
// =============================================================================

const periodTransitionQuerySchema = z.object({
  fiscal_year_id: z.coerce.number().int().positive().optional(),
  period_number: z.coerce.number().int().min(0).optional(),
  actor_user_id: z.coerce.number().int().positive().optional(),
  action: z.enum(["PERIOD_OPEN", "PERIOD_ADJUST", "PERIOD_CLOSE", "PERIOD_REOPEN"]).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// =============================================================================
// GET /audit/period-transitions
// =============================================================================

/**
 * GET /audit/period-transitions
 * 
 * Query period transition audit logs with optional filters.
 * 
 * Query params:
 * - fiscal_year_id (optional): Filter by fiscal year ID
 * - period_number (optional): Filter by period number (0 = full year)
 * - actor_user_id (optional): Filter by user who made the change
 * - action (optional): Filter by action type (PERIOD_OPEN, PERIOD_ADJUST, PERIOD_CLOSE, PERIOD_REOPEN)
 * - from_date (optional): Filter by start date (ISO 8601)
 * - to_date (optional): Filter by end date (ISO 8601)
 * - limit (optional): Results limit (default 100, max 1000)
 * - offset (optional): Results offset (default 0)
 */
auditRoutes.get("/period-transitions", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const companyId = auth.companyId;

  try {
    const url = new URL(c.req.raw.url);

    // Parse and validate query parameters
    const queryParams = periodTransitionQuerySchema.parse({
      fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
      period_number: url.searchParams.get("period_number") ?? undefined,
      actor_user_id: url.searchParams.get("actor_user_id") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      from_date: url.searchParams.get("from_date") ?? undefined,
      to_date: url.searchParams.get("to_date") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    // Build query
    const query: PeriodTransitionAuditQuery = {
      company_id: companyId,
      fiscal_year_id: queryParams.fiscal_year_id,
      period_number: queryParams.period_number,
      actor_user_id: queryParams.actor_user_id,
      action: queryParams.action,
      from_date: queryParams.from_date,
      to_date: queryParams.to_date,
      limit: queryParams.limit ?? 100,
      offset: queryParams.offset ?? 0,
    };

    const periodTransitionService = getPeriodTransitionAuditService();

    const result = await periodTransitionService.queryAudits(query);

    return c.json({
      success: true,
      data: {
        total: result.total,
        transitions: result.transitions,
        limit: query.limit,
        offset: query.offset
      }
    });
  } catch (error) {
    console.error("GET /audit/period-transitions failed", error);
    
    if (error instanceof z.ZodError) {
      return errorResponse("BAD_REQUEST", `Invalid query parameters: ${error.errors.map(e => e.message).join(", ")}`, 400);
    }
    
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to query period transition audit logs", 500);
  }
});

// =============================================================================
// GET /audit/period-transitions/:id
// =============================================================================

/**
 * GET /audit/period-transitions/:id
 * 
 * Get a single period transition audit record by ID.
 * 
 * Path params:
 * - id: Audit log ID
 */
auditRoutes.get("/period-transitions/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const companyId = auth.companyId;
  const auditId = Number(c.req.param("id"));

  if (isNaN(auditId)) {
    return errorResponse("BAD_REQUEST", "Invalid audit log ID", 400);
  }

  try {
    const periodTransitionService = getPeriodTransitionAuditService();

    const record = await periodTransitionService.getAuditById(companyId, auditId);

    if (!record) {
      return errorResponse("NOT_FOUND", "Period transition audit record not found", 404);
    }

    return c.json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error("GET /audit/period-transitions/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get period transition audit record", 500);
  }
});

export { auditRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Period transition audit record schema
 */
const PeriodTransitionAuditSchema = zodOpenApi.object({
  id: zodOpenApi.number().openapi({ description: "Audit ID" }),
  company_id: zodOpenApi.number().openapi({ description: "Company ID" }),
  fiscal_year_id: zodOpenApi.number().openapi({ description: "Fiscal year ID" }),
  period_number: zodOpenApi.number().openapi({ description: "Period number" }),
  action: zodOpenApi.string().openapi({ description: "Action" }),
  actor_user_id: zodOpenApi.number().openapi({ description: "Actor user ID" }),
  created_at: zodOpenApi.string().openapi({ description: "Created at" }),
}).openapi("PeriodTransitionAudit");

/**
 * Registers audit routes with an OpenAPIHono instance.
 */
export function registerAuditRoutes(app: OpenAPIHono): void {
  // GET /audit/period-transitions - Query period transition audit logs
  app.openapi(
    createRoute({
      method: "get",
      path: "/audit/period-transitions",
      operationId: "listPeriodTransitionAudits",
      summary: "List period transition audits",
      description: "Query period transition audit logs with optional filters.",
      tags: ["Audit"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          fiscal_year_id: zodOpenApi.string().optional().openapi({ description: "Fiscal year ID" }),
          period_number: zodOpenApi.string().optional().openapi({ description: "Period number" }),
          actor_user_id: zodOpenApi.string().optional().openapi({ description: "Actor user ID" }),
          action: zodOpenApi.string().optional().openapi({ description: "Action" }),
          from_date: zodOpenApi.string().optional().openapi({ description: "From date" }),
          to_date: zodOpenApi.string().optional().openapi({ description: "To date" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Limit" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset" }),
        }),
      },
      responses: {
        200: {
          description: "List of period transition audits",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  total: zodOpenApi.number(),
                  transitions: zodOpenApi.array(PeriodTransitionAuditSchema),
                  limit: zodOpenApi.number(),
                  offset: zodOpenApi.number(),
                }).openapi("PeriodTransitionAuditListResponse"),
              }),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth") as AuthContext;
      const companyId = auth.companyId;

      try {
        const url = new URL(c.req.raw.url);
        const queryParams = periodTransitionQuerySchema.parse({
          fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
          period_number: url.searchParams.get("period_number") ?? undefined,
          actor_user_id: url.searchParams.get("actor_user_id") ?? undefined,
          action: url.searchParams.get("action") ?? undefined,
          from_date: url.searchParams.get("from_date") ?? undefined,
          to_date: url.searchParams.get("to_date") ?? undefined,
          limit: url.searchParams.get("limit") ?? undefined,
          offset: url.searchParams.get("offset") ?? undefined,
        });

        const query: PeriodTransitionAuditQuery = {
          company_id: companyId,
          fiscal_year_id: queryParams.fiscal_year_id,
          period_number: queryParams.period_number,
          actor_user_id: queryParams.actor_user_id,
          action: queryParams.action,
          from_date: queryParams.from_date,
          to_date: queryParams.to_date,
          limit: queryParams.limit ?? 100,
          offset: queryParams.offset ?? 0,
        };

        const periodTransitionService = getPeriodTransitionAuditService();
        const result = await periodTransitionService.queryAudits(query);
        return c.json({
          success: true,
          data: {
            total: result.total,
            transitions: result.transitions,
            limit: query.limit,
            offset: query.offset,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResponse("BAD_REQUEST", `Invalid query parameters: ${error.errors.map(e => e.message).join(", ")}`, 400);
        }
        return errorResponse("INTERNAL_SERVER_ERROR", "Failed to query period transition audit logs", 500);
      }
    }
  );

  // GET /audit/period-transitions/:id - Get single audit record
  app.openapi(
    createRoute({
      method: "get",
      path: "/audit/period-transitions/{id}",
      operationId: "getPeriodTransitionAudit",
      summary: "Get period transition audit",
      description: "Get a single period transition audit record by ID.",
      tags: ["Audit"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          id: zodOpenApi.string().openapi({ description: "Audit ID" }),
        }),
      },
      responses: {
        200: {
          description: "Period transition audit record",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: PeriodTransitionAuditSchema,
              }).openapi("GetPeriodTransitionAuditResponse"),
            },
          },
        },
        400: { description: "Invalid audit ID" },
        401: { description: "Unauthorized" },
        404: { description: "Audit record not found" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth") as AuthContext;
      const companyId = auth.companyId;
      const auditId = Number(c.req.param("id"));

      if (isNaN(auditId)) {
        return errorResponse("BAD_REQUEST", "Invalid audit log ID", 400);
      }

      try {
        const periodTransitionService = getPeriodTransitionAuditService();
        const record = await periodTransitionService.getAuditById(companyId, auditId);

        if (!record) {
          return errorResponse("NOT_FOUND", "Period transition audit record not found", 404);
        }

        return c.json({ success: true, data: record });
      } catch (error) {
        return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get period transition audit record", 500);
      }
    }
  );
}
