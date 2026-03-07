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
  discount_amount: number;
}

export interface CartLineProps {
  line: CartLineData;
  onQuantityChange: (qty: number) => void;
  onDiscountChange: (discount: number) => void;
}

export function CartLine({ line, onQuantityChange, onDiscountChange }: CartLineProps): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{line.product.name}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <Input
          type="number"
          value={line.qty}
          onChange={(val) => onQuantityChange(Number(val) || 0)}
          inputMode="numeric"
        />
        <Input
          type="number"
          value={line.discount_amount}
          onChange={(val) => onDiscountChange(Number(val) || 0)}
          inputMode="numeric"
        />
      </div>
    </div>
  );
}
