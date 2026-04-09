// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Dashboard Routes
 * GET /admin/dashboard/sync - Sync health dashboard
 */

import { Hono } from "hono";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { errorResponse } from "../../lib/response.js";
import { getOutboxMetricsSnapshot, getSyncHealthMetricsSnapshot } from "../../lib/metrics/dashboard-metrics.js";
import type { AuthContext } from "../../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const syncDashboardRoutes = new Hono();

// Auth middleware for sync dashboard routes
syncDashboardRoutes.use("/*", async (c, next) => {
  const { authenticateRequest } = await import("../../lib/auth-guard.js");
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role
syncDashboardRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");
  const { requireAccess } = await import("../../lib/auth-guard.js");

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
// Sync Health Dashboard - GET /admin/dashboard/sync
// =============================================================================

syncDashboardRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    // Pass companyId for tenant-isolated metrics (Story 30.7)
    const outboxSnapshot = await getOutboxMetricsSnapshot(auth.companyId);
    const syncSnapshot = await getSyncHealthMetricsSnapshot(auth.companyId);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sync Health Dashboard - Jurnapod</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #334155;
    }
    .header h1 { color: #f8fafc; font-size: 1.5rem; }
    .header .badge {
      background: #3b82f6;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
    }
    .refresh-info {
      color: #94a3b8;
      font-size: 0.875rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .card {
      background: #1e293b;
      border-radius: 0.5rem;
      padding: 1.25rem;
      border: 1px solid #334155;
    }
    .card h2 {
      color: #f8fafc;
      font-size: 1rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #334155;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
    }
    .metric-label { color: #94a3b8; font-size: 0.875rem; }
    .metric-value { font-weight: 600; font-size: 0.875rem; }
    .metric-value.success { color: #22c55e; }
    .metric-value.warning { color: #f59e0b; }
    .metric-value.danger { color: #ef4444; }
    .chart-placeholder {
      margin-top: 1rem;
      padding: 2rem;
      background: #0f172a;
      border-radius: 0.375rem;
      text-align: center;
      color: #64748b;
      font-size: 0.875rem;
    }
    .footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #334155;
      color: #64748b;
      font-size: 0.75rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Sync Health Dashboard</h1>
      <p class="refresh-info">Auto-refreshes every 30 seconds</p>
    </div>
    <span class="badge">LIVE</span>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Outbox Health</h2>
      <div class="metric">
        <span class="metric-label">Total Lag Items</span>
        <span class="metric-value ${outboxSnapshot.totalLagItems > 100 ? 'danger' : outboxSnapshot.totalLagItems > 50 ? 'warning' : 'success'}">${outboxSnapshot.totalLagItems.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Max Retry Depth</span>
        <span class="metric-value ${outboxSnapshot.maxRetryDepth > 3 ? 'danger' : outboxSnapshot.maxRetryDepth > 1 ? 'warning' : ''}">${outboxSnapshot.maxRetryDepth}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Duplicate Suppressions</span>
        <span class="metric-value">${outboxSnapshot.duplicateSuppressions.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Total Failures</span>
        <span class="metric-value ${outboxSnapshot.totalFailures > 0 ? 'danger' : 'success'}">${outboxSnapshot.totalFailures.toLocaleString()}</span>
      </div>
    </div>

    <div class="card">
      <h2>Sync Operations</h2>
      <div class="metric">
        <span class="metric-label">Push Operations</span>
        <span class="metric-value">${syncSnapshot.pushOperations.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Pull Operations</span>
        <span class="metric-value">${syncSnapshot.pullOperations.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Conflicts</span>
        <span class="metric-value ${syncSnapshot.conflicts > 0 ? 'warning' : 'success'}">${syncSnapshot.conflicts.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Avg Push Duration</span>
        <span class="metric-value">${syncSnapshot.avgPushDurationMs}ms</span>
      </div>
    </div>

    <div class="card">
      <h2>Outbox by Outlet</h2>
      ${outboxSnapshot.byOutlet.length > 0 ? outboxSnapshot.byOutlet.map((o: { outletId: string; lagItems: number; retryDepth: number }) => `
        <div class="metric">
          <span class="metric-label">Outlet ${o.outletId}</span>
          <span class="metric-value ${o.lagItems > 100 ? 'danger' : o.lagItems > 50 ? 'warning' : ''}">${o.lagItems} items</span>
        </div>
      `).join('') : '<p style="color: #64748b; font-size: 0.875rem;">No outlet data</p>'}
    </div>

    <div class="card">
      <h2>Failure Breakdown</h2>
      ${Object.keys(outboxSnapshot.failuresByReason).length > 0 ? Object.entries(outboxSnapshot.failuresByReason).map(([reason, count]) => `
        <div class="metric">
          <span class="metric-label">${reason}</span>
          <span class="metric-value warning">${count}</span>
        </div>
      `).join('') : '<p style="color: #64748b; font-size: 0.875rem;">No failures</p>'}
    </div>
  </div>

  <div class="card">
    <h2>Latency Distribution</h2>
    <div class="metric">
      <span class="metric-label">P50 (Median)</span>
      <span class="metric-value">${syncSnapshot.latencyP50}ms</span>
    </div>
    <div class="metric">
      <span class="metric-label">P95</span>
      <span class="metric-value">${syncSnapshot.latencyP95}ms</span>
    </div>
    <div class="metric">
      <span class="metric-label">P99</span>
      <span class="metric-value">${syncSnapshot.latencyP99}ms</span>
    </div>
    <div class="chart-placeholder">
      Time series chart - integrate with charting library for production
    </div>
  </div>

  <div class="footer">
    Jurnapod Operations Dashboard &bull; Data sourced from /metrics endpoint &bull; User: ${auth.userId} | Company: ${auth.companyId}
  </div>

  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => window.location.reload(), 30000);
  </script>
</body>
</html>`;

    c.header("Content-Type", "text/html");
    return c.body(html);
  } catch (error) {
    console.error("GET /admin/dashboard/sync failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load sync dashboard", 500);
  }
});

export { syncDashboardRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Registers sync dashboard routes with an OpenAPIHono instance.
 */
export function registerSyncDashboardRoutes(app: OpenAPIHono): void {
  // GET /admin/dashboard/sync - Sync health dashboard
  app.openapi(
    createRoute({
      method: "get",
      path: "/admin/dashboard/sync",
      operationId: "getSyncDashboard",
      summary: "Sync health dashboard",
      description: "Get sync health dashboard with outbox and sync metrics.",
      tags: ["Admin"],
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: "Sync health dashboard HTML",
          content: {
            "text/html": {
              schema: zodOpenApi.string().openapi({ description: "HTML dashboard" }),
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const outboxSnapshot = await getOutboxMetricsSnapshot(auth.companyId);
      const syncSnapshot = await getSyncHealthMetricsSnapshot(auth.companyId);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sync Health Dashboard - Jurnapod</title>
</head>
<body>
  <h1>Sync Health Dashboard</h1>
  <div class="metric">
    <span class="metric-label">Total Lag Items</span>
    <span class="metric-value">${outboxSnapshot.totalLagItems.toLocaleString()}</span>
  </div>
  <div class="metric">
    <span class="metric-label">Max Retry Depth</span>
    <span class="metric-value">${outboxSnapshot.maxRetryDepth}</span>
  </div>
  <div class="metric">
    <span class="metric-label">Push Operations</span>
    <span class="metric-value">${syncSnapshot.pushOperations.toLocaleString()}</span>
  </div>
</body>
</html>`;

      c.header("Content-Type", "text/html");
      return c.body(html);
    }
  );
}
