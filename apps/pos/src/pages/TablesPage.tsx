// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { Button, Card } from "../shared/components/index.js";
import { routes } from "../router/routes.js";
import type { RuntimeTableStatus } from "../services/runtime-service.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { formatMoney } from "../shared/utils/money.js";

interface TablesPageProps {
  context: WebBootstrapContext;
}

const statusColors: Record<RuntimeTableStatus, { background: string; border: string; text: string }> = {
  AVAILABLE: { background: "#ecfdf5", border: "#86efac", text: "#166534" },
  RESERVED: { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
  OCCUPIED: { background: "#fff7ed", border: "#fdba74", text: "#9a3412" },
  UNAVAILABLE: { background: "#f8fafc", border: "#cbd5e1", text: "#334155" }
};

export function TablesPage({ context }: TablesPageProps): JSX.Element {
  const navigate = useNavigate();
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
  const [tableOrderSummaryByTableId, setTableOrderSummaryByTableId] = useState<Record<number, {
    order_id: string;
    item_count: number;
    subtotal: number;
    reservation_id: number | null;
  }>>({});

  useEffect(() => {
    let disposed = false;

    async function loadTables() {
      const [tables, reservations, activeOrders] = await Promise.all([
        context.runtime.getOutletTables(scope),
        context.runtime.getOutletReservations(scope),
        context.runtime.listActiveOrders(scope, "OPEN", { finalizedOnly: true })
      ]);

      const snapshots = await Promise.all(
        activeOrders.map(async (order) => {
          const snapshot = await context.runtime.getActiveOrderSnapshot(scope, order.order_id);
          return snapshot;
        })
      );

      const nextSummaryByTableId: Record<number, {
        order_id: string;
        item_count: number;
        subtotal: number;
        reservation_id: number | null;
      }> = {};

      for (const snapshot of snapshots) {
        if (!snapshot || snapshot.order.service_type !== "DINE_IN" || !snapshot.order.table_id) {
          continue;
        }

        const itemCount = snapshot.lines.reduce((sum, line) => sum + line.qty, 0);
        const subtotal = snapshot.lines.reduce(
          (sum, line) => sum + (line.qty * line.unit_price_snapshot) - line.discount_amount,
          0
        );

        nextSummaryByTableId[snapshot.order.table_id] = {
          order_id: snapshot.order.order_id,
          item_count: itemCount,
          subtotal,
          reservation_id: snapshot.order.reservation_id
        };
      }

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
  }, [context.runtime, scope, setOutletReservations, setOutletTables]);

  const currentOrderTableId = useMemo(() => {
    for (const [tableIdRaw, summary] of Object.entries(tableOrderSummaryByTableId)) {
      if (summary.order_id === currentActiveOrderId) {
        return Number(tableIdRaw);
      }
    }
    return activeOrderContext.table_id;
  }, [activeOrderContext.table_id, currentActiveOrderId, tableOrderSummaryByTableId]);

  return (
    <div style={{ padding: 16 }}>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Tables</h1>
        <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 13 }}>
          Start or resume dine-in orders by table.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        {outletTables.map((table) => {
          const colors = statusColors[table.status];
          const tableOrderSummary = tableOrderSummaryByTableId[table.table_id] ?? null;
          const hasTableOrder = !!tableOrderSummary;
          const isCurrentOrderTable = currentOrderTableId === table.table_id;
          const hasOtherActiveTable =
            activeOrderContext.service_type === "DINE_IN"
            && !!currentOrderTableId
            && !isCurrentOrderTable;
          const canStartDineIn =
            table.status === "AVAILABLE"
            || isCurrentOrderTable
            || hasTableOrder
            || (table.status === "OCCUPIED" && !hasOtherActiveTable);
          const linkedReservation = outletReservations.find(
            (reservation) =>
              reservation.table_id === table.table_id
              && ["BOOKED", "CONFIRMED", "ARRIVED"].includes(reservation.status)
          );

          return (
            <Card key={table.table_id} padding="small">
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${colors.border}`,
                  background: colors.background
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong style={{ color: "#0f172a", fontSize: 14 }}>{table.code}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.text }}>{table.status}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#334155" }}>{table.name}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                  {table.zone ?? "General"} • Cap {table.capacity ?? "-"}
                </div>
                {linkedReservation ? (
                  <div style={{ marginTop: 4, fontSize: 12, color: "#1e3a8a", fontWeight: 600 }}>
                    Reserved for {linkedReservation.customer_name} ({linkedReservation.status})
                  </div>
                ) : null}
                {tableOrderSummary ? (
                  <div style={{ marginTop: 4, fontSize: 12, color: "#0f172a", fontWeight: 600 }}>
                    Active order: {tableOrderSummary.item_count} item(s) • {formatMoney(tableOrderSummary.subtotal)}
                  </div>
                ) : null}
                <Button
                  id={`table-action-${table.table_id}`}
                  name={`tableAction-${table.table_id}`}
                  variant="primary"
                  fullWidth
                  style={{ marginTop: 8 }}
                  disabled={!canStartDineIn}
                  onClick={() => {
                    void (async () => {
                      if (!tableOrderSummary) {
                        const occupied = await context.runtime.setOutletTableStatus(scope, table.table_id, "OCCUPIED");
                        if (occupied) {
                          setOutletTables((previous) =>
                            previous.map((row) => {
                              if (row.table_id === occupied.table_id) {
                                return occupied;
                              }
                              return row;
                            })
                          );
                        }
                      }

                      const reservationId = tableOrderSummary?.reservation_id ?? null;
                      if (!reservationId) {
                        setActiveReservationId(null);
                      }
                      setDineInContext({
                        tableId: table.table_id,
                        reservationId
                      });
                      navigate(routes.products.path);
                    })();
                  }}
                >
                  {isCurrentOrderTable
                    ? "Resume current order"
                    : hasTableOrder
                      ? "Resume table order"
                    : table.status === "OCCUPIED"
                      ? "Resume occupied table"
                      : "Use table"}
                </Button>
                {table.status === "OCCUPIED" && hasOtherActiveTable ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#7c2d12", fontWeight: 600 }}>
                    Use "Transfer table" in Cart to move current unpaid order.
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
