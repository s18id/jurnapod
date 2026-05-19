// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ApiGapNotice, CountMetric, DashboardCard } from "@/features/dashboards/dashboard-card";
import type { useDashboardData } from "@/hooks/use-dashboard-data";
import type { DashboardPermissions } from "@/features/dashboards/global-admin-overview";

export function DomainDashboard(props: {
  permissions: DashboardPermissions;
  dashboard: ReturnType<typeof useDashboardData>;
  outletId?: number | null;
}) {
  const { permissions, dashboard } = props;

  if (!permissions.canViewInventory && !permissions.canViewAccounting && !permissions.canViewPurchasing) {
    return null;
  }

  return (
    <section>
      <h2>Domain Dashboards</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {permissions.canViewInventory ? (
          <DashboardCard
            title="Inventory Summary"
            description={dashboard.inventory.data?.outletScoped ? "Items and low stock alerts for selected outlet" : "Company items and low stock alerts"}
            href="#/items"
            state={
              props.outletId == null
                ? { status: "api-gap", message: "Select an outlet to view outlet-scoped stock alerts." }
                : dashboard.inventory.isLoading
                ? { status: "loading" }
                : dashboard.inventory.isError
                  ? { status: "error", message: dashboard.inventory.error?.message ?? "Unable to load inventory summary", retry: () => void dashboard.inventory.refetch() }
                  : dashboard.inventory.data
                    ? {
                        status: "success",
                        children: (
                          <div style={{ display: "grid", gap: 12 }}>
                            <CountMetric label="total items" value={dashboard.inventory.data.totalItems} />
                            <CountMetric label="low stock alerts" value={dashboard.inventory.data.lowStockAlerts} tone={dashboard.inventory.data.lowStockAlerts > 0 ? "warn" : "good"} />
                            <ApiGapNotice message={dashboard.inventory.data.recentStockMovements.message} />
                          </div>
                        ),
                      }
                    : { status: "empty", message: "No inventory records found" }
            }
          />
        ) : null}

        {permissions.canViewAccounting ? (
          <DashboardCard
            title="Accounting Summary"
            description="Reconciliations, fiscal periods, and journals"
            href="#/profit-loss"
            state={
              dashboard.accounting.isLoading
                ? { status: "loading" }
                : dashboard.accounting.isError
                  ? { status: "error", message: dashboard.accounting.error?.message ?? "Unable to load accounting summary", retry: () => void dashboard.accounting.refetch() }
                  : dashboard.accounting.data
                    ? {
                        status: "success",
                        children: (
                          <div style={{ display: "grid", gap: 12 }}>
                            <ApiGapNotice message={dashboard.accounting.data.pendingReconciliations.message} />
                            <CountMetric label="open fiscal years" value={dashboard.accounting.data.openFiscalYears} />
                            <CountMetric label="journal entries" value={dashboard.accounting.data.journalEntryCount} />
                          </div>
                        ),
                      }
                    : { status: "empty", message: "No accounting records found" }
            }
          />
        ) : null}

        {permissions.canViewPurchasing ? (
          <DashboardCard
            title="Purchasing Summary"
            description="Overdue invoices and open purchase orders"
            state={
              dashboard.purchasing.isLoading
                ? { status: "loading" }
                : dashboard.purchasing.isError
                  ? { status: "error", message: dashboard.purchasing.error?.message ?? "Unable to load purchasing summary", retry: () => void dashboard.purchasing.refetch() }
                  : dashboard.purchasing.data
                    ? {
                        status: "success",
                        children: (
                          <div style={{ display: "grid", gap: 12 }}>
                            <CountMetric label="overdue invoices" value={dashboard.purchasing.data.overdueInvoices} tone={dashboard.purchasing.data.overdueInvoices > 0 ? "bad" : "good"} />
                            <CountMetric label="open purchase orders" value={dashboard.purchasing.data.openPurchaseOrders} />
                            <ApiGapNotice message={dashboard.purchasing.data.pendingApprovals.message} />
                          </div>
                        ),
                      }
                    : { status: "empty", message: "No purchasing records found" }
            }
          />
        ) : null}
      </div>
    </section>
  );
}
