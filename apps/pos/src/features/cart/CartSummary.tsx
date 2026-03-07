// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import type { CartTotals } from "../../shared/utils/money.js";
import { formatMoney } from "../../shared/utils/money.js";

export interface CartSummaryProps {
  totals: CartTotals;
}

export function CartSummary({ totals }: CartSummaryProps): JSX.Element {
  return (
    <div style={{ marginTop: 10, fontSize: 13, color: "#334155", display: "grid", gap: 4 }}>
      <div>Subtotal: {formatMoney(totals.subtotal)}</div>
      <div>Discount: {formatMoney(totals.discount_total)}</div>
      <div>Grand Total: {formatMoney(totals.grand_total)}</div>
      <div>Paid: {formatMoney(totals.paid_total)}</div>
      <div>Change: {formatMoney(totals.change_total)}</div>
    </div>
  );
}
