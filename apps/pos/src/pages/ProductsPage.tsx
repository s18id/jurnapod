// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState, useEffect } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { useNavigate } from "react-router-dom";
import type { RuntimeProductCatalogItem } from "../services/runtime-service.js";
import { ProductSearch } from "../features/products/ProductSearch.js";
import { ProductGrid } from "../features/products/ProductGrid.js";
import { useProducts } from "../features/products/useProducts.js";
import { Button } from "../shared/components/index.js";
import { routes } from "../router/routes.js";
import { formatMoney } from "../shared/utils/money.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface ProductsPageProps {
  context: WebBootstrapContext;
}

export function ProductsPage({ context }: ProductsPageProps): JSX.Element {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<RuntimeProductCatalogItem[]>([]);
  const {
    scope,
    cart,
    cartLines,
    cartTotals,
    upsertCartLine,
    paidAmount,
    setPaidAmount,
    activeOrderContext,
    setServiceType,
    setOrderReservationId,
    setGuestCount,
    setActiveReservationId,
    setOutletTables
  } = usePosAppState();
  const { visibleProducts, searchTerm, setSearchTerm } = useProducts({ catalog });
  const [dineInGuardMessage, setDineInGuardMessage] = useState<string | null>(null);

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
    return () => { disposed = true; };
  }, [context.runtime, scope]);

  const cartQuantities: Record<number, number> = Object.fromEntries(
    Object.values(cart).map((line) => [line.product.item_id, line.qty])
  );

  const handleAddProduct = (product: RuntimeProductCatalogItem) => {
    if (activeOrderContext.service_type === "DINE_IN" && !activeOrderContext.table_id) {
      setDineInGuardMessage("Select a table from the Tables page before adding items for dine-in.");
      return;
    }

    setDineInGuardMessage(null);
    upsertCartLine(product, { qty: (cart[product.item_id]?.qty ?? 0) + 1 });
    if (paidAmount <= 0) {
      setPaidAmount(product.price_snapshot);
    }
  };

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px"
  };

  return (
    <div style={containerStyles}>
      <h1 style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: 700 }}>Start Order</h1>

      <section
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          background: "#f8fafc"
        }}
      >
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>SERVICE MODE</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button
            variant={activeOrderContext.service_type === "TAKEAWAY" ? "primary" : "secondary"}
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

                setServiceType("TAKEAWAY");
                setOrderReservationId(null);
                setGuestCount(null);
                setActiveReservationId(null);
                setDineInGuardMessage(null);
              })();
            }}
          >
            Takeaway
          </Button>
          <Button
            variant={activeOrderContext.service_type === "DINE_IN" ? "primary" : "secondary"}
            size="small"
            onClick={() => {
              setServiceType("DINE_IN");
            }}
          >
            Dine-in
          </Button>
          <Button variant="secondary" size="small" onClick={() => navigate(routes.tables.path)}>
            Open tables
          </Button>
        </div>
        {activeOrderContext.service_type === "DINE_IN" ? (
          <div style={{ marginTop: 8, fontSize: 13, color: "#334155" }}>
            {activeOrderContext.table_id
              ? `Table selected: T${activeOrderContext.table_id}`
              : "Table required before adding items."}
          </div>
        ) : null}
      </section>
      
      <ProductSearch
        value={searchTerm}
        onChange={setSearchTerm}
      />

      <div style={{ marginTop: "16px" }}>
        <ProductGrid
          products={visibleProducts}
          cartQuantities={cartQuantities}
          onAddProduct={handleAddProduct}
        />
      </div>

      {dineInGuardMessage ? (
        <p
          role="alert"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #fdba74",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          {dineInGuardMessage}
        </p>
      ) : null}

      <footer
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: "1px solid #e2e8f0",
          position: "sticky",
          bottom: 0,
          background: "#ffffff"
        }}
      >
        <div style={{ fontSize: 13, color: "#475569" }}>
          Active order: {cartLines.length} item(s) • Total {formatMoney(cartTotals.grand_total)}
        </div>
        {!activeOrderContext.is_finalized && cartLines.length > 0 ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#9a3412", fontWeight: 600 }}>
            Draft order: review and finalize in Cart before payment.
          </div>
        ) : null}
        <Button
          variant="primary"
          fullWidth
          style={{ marginTop: 10 }}
          disabled={cartLines.length === 0}
          onClick={() => navigate(routes.cart.path)}
        >
          Continue to cart
        </Button>
      </footer>
    </div>
  );
}
