// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useState } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { useCheckout } from "../features/checkout/useCheckout.js";
import { CheckoutForm } from "../features/checkout/CheckoutForm.js";
import { normalizeMoney, formatMoney } from "../shared/utils/money.js";
import { usePosAppState } from "../router/pos-app-state.js";
import type { RuntimeCheckoutConfig } from "../services/runtime-service.js";

interface CheckoutPageProps {
  context: WebBootstrapContext;
}

const DEFAULT_CHECKOUT_CONFIG: RuntimeCheckoutConfig = {
  tax: { rate: 0, inclusive: false },
  payment_methods: ["CASH"]
};

export function CheckoutPage({ context }: CheckoutPageProps): JSX.Element {
  const {
    scope,
    syncBadgeState,
    hasProductCache,
    cartLines,
    cartTotals,
    setPaidAmount,
    resetCartStatePreserveOrderStatus,
    activeOrderContext,
    setOrderStatus,
    currentActiveOrderId,
    setOrderReservationId,
    outletReservations,
    activeReservationId,
    setActiveReservationId,
    setOutletReservations,
    setOutletTables
  } = usePosAppState();
  const activeReservation = outletReservations.find((row) => row.reservation_id === activeReservationId) ?? null;

  const [checkoutConfig, setCheckoutConfig] = useState<RuntimeCheckoutConfig>(DEFAULT_CHECKOUT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    setConfigLoading(true);
    void (async () => {
      try {
        const config = await context.runtime.resolveScopedCheckoutConfig(scope);
        if (!disposed) {
          setCheckoutConfig(config);
        }
      } catch (error) {
        console.error("Failed to load scoped checkout config:", error);
        // Keep default config on error
      } finally {
        if (!disposed) {
          setConfigLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [context.runtime, scope.company_id, scope.outlet_id]);

  const checkoutRuntime = useMemo(
    () => ({
      isPaymentMethodAllowed: context.runtime.isPaymentMethodAllowed.bind(context.runtime),
      resolvePaymentMethod: context.runtime.resolvePaymentMethod.bind(context.runtime)
    }),
    [context.runtime]
  );

  const { paymentMethod, setPaymentMethod, paymentMethodAllowed, canCompleteSale, completeInFlight, lastCompleteMessage, runCompleteSale } = useCheckout({
    scope,
    activeOrderContext,
    requestPush: context.orchestrator.requestPush.bind(context.orchestrator),
    runtime: checkoutRuntime,
    initialPaymentMethods: checkoutConfig.payment_methods
  });

  const offlineCacheMissing = syncBadgeState === "Offline" && !hasProductCache;
  const dineInTableMissing = activeOrderContext.service_type === "DINE_IN" && !activeOrderContext.table_id;
  const orderNotFinalized = !activeOrderContext.kitchen_sent;
  const canComplete = !configLoading && !offlineCacheMissing && !dineInTableMissing && !orderNotFinalized && canCompleteSale(cartLines, cartTotals);

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: 16,
        background: "#f8fafc",
        color: "#0f172a"
      }}
    >
      <section
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: 16,
          borderRadius: 10,
          background: "#ffffff",
          border: "1px solid #e2e8f0"
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Payment</h1>
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

        {orderNotFinalized ? (
          <p
            role="alert"
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
            Checkout is blocked until this order is finalized from the Cart page.
          </p>
        ) : null}

        {configLoading ? (
          <p
            role="status"
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
            Loading outlet configuration...
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
              const clearOrderContext = async () => {
                const sessionResult = await context.runtime.completeOrderSession(scope, {
                  order_id: currentActiveOrderId,
                  table_id: activeOrderContext.service_type === "DINE_IN" ? activeOrderContext.table_id : null,
                  reservation_id: activeOrderContext.reservation_id
                });

                if (sessionResult.table) {
                  setOutletTables((previous) =>
                    previous.map((table) =>
                      table.table_id === sessionResult.table?.table_id ? sessionResult.table : table
                    )
                  );
                }

                if (sessionResult.reservation) {
                  setOutletReservations((previous) =>
                    previous.map((reservation) =>
                      reservation.reservation_id === sessionResult.reservation?.reservation_id
                        ? sessionResult.reservation
                        : reservation
                    )
                  );
                }

                setOrderStatus("COMPLETED");
                setOrderReservationId(null);
                setActiveReservationId(null);
                resetCartStatePreserveOrderStatus();
              };

            void runCompleteSale(cartLines, cartTotals, {
              setPaidAmount,
              onAfterSaleCommit: clearOrderContext
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
