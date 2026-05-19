// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo, useState } from "react";

import { ApiGapNotice, DashboardCard, CountMetric } from "@/features/dashboards/dashboard-card";
import { DomainDashboard } from "@/features/dashboards/domain-dashboard";
import { MyWorkPanel } from "@/features/dashboards/my-work-panel";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHealthStatus, type HealthStatusResponse } from "@/hooks/use-health-status";
import { PERMISSION_BITS, resolveEffectivePermissions, userHasPermission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";
import { useShell } from "@/app/shell";

export interface DashboardPermissions {
  canReadOperations: boolean;
  canViewPendingExceptions: boolean;
  canViewAudit: boolean;
  canViewSettings: boolean;
  canViewInventory: boolean;
  canViewAccounting: boolean;
  canViewPurchasing: boolean;
}

export function getDashboardPermissions(user: SessionUser): DashboardPermissions {
  const permissions = resolveEffectivePermissions(user) ?? [];
  const has = (module: string, resource: string, mask: number) => userHasPermission(permissions, module, resource, mask);

  return {
    canReadOperations: has("platform", "operations", PERMISSION_BITS.READ),
    canViewPendingExceptions:
      has("accounting", "journals", PERMISSION_BITS.ANALYZE) || has("purchasing", "suppliers", PERMISSION_BITS.ANALYZE),
    canViewAudit: has("platform", "audit", PERMISSION_BITS.READ),
    canViewSettings: has("platform", "settings", PERMISSION_BITS.READ) || has("platform", "settings", PERMISSION_BITS.MANAGE),
    canViewInventory: has("inventory", "items", PERMISSION_BITS.READ),
    canViewAccounting: has("accounting", "reports", PERMISSION_BITS.ANALYZE),
    canViewPurchasing: has("purchasing", "reports", PERMISSION_BITS.ANALYZE),
  };
}

function formatLastUpdated(updatedAt: number): string {
  if (updatedAt <= 0) return "Not updated yet";
  return new Date(updatedAt).toLocaleTimeString();
}

function HealthIndicators(props: { data: HealthStatusResponse }) {
  const subsystems = props.data.subsystems ?? {};
  const entries = [
    ["API", props.data.status === "ok" ? "healthy" : props.data.status],
    ["Database", subsystems.database?.status ?? "unknown"],
    ["Import", subsystems.import?.status ?? "unknown"],
    ["Export", subsystems.export?.status ?? "unknown"],
    ["Sync", subsystems.sync?.status ?? "unknown"],
  ];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(([label, status]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{label}</span>
          <strong style={{ color: status === "healthy" ? "#047857" : status === "degraded" ? "#92400e" : status === "unknown" ? "#667085" : "#b42318" }}>{status}</strong>
        </div>
      ))}
    </div>
  );
}

