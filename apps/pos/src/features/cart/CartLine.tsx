// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Input } from "../../shared/components/index.js";

export interface CartLineData {
  product: {
    item_id: number;
    name: string;
    price_snapshot: number;
  };
  qty: number;
  kitchen_sent_qty: number;  // Renamed from committed_qty
  discount_amount: number;
}

export interface CartLineProps {
  line: CartLineData;
  onQuantityChange: (qty: number) => void;
  onDiscountChange: (discount: number) => void;
}

export function CartLine({ line, onQuantityChange, onDiscountChange }: CartLineProps): JSX.Element {
  const hasCommittedQty = line.kitchen_sent_qty > 0;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{line.product.name}</div>
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
