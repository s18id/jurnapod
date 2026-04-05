// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Admin Dashboard Routes
 *
 * Built-in dashboards for operational monitoring:
 * - GET /admin/dashboard/sync - Sync health dashboard
 * - GET /admin/dashboard/financial - Financial posting dashboard
 *
 * These dashboards are self-contained HTML pages that auto-refresh
 * using data from the /metrics endpoint.
 */

import { Hono } from "hono";
import { authenticateRequest, requireAccess, type AuthContext } from "../lib/auth-guard.js";
import { errorResponse } from "../lib/response.js";
import { getOutboxMetricsSnapshot, getSyncHealthMetricsSnapshot, getJournalHealthMetricsSnapshot, type OutboxMetricsSnapshot, type SyncHealthMetricsSnapshot, type JournalHealthMetricsSnapshot } from "../lib/metrics/dashboard-metrics.js";
import { register } from "prom-client";
import {
  ReconciliationDashboardService,
  type ReconciliationDashboardQuery,
  type AccountTypeFilter,
  type ReconciliationStatus,
} from "../lib/reconciliation-dashboard.js";

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
// Sync Health Dashboard - GET /admin/dashboard/sync
// =============================================================================

adminDashboardRoutes.get("/sync", async (c) => {
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

// =============================================================================
// Reconciliation Dashboard - GET /admin/dashboard/reconciliation
// =============================================================================

adminDashboardRoutes.get("/reconciliation", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;

    // Parse query parameters
    const url = new URL(c.req.url);
    const fiscalYearId = url.searchParams.get("fiscal_year_id") ? Number(url.searchParams.get("fiscal_year_id")) : undefined;
    const periodId = url.searchParams.get("period_id") ? Number(url.searchParams.get("period_id")) : undefined;
    const outletId = url.searchParams.get("outlet_id") ? Number(url.searchParams.get("outlet_id")) : undefined;
    
    const accountTypesParam = url.searchParams.get("account_types");
    const accountTypes: AccountTypeFilter[] | undefined = accountTypesParam 
      ? accountTypesParam.split(",").map(t => t.trim().toUpperCase() as AccountTypeFilter)
      : undefined;
    
    const statusesParam = url.searchParams.get("statuses");
    const statuses: ReconciliationStatus[] | undefined = statusesParam
      ? statusesParam.split(",").map(s => s.trim().toUpperCase() as ReconciliationStatus)
      : undefined;
    
    const includeDrilldown = url.searchParams.get("include_drilldown") === "true";
    const trendPeriods = url.searchParams.get("trend_periods") ? Number(url.searchParams.get("trend_periods")) : 3;

    // Build query
    const query: ReconciliationDashboardQuery = {
      companyId,
      outletId,
      fiscalYearId,
      periodId,
      accountTypes,
      statuses,
      includeDrilldown,
      trendPeriods,
    };

    // Get dashboard data
    const { getDb } = await import("../lib/db.js");
    const dashboardService = new ReconciliationDashboardService(getDb() as any);
    
    const dashboard = await dashboardService.getDashboard(query);

    // Get Epic 30 gl_imbalance_detected_total metric from prometheus registry
    const metrics = await register.getMetricsAsJSON();
    const glImbalanceMetric = metrics.find((m: { name: string }) => m.name === "gl_imbalance_detected_total");
    const filteredGlImbalance = glImbalanceMetric?.values?.filter((v: { labels: Record<string, unknown> }) => 
      String(v.labels.company_id) === String(companyId)
    ) ?? [];
    const glImbalanceCount = filteredGlImbalance.reduce((sum: number, v: { value: number }) => sum + v.value, 0);

    // Enhance with Epic 30 metric
    const enhancedDashboard = {
      ...dashboard,
      glImbalanceMetric: {
        ...dashboard.glImbalanceMetric,
        totalImbalances: dashboard.glImbalanceMetric.totalImbalances + glImbalanceCount,
      },
    };

    return c.json({
      success: true,
      data: enhancedDashboard,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/reconciliation failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load reconciliation dashboard", 500);
  }
});

// =============================================================================
// Reconciliation Drilldown - GET /admin/dashboard/reconciliation/:accountId/drilldown
// =============================================================================

adminDashboardRoutes.get("/reconciliation/:accountId/drilldown", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;
    const accountId = Number(c.req.param("accountId"));

    if (isNaN(accountId)) {
      return errorResponse("BAD_REQUEST", "Invalid account ID", 400);
    }

    // Parse query parameters
    const url = new URL(c.req.url);
    const fiscalYearId = url.searchParams.get("fiscal_year_id") ? Number(url.searchParams.get("fiscal_year_id")) : undefined;
    const periodId = url.searchParams.get("period_id") ? Number(url.searchParams.get("period_id")) : undefined;

    // Get drilldown data
    const { getDb } = await import("../lib/db.js");
    const dashboardService = new ReconciliationDashboardService(getDb() as any);
    
    const drilldown = await dashboardService.getVarianceDrilldown(
      companyId,
      accountId,
      periodId,
      fiscalYearId
    );

    if (!drilldown) {
      return errorResponse("NOT_FOUND", "Account not found", 404);
    }

    return c.json({
      success: true,
      data: drilldown,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/reconciliation/:accountId/drilldown failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load variance drilldown", 500);
  }
});

export { adminDashboardRoutes };