export function GlobalAdminOverview(props: {
  permissions: DashboardPermissions;
  health: ReturnType<typeof useHealthStatus>;
  dashboard: ReturnType<typeof useDashboardData>;
}) {
  const { permissions, health, dashboard } = props;

  return (
    <section>
      <h2>Global Admin Overview</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <DashboardCard
          title="System Health"
          description="API, database, import/export, and sync status"
          state={
            health.isLoading
              ? { status: "loading" }
              : health.isError
                ? { status: "error", message: health.error?.message ?? "Service unavailable", retry: () => void health.refetch() }
                : health.data
                  ? { status: "success", children: <HealthIndicators data={health.data} /> }
                  : { status: "empty", message: "All systems operational" }
          }
        />

        {permissions.canReadOperations ? (
          <DashboardCard
            title="Failed Jobs"
            description="Company failed operations"
            href="#/operations?status=failed"
            state={
              dashboard.failedJobs.isLoading
                ? { status: "loading" }
                : dashboard.failedJobs.isError
                  ? { status: "error", message: dashboard.failedJobs.error?.message ?? "Unable to load failed jobs", retry: () => void dashboard.failedJobs.refetch() }
                  : (dashboard.failedJobs.data?.total ?? 0) === 0
                    ? { status: "empty", message: "All systems operational" }
                    : { status: "success", children: <CountMetric label="failed operations" value={dashboard.failedJobs.data?.total ?? 0} tone="bad" /> }
            }
          />
        ) : null}

        {permissions.canViewPendingExceptions ? (
          <DashboardCard
            title="Known Pending Exceptions"
            description="AP exceptions and sync errors; reconciliation mismatch source is shown separately when unavailable"
            href="#/journals"
            state={
              dashboard.pendingExceptions.isLoading
                ? { status: "loading" }
                : dashboard.pendingExceptions.isError
                  ? { status: "error", message: dashboard.pendingExceptions.error?.message ?? "Unable to load pending exceptions", retry: () => void dashboard.pendingExceptions.refetch() }
                  : (dashboard.pendingExceptions.data?.total ?? 0) === 0
                    ? {
                        status: "success",
                        children: (
                          <div style={{ display: "grid", gap: 12 }}>
                            <span style={{ color: "#047857" }}>No known pending exceptions</span>
                            {dashboard.pendingExceptions.data?.reconciliationMismatches ? (
                              <ApiGapNotice message={dashboard.pendingExceptions.data.reconciliationMismatches.message} />
                            ) : null}
                          </div>
                        ),
                      }
                    : {
                        status: "success",
                        children: (
                          <div style={{ display: "grid", gap: 12 }}>
                            <CountMetric label="known pending exceptions" value={dashboard.pendingExceptions.data?.total ?? 0} tone="warn" />
                            {dashboard.pendingExceptions.data?.reconciliationMismatches ? (
                              <ApiGapNotice message={dashboard.pendingExceptions.data.reconciliationMismatches.message} />
                            ) : null}
                          </div>
                        ),
                      }
            }
          />
        ) : null}

        <DashboardCard
          title="Quick Links"
          description="Common operational shortcuts"
          state={{
            status: "success",
            children: (
              <nav aria-label="Dashboard quick links" style={{ display: "grid", gap: 8 }}>
                {permissions.canReadOperations ? <a href="#/operations">Operations center</a> : null}
                {permissions.canViewAudit ? <a href="#/audit">Audit explorer</a> : null}
                {permissions.canViewSettings ? <a href="#/modules">Settings</a> : null}
                {!permissions.canReadOperations && !permissions.canViewAudit && !permissions.canViewSettings ? <span>No quick links available</span> : null}
              </nav>
            ),
          }}
        />
      </div>
    </section>
  );
}

export function LayeredDashboardPage(props: { user: SessionUser }) {
  const shell = useShell();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalMs, setIntervalMs] = useState(60_000);
  const permissions = useMemo(() => getDashboardPermissions(props.user), [props.user]);
  const health = useHealthStatus({ autoRefresh, intervalMs });
  const outletId = shell.outlet.currentOutlet?.id ?? null;
  const dashboard = useDashboardData({ autoRefresh, intervalMs, permissions, outletId });
  const lastUpdated = Math.max(
    health.dataUpdatedAt,
    dashboard.failedJobs.dataUpdatedAt,
    dashboard.recentJobs.dataUpdatedAt,
    dashboard.inventory.dataUpdatedAt,
    dashboard.accounting.dataUpdatedAt,
    dashboard.purchasing.dataUpdatedAt,
    dashboard.pendingExceptions.dataUpdatedAt,
  );

  return (
    <main style={{ display: "grid", gap: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h1>Dashboard</h1>
          <p>Layered overview for system health, domain status, and company work.</p>
          <p>Last updated: {formatLastUpdated(lastUpdated)}</p>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Auto-refresh
          </label>
          <label>
            Refresh interval
            <select value={intervalMs} onChange={(event) => setIntervalMs(Number(event.target.value))}>
              <option value={30_000}>30 seconds</option>
              <option value={60_000}>60 seconds</option>
              <option value={300_000}>5 minutes</option>
            </select>
          </label>
        </div>
      </header>

      <GlobalAdminOverview permissions={permissions} health={health} dashboard={dashboard} />
      <DomainDashboard permissions={permissions} dashboard={dashboard} outletId={outletId} />
      <MyWorkPanel user={props.user} permissions={permissions} dashboard={dashboard} />
    </main>
  );
}
