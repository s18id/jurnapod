// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { ProductCard } from "./ProductCard.js";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";

export interface ProductGridProps {
  products: RuntimeProductCatalogItem[];
  cartQuantities: Record<number, number>;
  onAddProduct: (product: RuntimeProductCatalogItem) => void;
  onRemoveProduct?: (product: RuntimeProductCatalogItem) => void;
  canRemoveProduct?: (product: RuntimeProductCatalogItem) => boolean;
}

export function ProductGrid({
  products,
  cartQuantities,
  onAddProduct,
  onRemoveProduct,
  canRemoveProduct
}: ProductGridProps): JSX.Element {
  if (products.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "#64748b" }}>
        No products in local cache for this outlet.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: 160, overflow: "auto" }}>
      {products.map((product) => (
        <ProductCard
          key={product.item_id}
          product={product}
          quantity={cartQuantities[product.item_id] ?? 0}
          onAdd={() => onAddProduct(product)}
          onRemove={onRemoveProduct ? () => onRemoveProduct(product) : undefined}
          canRemove={canRemoveProduct ? canRemoveProduct(product) : true}
        />
      ))}
    </div>
  );
}
