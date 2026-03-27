// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Input } from "../../shared/components/index.js";
import { formatMoney } from "../../shared/utils/money.js";

export interface CartLineData {
  product: {
    item_id: number;
    variant_id?: number;
    name: string;
    variant_name?: string | null;
    price_snapshot: number;
    barcode?: string | null;
  };
  qty: number;
  kitchen_sent_qty: number;
  discount_amount: number;
}

export interface CartLineProps {
  line: CartLineData;
  onQuantityChange: (qty: number) => void;
  onDiscountChange: (discount: number) => void;
}

export function CartLine({ line, onQuantityChange, onDiscountChange }: CartLineProps): JSX.Element {
  const hasCommittedQty = line.kitchen_sent_qty > 0;
  const hasVariant = Boolean(line.product.variant_id && line.product.variant_name);
  const lineTotal = line.qty * line.product.price_snapshot - line.discount_amount;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{line.product.name}</div>
          {hasVariant && (
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {line.product.variant_name}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#059669", fontWeight: 600, marginTop: 2 }}>
            {formatMoney(line.product.price_snapshot)}
            {hasVariant && (
              <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 4 }}>
                (variant)
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>
          {formatMoney(lineTotal)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Input
          type="number"
          value={line.qty}
          onChange={(val) => onQuantityChange(Number(val) || 0)}
          inputMode="numeric"
          min={line.kitchen_sent_qty}
        />
        <Input
          type="number"
          value={line.discount_amount}
          onChange={(val) => onDiscountChange(Number(val) || 0)}
          inputMode="numeric"
        />
      </div>
      {hasCommittedQty ? (
        <div style={{ fontSize: 11, color: "#9a3412", fontWeight: 600 }}>
          Min qty: {line.kitchen_sent_qty} (sent to kitchen)
        </div>
      ) : null}
    </div>
  );
}
