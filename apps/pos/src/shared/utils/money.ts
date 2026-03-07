// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Money utility functions for currency calculations and formatting.
 * All money values are in IDR (Indonesian Rupiah).
 */

export function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

export interface CartLine {
  product: { price_snapshot: number };
  qty: number;
  discount_amount: number;
}

export interface CartTotals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_total: number;
}

export function computeCartTotals(
  lines: CartLine[],
  paidAmount: number
): CartTotals {
  const subtotal = normalizeMoney(
    lines.reduce((sum, line) => sum + line.qty * line.product.price_snapshot, 0)
  );
  const discountTotal = normalizeMoney(
    lines.reduce((sum, line) => sum + line.discount_amount, 0)
  );
  const grandTotal = normalizeMoney(subtotal - discountTotal);
  const paidTotal = normalizeMoney(paidAmount);
  const changeTotal = normalizeMoney(paidTotal - grandTotal);

  return {
    subtotal,
    discount_total: discountTotal,
    tax_total: 0,
    grand_total: grandTotal,
    paid_total: paidTotal,
    change_total: changeTotal
  };
}
