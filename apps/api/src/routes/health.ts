// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Health Routes
 *
 * Enhanced health check endpoint with subsystem status.
 * No auth required for health checks to allow:
 * - Load balancer health checks
 * - Monitoring systems
 * - Infrastructure health validation
 * 
 * Story 8.9: AC3 - Enhanced health check with subsystem status
 */

import { Hono } from "hono";
import type { Handler } from "hono";
import { z } from "zod";
import { z as zodOpenApi, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { checkDatabaseHealth, getSyncMetricsSnapshot, getImportMetricsSnapshot, getExportMetricsSnapshot } from "../lib/metrics/health.js";

const healthRoutes = new Hono();

// Type for the app that can register OpenAPI routes
type OpenAPIHonoInterface = {
  openapi: OpenAPIHonoType["openapi"];
};

// ============================================================================
// OpenAPI Schemas
// ============================================================================

/**
 * Subsystem health status schema
 */
const SubsystemStatusSchema = zodOpenApi
  .object({
    status: zodOpenApi.enum(["healthy", "degraded", "unhealthy"]).openapi({ description: "Health status" }),
    latencyMs: zodOpenApi.number().optional().openapi({ description: "Latency in milliseconds" }),
    message: zodOpenApi.string().optional().openapi({ description: "Optional message" }),
    details: zodOpenApi.unknown().optional().openapi({ description: "Additional details" }),
  })
  .openapi("SubsystemStatus");

/**
 * Health check response schema (GET /api/health)
 */
const HealthResponseSchema = zodOpenApi
  .object({
    status: zodOpenApi.enum(["ok", "degraded", "unhealthy"]).openapi({ description: "Overall health status" }),
    timestamp: zodOpenApi.string().openapi({ description: "ISO 8601 timestamp" }),
    subsystems: zodOpenApi
      .object({
        database: SubsystemStatusSchema,
        import: SubsystemStatusSchema.optional(),
        export: SubsystemStatusSchema.optional(),
        sync: SubsystemStatusSchema.optional(),
      })
      .optional()
      .openapi({ description: "Subsystem health details" }),
    version: zodOpenApi.string().optional().openapi({ description: "API version" }),
  })
  .openapi("HealthResponse");

/**
 * Liveness probe response schema (GET /api/health/live)
 */
const LivenessResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: zodOpenApi
      .object({
        status: zodOpenApi.literal("alive").openapi({ example: "alive" }),
        timestamp: zodOpenApi.string().openapi({ description: "ISO 8601 timestamp" }),
      })
      .openapi("LivenessData"),
  })
  .openapi("LivenessResponse");

/**
 * Readiness probe success response schema (GET /api/health/ready - 200)
 */
const ReadinessSuccessResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: zodOpenApi
      .object({
        status: zodOpenApi.literal("ready").openapi({ example: "ready" }),
        timestamp: zodOpenApi.string().openapi({ description: "ISO 8601 timestamp" }),
      })
      .openapi("ReadinessSuccessData"),
  })
  .openapi("ReadinessSuccessResponse");

/**
 * Readiness probe failure response schema (GET /api/health/ready - 503)
 */
const ReadinessFailureResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    data: zodOpenApi
      .object({
        status: zodOpenApi.literal("not_ready").openapi({ example: "not_ready" }),
        timestamp: zodOpenApi.string().openapi({ description: "ISO 8601 timestamp" }),
        reason: zodOpenApi.string().openapi({ description: "Reason for not ready" }),
      })
      .openapi("ReadinessFailureData"),
  })
  .openapi("ReadinessFailureResponse");

// Re-export schemas for use in swagger.ts
export {
  SubsystemStatusSchema,
  HealthResponseSchema,
  LivenessResponseSchema,
  ReadinessSuccessResponseSchema,
  ReadinessFailureResponseSchema,
};

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  subsystems?: {
    database: { status: "healthy" | "degraded" | "unhealthy"; latencyMs?: number; message?: string; details?: unknown };
    import?: { status: "healthy" | "degraded" | "unhealthy"; latencyMs?: number; message?: string; details?: unknown };
    export?: { status: "healthy" | "degraded" | "unhealthy"; latencyMs?: number; message?: string; details?: unknown };
    sync?: { status: "healthy" | "degraded" | "unhealthy"; latencyMs?: number; message?: string; details?: unknown };
  };
  version?: string;
}

