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
import { checkDatabaseHealth, getSyncMetricsSnapshot, getImportMetricsSnapshot, getExportMetricsSnapshot } from "../lib/metrics/health.js";

const healthRoutes = new Hono();

/**
 * Subsystem health status
 */
interface SubsystemStatus {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  message?: string;
  details?: unknown;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  subsystems?: {
    database: SubsystemStatus;
    import?: SubsystemStatus;
    export?: SubsystemStatus;
    sync?: SubsystemStatus;
  };
  version?: string;
}

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

export { healthRoutes };
