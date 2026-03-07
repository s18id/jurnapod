// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useEffect, useMemo, useState } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import type { RuntimeProductCatalogItem } from "../services/runtime-service.js";
import { useProducts } from "../features/products/useProducts.js";
import { useCheckout } from "../features/checkout/useCheckout.js";
import { ProductSearch } from "../features/products/ProductSearch.js";
import { ProductGrid } from "../features/products/ProductGrid.js";
import { CheckoutForm } from "../features/checkout/CheckoutForm.js";
import { SyncBadge } from "../features/sync/SyncBadge.js";
import { normalizeMoney } from "../shared/utils/money.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface CheckoutPageProps {
  context: WebBootstrapContext;
  onLogout: () => void;
}

export function CheckoutPage({ context, onLogout }: CheckoutPageProps): JSX.Element {
  const {
    scope,
    setScope,
    outletOptions,
    syncBadgeState,
    pendingOutboxCount,
    hasProductCache,
    cart,
    cartLines,
    cartTotals,
    paidAmount,
    setPaidAmount,
    upsertCartLine,
    clearCart
  } = usePosAppState();

  const [catalog, setCatalog] = useState<RuntimeProductCatalogItem[]>([]);
  const { visibleProducts, searchTerm, setSearchTerm } = useProducts({ catalog });

  const checkoutConfig = context.runtime.resolveCheckoutConfig(null);
  const { paymentMethod, setPaymentMethod, paymentMethodAllowed, canCompleteSale, completeInFlight, runCompleteSale } = useCheckout({
    scope,
    runtime: {
      isPaymentMethodAllowed: context.runtime.isPaymentMethodAllowed.bind(context.runtime),
      resolvePaymentMethod: context.runtime.resolvePaymentMethod.bind(context.runtime)
    },
    initialPaymentMethods: checkoutConfig.payment_methods
  });

  useEffect(() => {
    let disposed = false;

    async function loadProducts() {
      try {
        const products = await context.runtime.getProductCatalog(scope);
        if (!disposed) {
          setCatalog(products);
        }
      } catch (error) {
        console.error("Failed to load products:", error);
      }
    }

    void loadProducts();
    return () => {
      disposed = true;
    };
  }, [context.runtime, scope]);

  const cartQuantities = useMemo(
    () => Object.fromEntries(Object.values(cart).map((line) => [line.product.item_id, line.qty])),
    [cart]
  );

  const offlineCacheMissing = syncBadgeState === "Offline" && !hasProductCache;
  const canComplete = !offlineCacheMissing && canCompleteSale(cartLines, cartTotals);

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
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Jurnapod POS</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SyncBadge status={syncBadgeState} pendingCount={pendingOutboxCount} />
            <button
              type="button"
              onClick={onLogout}
              style={{
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Logout
            </button>
          </div>
        </header>

        <label style={{ display: "block", marginTop: 12, marginBottom: 8, fontWeight: 600 }} htmlFor="outlet-select">
          Outlet context
        </label>
        <select
          id="outlet-select"
          value={scope.outlet_id}
          onChange={(event) => {
            setScope({
              ...scope,
              outlet_id: Number(event.target.value)
            });
            clearCart();
          }}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            fontSize: 14
          }}
        >
          {outletOptions.map((option) => (
            <option key={option.outlet_id} value={option.outlet_id}>
              {option.label}
            </option>
          ))}
        </select>

        <ProductSearch value={searchTerm} onChange={setSearchTerm} />

        <ProductGrid
          products={visibleProducts}
          cartQuantities={cartQuantities}
          onAddProduct={(product) => {
            upsertCartLine(product, { qty: (cart[product.item_id]?.qty ?? 0) + 1 });
            if (paidAmount <= 0) {
              setPaidAmount(product.price_snapshot);
            }
          }}
        />

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
            void runCompleteSale(cartLines, cartTotals, {
              setPaidAmount,
              setCart: clearCart
            });
          }}
        />
      </section>
    </main>
  );
}
