// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
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
    setOrderStatus,
    outletReservations,
    activeReservationId,
    setOutletTables
  } = usePosAppState();
  const activeReservation = outletReservations.find((row) => row.reservation_id === activeReservationId) ?? null;

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
