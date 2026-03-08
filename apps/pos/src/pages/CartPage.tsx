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
import { formatMoney } from "../shared/utils/money.js";

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
    currentActiveOrderId,
    setActiveTableId,
    setOrderFinalized,
    setOrderStatus,
    outletTables,
    outletReservations,
    activeReservationId,
    setOutletTables,
    setOutletReservations,
    staleEditWarning,
    reloadLatestActiveOrder
  } = usePosAppState();
  const activeReservation = outletReservations.find((row) => row.reservation_id === activeReservationId) ?? null;
  const [transferTargetTableId, setTransferTargetTableId] = useState<string>("");
  const [transferInFlight, setTransferInFlight] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [cancelLineItemId, setCancelLineItemId] = useState<string>("");
  const [cancelQuantity, setCancelQuantity] = useState<string>("1");
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelInFlight, setCancelInFlight] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [tableOrderSummaryByTableId, setTableOrderSummaryByTableId] = useState<Record<number, {
    order_id: string;
    item_count: number;
    subtotal: number;
  }>>({});

  useEffect(() => {
    let disposed = false;

    async function loadTables() {
      const [tables, activeOrders] = await Promise.all([
        context.runtime.getOutletTables(scope),
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
          subtotal
        };
      }

      if (!disposed) {
        setOutletTables(tables);
        setTableOrderSummaryByTableId(nextSummaryByTableId);
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
        (table) =>
          table.status === "AVAILABLE"
          && table.table_id !== activeOrderContext.table_id
          && !tableOrderSummaryByTableId[table.table_id]
      ),
    [activeOrderContext.table_id, outletTables, tableOrderSummaryByTableId]
  );

  const transferSelectionSummary = useMemo(() => {
    if (!transferTargetTableId) {
      return null;
    }
    const tableId = Number(transferTargetTableId);
    const table = outletTables.find((row) => row.table_id === tableId) ?? null;
    const summary = tableOrderSummaryByTableId[tableId] ?? null;
    return {
      table,
      summary
    };
  }, [outletTables, tableOrderSummaryByTableId, transferTargetTableId]);

  const cancellableLines = useMemo(
    () => cartLines.filter((line) => line.committed_qty > 0),
    [cartLines]
  );

  const selectedCancelableLine = useMemo(() => {
    if (!cancelLineItemId) {
      return null;
    }
    return cancellableLines.find((line) => line.product.item_id === Number(cancelLineItemId)) ?? null;
  }, [cancelLineItemId, cancellableLines]);

  const selectedCancelableMaxQty = selectedCancelableLine ? Math.max(1, selectedCancelableLine.committed_qty) : 1;

  useEffect(() => {
    if (cancellableLines.length === 0) {
      setCancelLineItemId("");
      setCancelQuantity("1");
      setCancelReason("");
      return;
    }

    const selectedExists = cancellableLines.some((line) => String(line.product.item_id) === cancelLineItemId);
    if (!cancelLineItemId || !selectedExists) {
      setCancelLineItemId(String(cancellableLines[0].product.item_id));
      setCancelQuantity("1");
    }
  }, [cancelLineItemId, cancellableLines]);

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
        {staleEditWarning ? (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #f59e0b",
              background: "#fffbeb",
              display: "grid",
              gap: 8
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>{staleEditWarning}</div>
            <div style={{ fontSize: 12, color: "#92400e" }}>
              Reload the latest order snapshot before continuing to avoid stale edits.
            </div>
            <div>
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  void reloadLatestActiveOrder();
                }}
              >
                Reload latest order
              </Button>
            </div>
          </div>
        ) : null}
        <div
          style={{
            marginTop: 4,
            padding: 10,
            borderRadius: 10,
            border: `1px solid ${activeOrderContext.is_finalized ? "#86efac" : "#fdba74"}`,
            background: activeOrderContext.is_finalized ? "#ecfdf5" : "#fff7ed",
            display: "grid",
            gap: 8
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>Review & finalize</div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {activeOrderContext.is_finalized
              ? "Order finalized. Edit any item to return to draft."
              : "Draft mode. Finalize before proceeding to payment."}
          </div>
          <div>
            <Button
              size="small"
              variant={activeOrderContext.is_finalized ? "secondary" : "primary"}
              disabled={cartLines.length === 0}
              onClick={() => {
                if (activeOrderContext.is_finalized) {
                  setOrderFinalized(false);
                  return;
                }

                const confirmed = window.confirm(
                  `Finalize this order with ${cartLines.length} item(s) and total ${formatMoney(cartTotals.grand_total)}?`
                );
                if (confirmed) {
                  setOrderFinalized(true);
                }
              }}
            >
              {activeOrderContext.is_finalized ? "Mark as draft" : "Finalize order"}
            </Button>
          </div>
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
                disabled={transferInFlight || !transferTargetTableId || !currentActiveOrderId}
                onClick={() => {
                  void (async () => {
                    setTransferInFlight(true);
                    setTransferMessage(null);
                    try {
                      if (!currentActiveOrderId) {
                        setTransferMessage("No active order to transfer.");
                        return;
                      }

                      const targetTableId = Number(transferTargetTableId);
                      const result = await context.runtime.transferActiveOrderTable(scope, currentActiveOrderId, targetTableId);

                      if (!result) {
                        setTransferMessage("Failed to transfer active order.");
                        return;
                      }

                      const [latestTables, latestReservations] = await Promise.all([
                        context.runtime.getOutletTables(scope),
                        context.runtime.getOutletReservations(scope)
                      ]);

                      setOutletTables(latestTables);
                      setOutletReservations(latestReservations);
                      setActiveTableId(result.table_id);

                      setTransferTargetTableId("");
                      const targetTable = latestTables.find((table) => table.table_id === result.table_id);
                      setTransferMessage(`Table moved to ${targetTable?.code ?? `#${result.table_id}`}.`);
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
            <div style={{ fontSize: 12, color: "#475569" }}>
              {transferSelectionSummary?.table
                ? `${transferSelectionSummary.table.code} is available and has no running order.`
                : "Only available tables without active orders are shown."}
            </div>
            {Object.entries(tableOrderSummaryByTableId).length > 0 ? (
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>Running totals by table</div>
                <div style={{ display: "grid", gap: 2 }}>
                  {Object.entries(tableOrderSummaryByTableId)
                    .sort((left, right) => Number(left[0]) - Number(right[0]))
                    .map(([tableId, summary]) => {
                      const table = outletTables.find((row) => row.table_id === Number(tableId));
                      if (!table) {
                        return null;
                      }
                      return (
                        <div key={summary.order_id} style={{ fontSize: 12, color: "#334155" }}>
                          {table.code}: {summary.item_count} item(s) • {formatMoney(summary.subtotal)}
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}
            {transferMessage ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{transferMessage}</div>
            ) : null}
          </div>
        ) : null}
        {activeOrderContext.is_finalized && currentActiveOrderId && cancellableLines.length > 0 ? (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              display: "grid",
              gap: 8
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7f1d1d" }}>Cancel finalized item(s)</div>
            <div style={{ fontSize: 12, color: "#7f1d1d" }}>
              Use this for explicit reductions to committed quantities. Every cancellation requires a reason.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <select
                value={cancelLineItemId}
                onChange={(event) => {
                  setCancelLineItemId(event.target.value);
                  setCancelMessage(null);
                  setCancelQuantity("1");
                }}
                style={{
                  minWidth: 180,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  background: "#ffffff"
                }}
              >
                {cancellableLines.map((line) => (
                  <option key={line.product.item_id} value={String(line.product.item_id)}>
                    {line.product.name} (committed: {line.committed_qty})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={selectedCancelableMaxQty}
                value={cancelQuantity}
                onChange={(event) => {
                  setCancelQuantity(event.target.value);
                  setCancelMessage(null);
                }}
                style={{
                  width: 120,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  background: "#ffffff"
                }}
              />
              <textarea
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                  setCancelMessage(null);
                }}
                placeholder="Reason for cancellation"
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  resize: "vertical",
                  background: "#ffffff"
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="danger"
                  disabled={cancelInFlight}
                  onClick={() => {
                    void (async () => {
                      if (!selectedCancelableLine) {
                        setCancelMessage("Select an item to cancel.");
                        return;
                      }

                      const cancelQty = Number(cancelQuantity);
                      if (!Number.isInteger(cancelQty) || cancelQty <= 0) {
                        setCancelMessage("Cancellation quantity must be a positive integer.");
                        return;
                      }

                      if (cancelQty > selectedCancelableLine.committed_qty) {
                        setCancelMessage(`Cannot cancel more than committed qty (${selectedCancelableLine.committed_qty}).`);
                        return;
                      }

                      if (!cancelReason.trim()) {
                        setCancelMessage("Cancellation reason is required.");
                        return;
                      }

                      setCancelInFlight(true);
                      setCancelMessage(null);
                      try {
                        await context.runtime.cancelFinalizedOrderLine(scope, {
                          order_id: currentActiveOrderId,
                          item_id: selectedCancelableLine.product.item_id,
                          cancel_qty: cancelQty,
                          reason: cancelReason.trim()
                        });
                        await reloadLatestActiveOrder();
                        setCancelQuantity("1");
                        setCancelReason("");
                        setCancelMessage("Committed quantity cancelled and audit event recorded.");
                      } catch (error) {
                        setCancelMessage(error instanceof Error ? error.message : "Failed to cancel committed quantity");
                      } finally {
                        setCancelInFlight(false);
                      }
                    })();
                  }}
                >
                  {cancelInFlight ? "Cancelling..." : "Confirm cancellation"}
                </Button>
                <div style={{ fontSize: 12, color: "#7f1d1d" }}>
                  Max cancel qty: {selectedCancelableLine?.committed_qty ?? 0}
                </div>
              </div>
            </div>
            {cancelMessage ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7f1d1d" }}>{cancelMessage}</div>
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
            disabled={!activeOrderContext.is_finalized}
            onClick={() => {
              if (!activeOrderContext.is_finalized) {
                return;
              }
              setOrderStatus("READY_TO_PAY");
              navigate(routes.checkout.path);
            }}
          >
            {activeOrderContext.is_finalized ? "Proceed to payment" : "Finalize order first"}
          </Button>
        </footer>
      ) : null}
    </div>
  );
}
