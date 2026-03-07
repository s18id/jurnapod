// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { CartLine, type CartLineData } from "./CartLine.js";

export interface CartListProps {
  lines: CartLineData[];
  onUpdateLine: (itemId: number, patch: { qty?: number; discount_amount?: number }) => void;
}

export function CartList({ lines, onUpdateLine }: CartListProps): JSX.Element {
  if (lines.length === 0) {
    return <div style={{ fontSize: 13, color: "#64748b" }}>Cart is empty.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {lines.map((line) => (
        <CartLine
          key={line.product.item_id}
          line={line}
          onQuantityChange={(qty) => onUpdateLine(line.product.item_id, { qty })}
          onDiscountChange={(discount) => onUpdateLine(line.product.item_id, { discount_amount: discount })}
        />
      ))}
    </div>
  );
}
