// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonItem, IonList, IonText } from "@ionic/react";
import { ProductCard } from "./ProductCard.js";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";

export interface ProductGridProps {
  products: RuntimeProductCatalogItem[];
  cartQuantities: Record<number, number>;
  onAddProduct: (product: RuntimeProductCatalogItem) => void;
  onRemoveProduct?: (product: RuntimeProductCatalogItem) => void;
  canRemoveProduct?: (product: RuntimeProductCatalogItem) => boolean;
  onVariantSelect?: (product: RuntimeProductCatalogItem) => void;
}

export function ProductGrid({
  products,
  cartQuantities,
  onAddProduct,
  onRemoveProduct,
  canRemoveProduct,
  onVariantSelect
}: ProductGridProps): JSX.Element {
  if (products.length === 0) {
    return (
      <IonItem lines="none">
        <IonText color="medium">No products in local cache for this outlet.</IonText>
      </IonItem>
    );
  }

  return (
    <IonList style={{ marginTop: 12, maxHeight: 320, overflow: "auto" }}>
      {products.map((product) => (
        <ProductCard
          key={product.item_id}
          product={product}
          quantity={cartQuantities[product.item_id] ?? 0}
          onAdd={() => onAddProduct(product)}
          onRemove={onRemoveProduct ? () => onRemoveProduct(product) : undefined}
          canRemove={canRemoveProduct ? canRemoveProduct(product) : true}
          onVariantSelect={onVariantSelect ? () => onVariantSelect(product) : undefined}
        />
      ))}
    </IonList>
  );
}
