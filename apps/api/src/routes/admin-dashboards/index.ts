// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Admin Dashboard Routes
 *
 * Built-in dashboards for operational monitoring:
 * - GET /admin/dashboard/sync - Sync health dashboard (split to sync.ts)
 * - GET /admin/dashboard/financial - Financial health dashboard
 * - GET /admin/dashboard/reconciliation - Reconciliation dashboard (split to reconciliation.ts)
 * - GET /admin/dashboard/trial-balance - Trial balance (split to trial-balance.ts)
 * - GET /admin/dashboard/period-close-workspace - Period close workspace (split to period-close.ts)
 *
 * These dashboards are self-contained HTML pages that auto-refresh
 * using data from the /metrics endpoint.
 *
 * File split completed per P2-009 to reduce file size and improve maintainability.
 */

import { Hono } from "hono";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse } from "../../lib/response.js";
import { getJournalHealthMetricsSnapshot } from "../../lib/metrics/dashboard-metrics.js";

// Sub-routers for split routes
import { syncDashboardRoutes } from "./sync.js";
import { reconciliationRoutes } from "./reconciliation.js";
import { trialBalanceRoutes } from "./trial-balance.js";
import { periodCloseRoutes } from "./period-close.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Auth Middleware
// =============================================================================

const adminDashboardRoutes = new Hono();

