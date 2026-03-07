// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useState } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { useNavigate } from "react-router-dom";
import { CartList } from "../features/cart/CartList.js";
import { CartSummary } from "../features/cart/CartSummary.js";
import { Button } from "../shared/components/index.js";
import { routes } from "../router/routes.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface CartPageProps {
  context: WebBootstrapContext;
}

export function CartPage({ context }: CartPageProps): JSX.Element {
  const navigate = useNavigate();
  const {
    scope,
    cart,
    cartLines,
    cartTotals,
    upsertCartLine,
    clearCart,
    activeOrderContext,
    setActiveTableId,
    setOrderStatus,
    outletTables,
    outletReservations,
    activeReservationId,
    setOutletTables,
    setOutletReservations
  } = usePosAppState();
  const activeReservation = outletReservations.find((row) => row.reservation_id === activeReservationId) ?? null;
  const [transferTargetTableId, setTransferTargetTableId] = useState<string>("");
  const [transferInFlight, setTransferInFlight] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadTables() {
      const tables = await context.runtime.getOutletTables(scope);
      if (!disposed) {
        setOutletTables(tables);
      }
    }

    if (activeOrderContext.service_type === "DINE_IN") {
      void loadTables();
    }

    return () => {
      disposed = true;
    };
  }, [activeOrderContext.service_type, context.runtime, scope, setOutletTables]);

  const transferOptions = useMemo(
    () =>
      outletTables.filter(
        (table) => table.status === "AVAILABLE" && table.table_id !== activeOrderContext.table_id
      ),
    [activeOrderContext.table_id, outletTables]
  );

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px"
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px"
  };

  const listStyles: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  };

  return (
    <div style={containerStyles}>
      <header style={headerStyles}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Cart</h1>
        {cartLines.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              void (async () => {
                if (activeOrderContext.service_type === "DINE_IN" && activeOrderContext.table_id) {
                  const released = await context.runtime.setOutletTableStatus(scope, activeOrderContext.table_id, "AVAILABLE");
                  if (released) {
                    setOutletTables((previous) =>
                      previous.map((table) =>
                        table.table_id === released.table_id ? released : table
                      )
                    );
                  }
                }
                clearCart();
              })();
            }}
          >
            Clear All
          </Button>
        )}
      </header>
      <div style={listStyles}>
        <div style={{ fontSize: 13, color: "#334155", padding: "4px 0" }}>
          Service: {activeOrderContext.service_type}
          {activeOrderContext.service_type === "DINE_IN"
            ? ` • Table ${activeOrderContext.table_id ?? "Not selected"}`
            : ""}
          {activeReservation ? ` • Reservation ${activeReservation.customer_name}` : ""}
        </div>
        {activeOrderContext.service_type === "DINE_IN" && activeOrderContext.table_id ? (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              display: "grid",
              gap: 8
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>Transfer table (unpaid order)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={transferTargetTableId}
                onChange={(event) => setTransferTargetTableId(event.target.value)}
                style={{
                  minWidth: 180,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  background: "#ffffff"
                }}
              >
                <option value="">Select available table</option>
                {transferOptions.map((table) => (
                  <option key={table.table_id} value={String(table.table_id)}>
                    {table.code} ({table.name})
                  </option>
                ))}
              </select>
              <Button
                size="small"
                variant="secondary"
                disabled={transferInFlight || !transferTargetTableId}
                onClick={() => {
                  void (async () => {
                    setTransferInFlight(true);
                    setTransferMessage(null);
                    try {
                      const targetTableId = Number(transferTargetTableId);
                      const result = await context.runtime.transferActiveTable(
                        scope,
                        activeOrderContext.table_id as number,
                        targetTableId
                      );

                      if (!result) {
                        setTransferMessage("Failed to transfer table.");
                        return;
                      }

                      setOutletTables((previous) =>
                        previous.map((table) => {
                          if (table.table_id === result.from.table_id) {
                            return result.from;
                          }
                          if (table.table_id === result.to.table_id) {
                            return result.to;
                          }
                          return table;
                        })
                      );
                      setActiveTableId(result.to.table_id);

                      if (activeReservationId) {
                        const updatedReservation = await context.runtime.assignReservationTable(
                          scope,
                          activeReservationId,
                          result.to.table_id
                        );
                        if (updatedReservation) {
                          setOutletReservations((previous) =>
                            previous.map((reservation) =>
                              reservation.reservation_id === updatedReservation.reservation_id
                                ? updatedReservation
                                : reservation
                            )
                          );
                        }
                      }

                      setTransferTargetTableId("");
                      setTransferMessage(`Table moved to ${result.to.code}.`);
                    } catch (error) {
                      setTransferMessage(error instanceof Error ? error.message : "Failed to transfer table");
                    } finally {
                      setTransferInFlight(false);
                    }
                  })();
                }}
              >
                {transferInFlight ? "Moving..." : "Move table"}
              </Button>
            </div>
            {transferMessage ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{transferMessage}</div>
            ) : null}
          </div>
        ) : null}
        <CartList
          lines={cartLines}
          onUpdateLine={(itemId, patch) => {
            const line = cart[itemId];
            if (!line) {
              return;
            }

            upsertCartLine(line.product, {
              qty: patch.qty,
              discount_amount: patch.discount_amount
            });
          }}
        />
      </div>

      {cartLines.length > 0 ? (
        <footer style={{ paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
          <CartSummary totals={cartTotals} />
          <Button
            variant="primary"
            fullWidth
            style={{ marginTop: 12 }}
            onClick={() => {
              setOrderStatus("READY_TO_PAY");
              navigate(routes.checkout.path);
            }}
          >
            Proceed to payment
          </Button>
        </footer>
      ) : null}
    </div>
  );
}