// Health check endpoint (GET /health)
healthRoutes.get("/", async (c) => {
  const response: HealthCheckResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  const isDetailed = c.req.query("detailed") === "true";

  // Check database connection pool health
  const dbHealth = await checkDatabaseHealth();
  
  if (isDetailed) {
    // Get metrics snapshots for subsystem health
    const [importMetrics, exportMetrics, syncMetrics] = await Promise.all([
      getImportMetricsSnapshot(),
      getExportMetricsSnapshot(),
      getSyncMetricsSnapshot(),
    ]);

    response.subsystems = {
      database: dbHealth,
      import: {
        status: "healthy",
        details: importMetrics,
      },
      export: {
        status: "healthy",
        details: exportMetrics,
      },
      sync: {
        status: "healthy",
        details: syncMetrics,
      },
    };
  } else {
    response.subsystems = {
      database: dbHealth,
    };
  }

  // Determine overall status
  if (dbHealth.status === "unhealthy") {
    response.status = "unhealthy";
  } else if (dbHealth.status === "degraded") {
    response.status = "degraded";
  }

  // Return 503 if any critical subsystem is unhealthy
  const statusCode = response.status === "unhealthy" ? 503 : 200;
  return c.json(response, statusCode);
});

/**
 * Liveness probe - simple check that server is running
 */
healthRoutes.get("/live", async (c) => {
  return c.json({ success: true, data: { status: "alive", timestamp: new Date().toISOString() } });
});

/**
 * Readiness probe - check if server is ready to accept traffic
 */
healthRoutes.get("/ready", async (c) => {
  const dbHealth = await checkDatabaseHealth();
  
  if (dbHealth.status === "unhealthy") {
    return c.json({
      success: false,
      data: {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        reason: "Database unavailable",
      }
    }, 503);
  }

  return c.json({
    success: true,
    data: {
      status: "ready",
      timestamp: new Date().toISOString(),
    }
  });
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Registers health routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the health endpoints.
 */
export function registerHealthRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /health - Health check with optional detailed parameter
  const healthRoute = createRoute({
    path: "/health",
    method: "get",
    tags: ["Health"],
    summary: "Health check",
    description: "Enhanced health check endpoint with subsystem status",
    responses: {
      200: {
        content: { "application/json": { schema: HealthResponseSchema } },
        description: "Healthy",
      },
      503: {
        content: { "application/json": { schema: HealthResponseSchema } },
        description: "Unhealthy",
      },
    },
  });

  app.openapi(healthRoute, async (c) => {
    const response: HealthCheckResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
    };

    const isDetailed = c.req.query("detailed") === "true";
    const dbHealth = await checkDatabaseHealth();

    if (isDetailed) {
      const [importMetrics, exportMetrics, syncMetrics] = await Promise.all([
        getImportMetricsSnapshot(),
        getExportMetricsSnapshot(),
        getSyncMetricsSnapshot(),
      ]);

      response.subsystems = {
        database: dbHealth,
        import: { status: "healthy", details: importMetrics },
        export: { status: "healthy", details: exportMetrics },
        sync: { status: "healthy", details: syncMetrics },
      };
    } else {
      response.subsystems = { database: dbHealth };
    }

    if (dbHealth.status === "unhealthy") {
      response.status = "unhealthy";
    } else if (dbHealth.status === "degraded") {
      response.status = "degraded";
    }

    const statusCode = response.status === "unhealthy" ? 503 : 200;
    return c.json(response, statusCode);
  });

  // GET /health/live - Liveness probe
  const livenessRoute = createRoute({
    path: "/health/live",
    method: "get",
    tags: ["Health"],
    summary: "Liveness probe",
    description: "Simple check that server is running",
    responses: {
      200: {
        content: { "application/json": { schema: LivenessResponseSchema } },
        description: "Server is alive",
      },
    },
  });

  app.openapi(livenessRoute, async (c) => {
    return c.json({ success: true, data: { status: "alive", timestamp: new Date().toISOString() } });
  });

  // GET /health/ready - Readiness probe
  const readinessRoute = createRoute({
    path: "/health/ready",
    method: "get",
    tags: ["Health"],
    summary: "Readiness probe",
    description: "Check if server is ready to accept traffic",
    responses: {
      200: {
        content: { "application/json": { schema: ReadinessSuccessResponseSchema } },
        description: "Server is ready",
      },
      503: {
        content: { "application/json": { schema: ReadinessFailureResponseSchema } },
        description: "Server is not ready",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(readinessRoute, (async (c: any) => {
    const dbHealth = await checkDatabaseHealth();

    if (dbHealth.status === "unhealthy") {
      return c.json(
        {
          success: false,
          data: {
            status: "not_ready",
            timestamp: new Date().toISOString(),
            reason: "Database unavailable",
          },
        },
        503
      );
    }

    return c.json({
      success: true,
      data: {
        status: "ready",
        timestamp: new Date().toISOString(),
      },
    });
  }) as unknown as Handler);
}

export { healthRoutes };
