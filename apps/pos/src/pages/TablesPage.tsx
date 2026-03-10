// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonGrid,
  IonRefresher,
  IonRefresherContent,
  IonRow,
  type RefresherEventDetail
} from "@ionic/react";
import { useNavigate } from "react-router-dom";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { Button, InlineAlert } from "../shared/components/index.js";
import { routes } from "../router/routes.js";
import type {
  RuntimeTableStatus,
  RuntimeOutletTable,
  RuntimeReservation,
  RuntimeOutletScope
} from "../services/runtime-service.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { useRouterContext } from "../router/Router.js";
import { formatMoney } from "../shared/utils/money.js";

interface TablesPageProps {
  context: WebBootstrapContext;
}

interface TableOrderSummary {
  order_id: string;
  item_count: number;
  subtotal: number;
  reservation_id: number | null;
}

const STATUS_COLORS: Record<RuntimeTableStatus, { background: string; border: string; text: string }> = {
  AVAILABLE: { background: "#ecfdf5", border: "#86efac", text: "#166534" },
  RESERVED: { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
  OCCUPIED: { background: "#fff7ed", border: "#fdba74", text: "#9a3412" },
  UNAVAILABLE: { background: "#f8fafc", border: "#cbd5e1", text: "#334155" }
};

const STYLES = {
  pageContainer: { padding: 16 },
  header: { marginBottom: 14 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { margin: 0, fontSize: 20, fontWeight: 700 },
  subtitle: { margin: "8px 0 0", color: "#475569", fontSize: 13 },
  emptyState: {
    padding: 32,
    textAlign: "center" as const,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8
  },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: "#334155", marginBottom: 8 },
  emptyMessage: { fontSize: 14, color: "#64748b", marginBottom: 16 },
  tableCard: {
    padding: 10,
    borderRadius: 10
  },
  tableHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  tableCode: { color: "#0f172a", fontSize: 14 },
  tableName: { marginTop: 4, fontSize: 12, color: "#334155" },
  tableZone: { marginTop: 2, fontSize: 12, color: "#64748b" },
  reservationInfo: { marginTop: 4, fontSize: 12, color: "#1e3a8a", fontWeight: 600 },
  orderSummary: { marginTop: 4, fontSize: 12, color: "#0f172a", fontWeight: 600 },
  actionButton: { marginTop: 8 },
  transferHint: { marginTop: 6, fontSize: 11, color: "#7c2d12", fontWeight: 600 }
} as const;

/**
 * Fetches tables, reservations, and active orders in parallel.
 */
async function fetchTablesAndReservations(
  context: WebBootstrapContext,
  scope: RuntimeOutletScope
): Promise<{
  tables: RuntimeOutletTable[];
  reservations: RuntimeReservation[];
  activeOrders: Awaited<ReturnType<typeof context.runtime.listActiveOrders>>;
}> {
  const [tables, reservations, activeOrders] = await Promise.all([
    context.runtime.getOutletTables(scope),
    context.runtime.getOutletReservations(scope),
    context.runtime.listActiveOrders(scope, "OPEN", { finalizedOnly: true })
  ]);

  return { tables, reservations, activeOrders };
}

/**
 * Determines if auto-sync should be triggered for tables/reservations.
 */
function shouldAutoSyncTablesData(
  isOnline: boolean,
  tablesCount: number,
  reservationsCount: number,
  scopeKey: string,
  autoSyncScopesRef: Set<string>
): boolean {
  return (
    isOnline &&
    (tablesCount === 0 || reservationsCount === 0) &&
    !autoSyncScopesRef.has(scopeKey)
  );
}

/**
 * Builds a map of table_id → order summary from active order snapshots.
 */
async function buildTableOrderSummaries(
  context: WebBootstrapContext,
  scope: RuntimeOutletScope,
  activeOrders: Awaited<ReturnType<typeof context.runtime.listActiveOrders>>
): Promise<Record<number, TableOrderSummary>> {
  const snapshots = await Promise.all(
    activeOrders.map(async (order) => {
      const snapshot = await context.runtime.getActiveOrderSnapshot(scope, order.order_id);
      return snapshot;
    })
  );

  const summaryByTableId: Record<number, TableOrderSummary> = {};

  for (const snapshot of snapshots) {
    if (!snapshot || snapshot.order.service_type !== "DINE_IN" || !snapshot.order.table_id) {
      continue;
    }

    const itemCount = snapshot.lines.reduce((sum, line) => sum + line.qty, 0);
    const subtotal = snapshot.lines.reduce(
      (sum, line) => sum + (line.qty * line.unit_price_snapshot) - line.discount_amount,
      0
    );

    summaryByTableId[snapshot.order.table_id] = {
      order_id: snapshot.order.order_id,
      item_count: itemCount,
      subtotal,
      reservation_id: snapshot.order.reservation_id
    };
  }

  return summaryByTableId;
}

/**
 * Finds the active reservation linked to a table.
 */
function getLinkedReservation(
  tableId: number,
  reservations: RuntimeReservation[]
): RuntimeReservation | null {
  const reservation = reservations.find(
    (r) =>
      r.table_id === tableId &&
      ["BOOKED", "CONFIRMED", "ARRIVED"].includes(r.status)
  );
  return reservation ?? null;
}

/**
 * Determines if the user can start or resume a dine-in order for a table.
 */
function canStartDineInOrder(
  tableStatus: RuntimeTableStatus,
  hasTableOrder: boolean,
  isCurrentOrderTable: boolean,
  hasOtherActiveTable: boolean
): boolean {
  return (
    tableStatus === "AVAILABLE" ||
    isCurrentOrderTable ||
    hasTableOrder ||
    (tableStatus === "OCCUPIED" && !hasOtherActiveTable)
  );
}

/**
 * Returns the appropriate button label based on table state.
 */
function getTableActionLabel(
  isCurrentOrderTable: boolean,
  hasTableOrder: boolean,
  tableStatus: RuntimeTableStatus
): string {
  if (isCurrentOrderTable) {
    return "Resume current order";
  }
  if (hasTableOrder) {
    return "Resume table order";
  }
  if (tableStatus === "OCCUPIED") {
    return "Resume occupied table";
  }
  return "Use table";
}

export function TablesPage({ context }: TablesPageProps): JSX.Element {
  const navigate = useNavigate();
  const { authToken } = useRouterContext();
  const {
    scope,
    outletTables,
    setOutletTables,
    outletReservations,
    setOutletReservations,
    activeOrderContext,
    setDineInContext,
    setActiveReservationId,
    currentActiveOrderId
  } = usePosAppState();
  const [tableOrderSummaryByTableId, setTableOrderSummaryByTableId] = useState<Record<number, TableOrderSummary>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const autoSyncScopesRef = useRef<Set<string>>(new Set());

  async function pullWithAuth(): Promise<void> {
    if (!authToken) {
      throw new Error("Missing access token. Please sign in again.");
    }
    await context.sync.pull(scope, { accessToken: authToken });
  }

  useEffect(() => {
    let disposed = false;

    async function loadTables() {
      let { tables, reservations, activeOrders } = await fetchTablesAndReservations(context, scope);

      const scopeKey = `${scope.company_id}:${scope.outlet_id}`;
      const shouldAutoSync = shouldAutoSyncTablesData(
        context.runtime.isOnline(),
        tables.length,
        reservations.length,
        scopeKey,
        autoSyncScopesRef.current
      );

      if (shouldAutoSync) {
        try {
          await pullWithAuth();
          ({ tables, reservations, activeOrders } = await fetchTablesAndReservations(context, scope));
          autoSyncScopesRef.current.add(scopeKey);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to sync";
          setSyncError(message);
          console.error("Failed to auto-sync tables/reservations:", error);
        }
      }

      const nextSummaryByTableId = await buildTableOrderSummaries(context, scope, activeOrders);

      if (!disposed) {
        setOutletTables(tables);
        setOutletReservations(reservations);
        setTableOrderSummaryByTableId(nextSummaryByTableId);
      }
    }

    void loadTables();
    return () => {
      disposed = true;
    };
  }, [context.runtime, scope, setOutletReservations, setOutletTables, authToken]);

  const currentOrderTableId = useMemo(() => {
    for (const [tableIdRaw, summary] of Object.entries(tableOrderSummaryByTableId)) {
      if (summary.order_id === currentActiveOrderId) {
        return Number(tableIdRaw);
      }
    }
    return activeOrderContext.table_id;
  }, [activeOrderContext.table_id, currentActiveOrderId, tableOrderSummaryByTableId]);

  async function handleTableSelect(
    table: RuntimeOutletTable,
    tableOrderSummary: TableOrderSummary | null
  ): Promise<void> {
    const reservationId = tableOrderSummary?.reservation_id ?? null;
    if (!reservationId) {
      setActiveReservationId(null);
    }
    setDineInContext({
      tableId: table.table_id,
      reservationId
    });
    navigate(routes.products.path);
  }

  async function handleSyncTables() {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await pullWithAuth();
      const { tables, reservations, activeOrders } = await fetchTablesAndReservations(context, scope);
      const nextSummaryByTableId = await buildTableOrderSummaries(context, scope, activeOrders);
      setOutletTables(tables);
      setOutletReservations(reservations);
      setTableOrderSummaryByTableId(nextSummaryByTableId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh tables";
      setSyncError(message);
      console.error("Failed to sync tables:", error);
    } finally {
      setIsSyncing(false);
    }
  }

  const handleRefresh = (event: CustomEvent<RefresherEventDetail>) => {
    void handleSyncTables().finally(() => {
      event.detail.complete();
    });
  };

  return (
    <div style={STYLES.pageContainer}>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>

      <header style={STYLES.header}>
        <div style={STYLES.headerRow}>
          <div>
            <h1 style={STYLES.title}>Tables</h1>
            <p style={STYLES.subtitle}>
              Start or resume dine-in orders by table.
            </p>
          </div>
          <IonButton
            id="sync-tables"
            fill="outline"
            color="medium"
            disabled={isSyncing}
            onClick={() => void handleSyncTables()}
          >
            {isSyncing ? "Syncing..." : "Refresh tables"}
          </IonButton>
        </div>
      </header>

      {syncError && (
        <InlineAlert
          title="Failed to refresh tables"
          message={syncError}
          tone="error"
          onRetry={() => void handleSyncTables()}
        />
      )}

      {outletTables.length === 0 ? (
        <div style={STYLES.emptyState}>
          <div style={STYLES.emptyTitle}>
            No tables configured
          </div>
          <div style={STYLES.emptyMessage}>
            Please configure tables in backoffice or sync to get the latest configuration.
          </div>
           <IonButton
             id="sync-tables-empty"
             color="primary"
             disabled={isSyncing}
             onClick={() => void handleSyncTables()}
           >
             {isSyncing ? "Syncing..." : "Sync now"}
           </IonButton>
         </div>
       ) : (
        <IonGrid>
          <IonRow>
            {outletTables.map((table) => {
          const colors = STATUS_COLORS[table.status];
          const tableOrderSummary = tableOrderSummaryByTableId[table.table_id] ?? null;
          const hasTableOrder = !!tableOrderSummary;
          const isCurrentOrderTable = currentOrderTableId === table.table_id;
          const hasOtherActiveTable =
            activeOrderContext.service_type === "DINE_IN"
            && !!currentOrderTableId
            && !isCurrentOrderTable;
          const canStartDineIn = canStartDineInOrder(
            table.status,
            hasTableOrder,
            isCurrentOrderTable,
            hasOtherActiveTable
          );
          const linkedReservation = getLinkedReservation(table.table_id, outletReservations);
          const actionLabel = getTableActionLabel(isCurrentOrderTable, hasTableOrder, table.status);

          return (
            <IonCol key={table.table_id} size="12" sizeMd="6" sizeLg="4">
              <IonCard>
                <IonCardContent>
               <div
                 style={{
                  ...STYLES.tableCard,
                  border: `1px solid ${colors.border}`,
                  background: colors.background
                }}
              >
                <div style={STYLES.tableHeader}>
                  <strong style={STYLES.tableCode}>{table.code}</strong>
                  <IonBadge style={{ background: colors.background, color: colors.text, border: `1px solid ${colors.border}` }}>
                    {table.status}
                  </IonBadge>
                </div>
                <div style={STYLES.tableName}>{table.name}</div>
                <div style={STYLES.tableZone}>
                  {table.zone ?? "General"} • Cap {table.capacity ?? "-"}
                </div>
                {linkedReservation ? (
                  <div style={STYLES.reservationInfo}>
                    Reserved for {linkedReservation.customer_name} ({linkedReservation.status})
                  </div>
                ) : null}
                {tableOrderSummary ? (
                  <div style={STYLES.orderSummary}>
                    Active order: {tableOrderSummary.item_count} item(s) • {formatMoney(tableOrderSummary.subtotal)}
                  </div>
                ) : null}
                <Button
                  id={`table-action-${table.table_id}`}
                  name={`tableAction-${table.table_id}`}
                  variant="primary"
                  fullWidth
                  style={STYLES.actionButton}
                  disabled={!canStartDineIn}
                  onClick={() => void handleTableSelect(table, tableOrderSummary)}
                >
                  {actionLabel}
                 </Button>
                 {table.status === "OCCUPIED" && hasOtherActiveTable ? (
                   <div style={STYLES.transferHint}>
                     Use "Transfer table" in Cart to move current unpaid order.
                   </div>
                 ) : null}
               </div>
                </IonCardContent>
              </IonCard>
            </IonCol>
            );
          })}
          </IonRow>
        </IonGrid>
       )}
      </div>
    );
  }
