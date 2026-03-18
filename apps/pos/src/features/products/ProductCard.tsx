// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonBadge, IonItem, IonLabel } from "@ionic/react";
import { Button } from "../../shared/components/index.js";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";
import { formatMoney } from "../../shared/utils/money.js";

export interface ProductCardProps {
  product: RuntimeProductCatalogItem;
  quantity: number;
  onAdd: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
  onVariantSelect?: () => void;
}

export function ProductCard({
  product,
  quantity,
  onAdd,
  onRemove,
  canRemove = true,
  onVariantSelect
}: ProductCardProps): JSX.Element {
  const selectorSuffix = (product.sku ?? String(product.item_id)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const hasVariants = product.has_variants === true;

  const handleClick = () => {
    if (hasVariants && onVariantSelect) {
      onVariantSelect();
    } else {
      onAdd();
    }
  };

  return (
    <IonItem lines="full">
      <IonLabel>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {product.name}
          {hasVariants && (
            <IonBadge 
              color="tertiary" 
              style={{ 
                marginLeft: 8, 
                fontSize: 10,
                padding: "2px 6px",
                verticalAlign: "middle"
              }}
            >
              Variants
            </IonBadge>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {(product.sku ?? "NO-SKU")} - {formatMoney(product.price_snapshot)}
        </div>
      </IonLabel>
      <div slot="end" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {quantity > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {onRemove && (
              <Button
                id={`product-remove-${selectorSuffix}`}
                name={`productRemove-${selectorSuffix}`}
                size="small"
                variant="secondary"
                onClick={onRemove}
                disabled={!canRemove}
                style={{ minWidth: "32px" }}
              >
                -
              </Button>
            )}
            <IonBadge color="primary">{quantity}</IonBadge>
            <Button
              id={`product-add-${selectorSuffix}`}
              name={`productAdd-${selectorSuffix}`}
              size="small"
              variant="primary"
              onClick={handleClick}
              style={{ minWidth: "32px" }}
            >
              {hasVariants ? "⋮" : "+"}
            </Button>
          </div>
        ) : (
          <Button
            id={`product-add-${selectorSuffix}`}
            name={`productAdd-${selectorSuffix}`}
            size="small"
            variant="primary"
            onClick={handleClick}
          >
            {hasVariants ? "Select" : "Add"}
          </Button>
        )}
      </div>
    </IonItem>
  );
}