// Auth middleware for all admin dashboard routes
adminDashboardRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role
adminDashboardRoutes.use("/*", async (c, next) => {
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
// Mount Sub-Routers
// =============================================================================

// Sync dashboard routes - GET /admin/dashboard/sync
adminDashboardRoutes.route("/sync", syncDashboardRoutes);

// Reconciliation routes - GET /admin/dashboard/reconciliation
adminDashboardRoutes.route("/reconciliation", reconciliationRoutes);

// Trial balance routes - GET /admin/dashboard/trial-balance
adminDashboardRoutes.route("/trial-balance", trialBalanceRoutes);

// Period close workspace routes - GET /admin/dashboard/period-close-workspace
adminDashboardRoutes.route("/period-close-workspace", periodCloseRoutes);

// =============================================================================
// Financial Health Dashboard - GET /admin/dashboard/financial
// =============================================================================

adminDashboardRoutes.get("/financial", async (c) => {
  try {
    const auth = c.get("auth");
    // Pass companyId for tenant-isolated metrics (Story 30.7)
    const journalSnapshot = await getJournalHealthMetricsSnapshot(auth.companyId);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Financial Health Dashboard - Jurnapod</title>
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
      background: #22c55e;
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
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid #334155;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #cbd5e1; }
    .metric-value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .metric-value.warning { color: #f59e0b; }
    .metric-value.danger { color: #ef4444; }
    .metric-value.success { color: #22c55e; }
    .chart-placeholder {
      background: #334155;
      border-radius: 0.25rem;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 0.875rem;
      margin-top: 0.75rem;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.ok { background: #22c55e; }
    .status-dot.warning { background: #f59e0b; }
    .status-dot.critical { background: #ef4444; }
    .footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #334155;
      color: #64748b;
      font-size: 0.75rem;
      text-align: center;
    }
    .rate-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      margin-top: 0.5rem;
      overflow: hidden;
    }
    .rate-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .rate-fill.success { background: #22c55e; }
    .rate-fill.warning { background: #f59e0b; }
    .rate-fill.danger { background: #ef4444; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Financial Health Dashboard</h1>
      <p class="refresh-info">Auto-refreshes every 30 seconds</p>
    </div>
    <span class="badge">LIVE</span>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Journal Posting Overview</h2>
      <div class="metric">
        <span class="metric-label">Total Successes</span>
        <span class="metric-value success">${journalSnapshot.totalSuccesses.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Total Failures</span>
        <span class="metric-value ${journalSnapshot.totalFailures > 0 ? 'danger' : ''}">${journalSnapshot.totalFailures.toLocaleString()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Success Rate</span>
        <span class="metric-value ${journalSnapshot.successRate < 0.99 ? 'danger' : journalSnapshot.successRate < 0.999 ? 'warning' : 'success'}">${(journalSnapshot.successRate * 100).toFixed(2)}%</span>
      </div>
      <div class="rate-bar">
        <div class="rate-fill ${journalSnapshot.successRate < 0.99 ? 'danger' : journalSnapshot.successRate < 0.999 ? 'warning' : 'success'}" style="width: ${journalSnapshot.successRate * 100}%"></div>
      </div>
    </div>

    <div class="card">
      <h2>GL Health</h2>
      <div class="metric">
        <span class="metric-label">GL Imbalances</span>
        <span class="metric-value ${journalSnapshot.glImbalances > 0 ? 'danger' : 'success'}">${journalSnapshot.glImbalances}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Missing Journals</span>
        <span class="metric-value ${journalSnapshot.missingJournals > 0 ? 'danger' : 'success'}">${journalSnapshot.missingJournals}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Unbalanced Batches</span>
        <span class="metric-value ${journalSnapshot.unbalancedBatches > 0 ? 'warning' : 'success'}">${journalSnapshot.unbalancedBatches}</span>
      </div>
    </div>

    <div class="card">
      <h2>Posting by Domain</h2>
      ${journalSnapshot.postingByDomain.length > 0 ? journalSnapshot.postingByDomain.map((d: { domain: string; successes: number; failures: number; total: number; successRate: number }) => `
        <div class="metric">
          <span class="metric-label">${d.domain}</span>
          <span class="metric-value">${d.successes} / ${d.total}</span>
        </div>
        <div class="rate-bar" style="margin-bottom: 0.75rem;">
          <div class="rate-fill ${d.successRate < 0.99 ? 'danger' : d.successRate < 0.999 ? 'warning' : 'success'}" style="width: ${d.successRate * 100}%"></div>
        </div>
      `).join('') : '<p style="color: #64748b; font-size: 0.875rem;">No posting data</p>'}
    </div>

    <div class="card">
      <h2>Failures by Reason</h2>
      ${Object.keys(journalSnapshot.failuresByReason).length > 0 ? Object.entries(journalSnapshot.failuresByReason).map(([reason, count]) => `
        <div class="metric">
          <span class="metric-label">${reason}</span>
          <span class="metric-value danger">${count}</span>
        </div>
      `).join('') : '<p style="color: #64748b; font-size: 0.875rem;">No failures</p>'}
    </div>
  </div>

  <div class="card">
    <h2>Alert Status</h2>
    <div class="metric">
      <span class="metric-label">Sync Latency Breach</span>
      <span class="status-indicator">
        <span class="status-dot ${journalSnapshot.alerts.syncLatencyBreach ? 'critical' : 'ok'}"></span>
        <span class="metric-value">${journalSnapshot.alerts.syncLatencyBreach ? 'TRIGGERED' : 'OK'}</span>
      </span>
    </div>
    <div class="metric">
      <span class="metric-label">Outbox Lag Critical</span>
      <span class="status-indicator">
        <span class="status-dot ${journalSnapshot.alerts.outboxLagCritical ? 'critical' : 'ok'}"></span>
        <span class="metric-value">${journalSnapshot.alerts.outboxLagCritical ? 'TRIGGERED' : 'OK'}</span>
      </span>
    </div>
    <div class="metric">
      <span class="metric-label">Journal Failure Rate</span>
      <span class="status-indicator">
        <span class="status-dot ${journalSnapshot.alerts.journalFailureRate ? 'critical' : 'ok'}"></span>
        <span class="metric-value">${journalSnapshot.alerts.journalFailureRate ? 'TRIGGERED' : 'OK'}</span>
      </span>
    </div>
    <div class="metric">
      <span class="metric-label">GL Imbalance Alert</span>
      <span class="status-indicator">
        <span class="status-dot ${journalSnapshot.alerts.glImbalance ? 'critical' : 'ok'}"></span>
        <span class="metric-value">${journalSnapshot.alerts.glImbalance ? 'TRIGGERED' : 'OK'}</span>
      </span>
    </div>
  </div>

  <div class="footer">
    Jurnapod Financial Dashboard &bull; Data sourced from /metrics endpoint &bull; User: ${auth.userId} | Company: ${auth.companyId}
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
    console.error("GET /admin/dashboard/financial failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load financial dashboard", 500);
  }
});

export { adminDashboardRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Registers admin dashboard routes with an OpenAPIHono instance.
 */
export function registerAdminDashboardRoutes(app: OpenAPIHono): void {
  // GET /admin/dashboard/financial - Financial health dashboard
  app.openapi(
    createRoute({
      method: "get",
      path: "/admin/dashboard/financial",
      operationId: "getFinancialDashboard",
      summary: "Financial health dashboard",
      description: "Get financial health dashboard with journal posting metrics.",
      tags: ["Admin"],
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: "Financial health dashboard HTML",
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
      const journalSnapshot = await getJournalHealthMetricsSnapshot(auth.companyId);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Financial Health Dashboard - Jurnapod</title>
</head>
<body>
  <h1>Financial Health Dashboard</h1>
  <div class="metric">
    <span class="metric-label">Total Successes</span>
    <span class="metric-value">${journalSnapshot.totalSuccesses.toLocaleString()}</span>
  </div>
  <div class="metric">
    <span class="metric-label">Total Failures</span>
    <span class="metric-value">${journalSnapshot.totalFailures.toLocaleString()}</span>
  </div>
  <div class="metric">
    <span class="metric-label">Success Rate</span>
    <span class="metric-value">${(journalSnapshot.successRate * 100).toFixed(2)}%</span>
  </div>
</body>
</html>`;

      c.header("Content-Type", "text/html");
      return c.body(html);
    }
  );

  // Mount sub-routers for OpenAPI
  registerSyncDashboardRoutes(app);
  registerReconciliationRoutes(app);
  registerTrialBalanceRoutes(app);
  registerPeriodCloseRoutes(app);
}

/**
 * Forward to sub-router registration functions
 */
function registerSyncDashboardRoutes(app: OpenAPIHono): void {
  // Sync routes are mounted via Hono routing
}

function registerReconciliationRoutes(app: OpenAPIHono): void {
  // Reconciliation routes are mounted via Hono routing
}

function registerTrialBalanceRoutes(app: OpenAPIHono): void {
  // Trial balance routes are mounted via Hono routing
}

function registerPeriodCloseRoutes(app: OpenAPIHono): void {
  // Period close routes are mounted via Hono routing
}
