// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { useCheckout } from "../features/checkout/useCheckout.js";
import { CheckoutForm } from "../features/checkout/CheckoutForm.js";
import { normalizeMoney, formatMoney } from "../shared/utils/money.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface CheckoutPageProps {
  context: WebBootstrapContext;
}

export function CheckoutPage({ context }: CheckoutPageProps): JSX.Element {
  const {
    scope,
    syncBadgeState,
    hasProductCache,
    cartLines,
    cartTotals,
    setPaidAmount,
    clearCart,
    activeOrderContext,
    setOrderStatus,
    setOrderReservationId,
    outletReservations,
    activeReservationId,
    setActiveReservationId,
    setOutletReservations,
    setOutletTables
  } = usePosAppState();
  const activeReservation = outletReservations.find((row) => row.reservation_id === activeReservationId) ?? null;

  const checkoutConfig = context.runtime.resolveCheckoutConfig(null);
  const { paymentMethod, setPaymentMethod, paymentMethodAllowed, canCompleteSale, completeInFlight, lastCompleteMessage, runCompleteSale } = useCheckout({
    scope,
    activeOrderContext,
    runtime: {
      isPaymentMethodAllowed: context.runtime.isPaymentMethodAllowed.bind(context.runtime),
      resolvePaymentMethod: context.runtime.resolvePaymentMethod.bind(context.runtime)
    },
    initialPaymentMethods: checkoutConfig.payment_methods
  });

  const offlineCacheMissing = syncBadgeState === "Offline" && !hasProductCache;
  const dineInTableMissing = activeOrderContext.service_type === "DINE_IN" && !activeOrderContext.table_id;
  const canComplete = !offlineCacheMissing && !dineInTableMissing && canCompleteSale(cartLines, cartTotals);

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: 24,
        background: "linear-gradient(135deg, #ecfeff 0%, #fef3c7 100%)",
        color: "#0f172a",
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif'
      }}
    >
      <section
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: 20,
          borderRadius: 14,
          background: "rgba(255, 255, 255, 0.9)",
          border: "1px solid #e2e8f0",
          boxShadow: "0 6px 24px rgba(15, 23, 42, 0.08)"
        }}
      >
        <header style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Payment</h1>
          <div style={{ marginTop: 8, fontSize: 13, color: "#334155" }}>
            Final order: {cartLines.length} item(s) • Due {formatMoney(cartTotals.grand_total)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
            Service: {activeOrderContext.service_type}
            {activeOrderContext.service_type === "DINE_IN"
              ? ` • Table ${activeOrderContext.table_id ?? "Not selected"}`
              : ""}
            {activeReservation ? ` • Reservation ${activeReservation.customer_name}` : ""}
          </div>
        </header>

        {offlineCacheMissing ? (
          <p
            role="alert"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontWeight: 600
            }}
          >
            Checkout is blocked: offline product cache for the selected outlet is missing. Connect and run sync pull first.
          </p>
        ) : null}

        {cartLines.length === 0 ? (
          <p
            role="status"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
              fontWeight: 600
            }}
          >
            No items in the current order. Add products from the products page before taking payment.
          </p>
        ) : null}

        {dineInTableMissing ? (
          <p
            role="alert"
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              background: "#eff6ff",
              border: "1px solid #93c5fd",
              color: "#1e3a8a",
              fontWeight: 600
            }}
          >
            Dine-in checkout is blocked until a table is selected.
          </p>
        ) : null}

        <CheckoutForm
          paymentMethod={paymentMethod}
          paymentMethods={checkoutConfig.payment_methods}
          taxConfig={checkoutConfig.tax}
          totals={cartTotals}
          paymentMethodAllowed={paymentMethodAllowed}
          canComplete={canComplete}
          completeInFlight={completeInFlight}
          onPaymentMethodChange={setPaymentMethod}
          onPaidAmountChange={(amount) => setPaidAmount(normalizeMoney(amount))}
          onComplete={() => {
            const clearOrderContext = () => {
              if (activeOrderContext.service_type === "DINE_IN" && activeOrderContext.table_id) {
                void context.runtime
                  .setOutletTableStatus(scope, activeOrderContext.table_id, "AVAILABLE")
                  .then((released) => {
                    if (!released) {
                      return;
                    }
                    setOutletTables((previous) =>
                      previous.map((table) =>
                        table.table_id === released.table_id ? released : table
                      )
                    );
                  });
              }
              setOrderStatus("COMPLETED");
              setOrderReservationId(null);
              clearCart();
            };

            void runCompleteSale(cartLines, cartTotals, {
              setPaidAmount,
              onAfterComplete: async () => {
                if (activeReservationId) {
                  try {
                    const updated = await context.runtime.updateReservationStatus(scope, activeReservationId, "COMPLETED");
                    if (updated) {
                      setOutletReservations((previous) =>
                        previous.map((reservation) =>
                          reservation.reservation_id === updated.reservation_id ? updated : reservation
                        )
                      );
                    }
                  } catch {
                    // keep sale completion successful even if reservation update fails
                  } finally {
                    setActiveReservationId(null);
                  }
                }
              },
              setCart: clearOrderContext
            });
          }}
        />

        {lastCompleteMessage ? (
          <p style={{ marginTop: 12, fontSize: 13, color: "#334155" }} role="status">
            {lastCompleteMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
