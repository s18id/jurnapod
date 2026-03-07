// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState, useEffect } from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import type { RuntimeProductCatalogItem } from "../services/runtime-service.js";
import { ProductSearch } from "../features/products/ProductSearch.js";
import { ProductGrid } from "../features/products/ProductGrid.js";
import { useProducts } from "../features/products/useProducts.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface ProductsPageProps {
  context: WebBootstrapContext;
}

export function ProductsPage({ context }: ProductsPageProps): JSX.Element {
  const [catalog, setCatalog] = useState<RuntimeProductCatalogItem[]>([]);
  const { scope, cart, upsertCartLine, paidAmount, setPaidAmount } = usePosAppState();
  const { visibleProducts, searchTerm, setSearchTerm } = useProducts({ catalog });

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
      <h1 style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: 700 }}>Products</h1>
      
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
    </div>
  );
}
