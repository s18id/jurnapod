// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generic read-only audit log routes.
 *
 * These endpoints expose tenant-scoped audit reads only. They do not create or
 * mutate audit entries. Backend ACL remains authoritative via platform.settings.READ.
 */

import { Hono } from "hono";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { authenticateRequest, requireAccess, type AuthContext } from "@/lib/auth-guard.js";
import { getAuditLogById, queryAuditLogs } from "@/lib/audit-logs.js";
import { errorResponse } from "@jurnapod/shared";
import type { AuditLogQuery } from "@jurnapod/shared";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const auditLogRoutes = new Hono();

auditLogRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

auditLogRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");
  const accessResult = await requireAccess({
    module: "platform",
    resource: "settings",
    permission: "read",
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  await next();
});

const auditLogQuerySchema = z.object({
  actor_user_id: z.coerce.number().int().positive().optional(),
  action: z.string().trim().min(1).max(191).optional(),
  entity_type: z.string().trim().min(1).max(64).optional(),
  entity_id: z.string().trim().min(1).max(191).optional(),
  company_id: z.coerce.number().int().positive().optional(),
  outlet_id: z.coerce.number().int().positive().optional(),
  success: z.enum(["0", "1", "false", "true"]).optional(),
  from_ts: z.coerce.number().int().nonnegative().optional(),
  to_ts: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
}).superRefine((value, ctx) => {
  if (value.from_ts !== undefined && value.to_ts !== undefined && value.from_ts >= value.to_ts) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to_ts"],
      message: "to_ts must be greater than from_ts for half-open interval filtering",
    });
  }
});

function readAuditLogQuery(url: URL, authCompanyId: number): AuditLogQuery {
  const parsed = auditLogQuerySchema.parse({
    actor_user_id: url.searchParams.get("actor_user_id") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    entity_type: url.searchParams.get("entity_type") ?? undefined,
    entity_id: url.searchParams.get("entity_id") ?? undefined,
    company_id: url.searchParams.get("company_id") ?? undefined,
    outlet_id: url.searchParams.get("outlet_id") ?? undefined,
    success: url.searchParams.get("success") ?? undefined,
    from_ts: url.searchParams.get("from_ts") ?? undefined,
    to_ts: url.searchParams.get("to_ts") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  return {
    company_id: authCompanyId,
    user_id: parsed.actor_user_id,
    action: parsed.action,
    entity_type: parsed.entity_type as AuditLogQuery["entity_type"],
    entity_id: parsed.entity_id,
    outlet_id: parsed.outlet_id,
    success: parsed.success === undefined ? undefined : parsed.success === "1" || parsed.success === "true",
    from_ts: parsed.from_ts,
    to_ts: parsed.to_ts,
    limit: parsed.limit,
    offset: parsed.offset,
  };
}

auditLogRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  try {
    const query = readAuditLogQuery(new URL(c.req.raw.url), auth.companyId);
    const result = await queryAuditLogs(query);
    return c.json({
      success: true,
      data: {
        total: result.total,
        logs: result.logs,
        limit: query.limit ?? 25,
        offset: query.offset ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("BAD_REQUEST", `Invalid query parameters: ${error.errors.map((e) => e.message).join(", ")}`, 400);
    }
    console.error("GET /audit-logs failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to query audit logs", 500);
  }
});

auditLogRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const auditLogId = Number(c.req.param("id"));

  if (!Number.isInteger(auditLogId) || auditLogId <= 0) {
    return errorResponse("BAD_REQUEST", "Invalid audit log ID", 400);
  }

  try {
    const record = await getAuditLogById(auth.companyId, auditLogId);
    if (!record) {
      return errorResponse("NOT_FOUND", "Audit log not found", 404);
    }
    return c.json({ success: true, data: record });
  } catch (error) {
    console.error("GET /audit-logs/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get audit log", 500);
  }
});

export { auditLogRoutes };

const AuditLogSchema = zodOpenApi.object({
  id: zodOpenApi.number(),
  company_id: zodOpenApi.number().nullable(),
  outlet_id: zodOpenApi.number().nullable(),
  user_id: zodOpenApi.number().nullable(),
  entity_type: zodOpenApi.string().nullable(),
  entity_id: zodOpenApi.string().nullable(),
  action: zodOpenApi.string(),
  result: zodOpenApi.string(),
  success: zodOpenApi.boolean(),
  status: zodOpenApi.number(),
  ip_address: zodOpenApi.string().nullable(),
  payload_json: zodOpenApi.string(),
  changes_json: zodOpenApi.string().nullable(),
  created_at: zodOpenApi.string(),
}).openapi("AuditLog");

export function registerAuditLogRoutes(app: OpenAPIHono): void {
  app.openapi(
    createRoute({
      method: "get",
      path: "/audit-logs",
      operationId: "listAuditLogs",
      summary: "List audit logs",
      description: "List tenant-scoped audit logs. Uses success for outcome filtering and half-open from_ts/to_ts filtering.",
      tags: ["Audit"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          actor_user_id: zodOpenApi.string().optional(),
          action: zodOpenApi.string().optional(),
          entity_type: zodOpenApi.string().optional(),
          entity_id: zodOpenApi.string().optional(),
          company_id: zodOpenApi.string().optional(),
          outlet_id: zodOpenApi.string().optional(),
          success: zodOpenApi.string().optional(),
          from_ts: zodOpenApi.string().optional(),
          to_ts: zodOpenApi.string().optional(),
          limit: zodOpenApi.string().optional(),
          offset: zodOpenApi.string().optional(),
        }),
      },
      responses: {
        200: {
          description: "Audit logs",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  total: zodOpenApi.number(),
                  logs: zodOpenApi.array(AuditLogSchema),
                  limit: zodOpenApi.number(),
                  offset: zodOpenApi.number(),
                }).openapi("AuditLogListResponse"),
              }),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    async (c) => c.json({ success: true, data: { total: 0, logs: [], limit: 25, offset: 0 } })
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/audit-logs/{id}",
      operationId: "getAuditLog",
      summary: "Get audit log",
      description: "Get one tenant-scoped audit log by ID.",
      tags: ["Audit"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({ id: zodOpenApi.string() }),
      },
      responses: {
        200: {
          description: "Audit log detail",
          content: {
            "application/json": {
              schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: AuditLogSchema }).openapi("GetAuditLogResponse"),
            },
          },
        },
        400: { description: "Invalid audit log ID" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Audit log not found" },
      },
    }),
    async (c) => c.json({ success: true, data: {} })
  );
}
