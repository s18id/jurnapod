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
}

export function ProductCard({ product, quantity, onAdd }: ProductCardProps): JSX.Element {
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
          {quantity > 0 && (
            <span
              style={{
                background: "#0f766e",
                color: "#ffffff",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 12,
                fontWeight: 700
              }}
            >
              {quantity}
            </span>
          )}
          <Button size="small" variant="primary" onClick={onAdd}>
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
