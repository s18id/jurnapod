// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Card, Button } from "../../shared/components/index.js";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";
import { formatMoney } from "../../shared/utils/money.js";

export interface ProductCardProps {
  product: RuntimeProductCatalogItem;
  quantity: number;
  onAdd: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
}

export function ProductCard({ 
  product, 
  quantity, 
  onAdd, 
  onRemove, 
  canRemove = true 
}: ProductCardProps): JSX.Element {
  const selectorSuffix = (product.sku ?? String(product.item_id)).toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <Card padding="small">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{product.name}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {(product.sku ?? "NO-SKU")} - {formatMoney(product.price_snapshot)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {quantity > 0 ? (
            // Show +/- controls when item is in cart
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {onRemove && (
                <Button 
                  id={`product-remove-${selectorSuffix}`}
                  name={`productRemove-${selectorSuffix}`}
                  size="small" 
                  variant="secondary" 
                  onClick={onRemove}
                  disabled={!canRemove}
                  style={{ minWidth: "32px", padding: "6px" }}
                >
                  −
                </Button>
              )}
              <span
                style={{
                  background: "#0f766e",
                  color: "#ffffff",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 13,
                  fontWeight: 700,
                  minWidth: "24px",
                  textAlign: "center"
                }}
              >
                {quantity}
              </span>
              <Button 
                id={`product-add-${selectorSuffix}`}
                name={`productAdd-${selectorSuffix}`}
                size="small" 
                variant="primary" 
                onClick={onAdd}
                style={{ minWidth: "32px", padding: "6px" }}
              >
                +
              </Button>
            </div>
          ) : (
            // Show simple Add button when not in cart
            <Button
              id={`product-add-${selectorSuffix}`}
              name={`productAdd-${selectorSuffix}`}
              size="small"
              variant="primary"
              onClick={onAdd}
            >
              Add
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
