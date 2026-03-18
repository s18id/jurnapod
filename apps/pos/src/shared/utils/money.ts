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
  product: { item_id: number; variant_id?: number; price_snapshot: number };
  qty: number;
  discount_amount: number;
}

export interface PaymentEntry {
  method: string;
  amount: number;
}

export interface CartTotals {
  subtotal: number;
  discount_total: number;
  discount_percent: number;
  discount_fixed: number;
  discount_code: string | null;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_total: number;
}

export interface TransactionDiscounts {
  discount_percent: number;
  discount_fixed: number;
  discount_code: string | null;
}

export function computeCartTotals(
  lines: CartLine[],
  payments: PaymentEntry[],
  transactionDiscounts: TransactionDiscounts = { discount_percent: 0, discount_fixed: 0, discount_code: null }
): CartTotals {
  const subtotal = normalizeMoney(
    lines.reduce((sum, line) => sum + line.qty * line.product.price_snapshot, 0)
  );
  const lineDiscountTotal = normalizeMoney(
    lines.reduce((sum, line) => sum + line.discount_amount, 0)
  );
  const afterLineDiscounts = normalizeMoney(subtotal - lineDiscountTotal);

  const percentDiscount = normalizeMoney(
    afterLineDiscounts * (transactionDiscounts.discount_percent / 100)
  );
  const afterPercent = normalizeMoney(afterLineDiscounts - percentDiscount);

  const fixedDiscount = normalizeMoney(
    Math.min(transactionDiscounts.discount_fixed, afterPercent)
  );

  const totalDiscount = normalizeMoney(lineDiscountTotal + percentDiscount + fixedDiscount);
  const grandTotal = normalizeMoney(Math.max(0, subtotal - totalDiscount));
  
  const paidTotal = normalizeMoney(
    payments.reduce((sum, p) => sum + p.amount, 0)
  );
  const changeTotal = normalizeMoney(paidTotal - grandTotal);

  return {
    subtotal,
    discount_total: totalDiscount,
    discount_percent: transactionDiscounts.discount_percent,
    discount_fixed: transactionDiscounts.discount_fixed,
    discount_code: transactionDiscounts.discount_code,
    tax_total: 0,
    grand_total: grandTotal,
    paid_total: paidTotal,
    change_total: changeTotal
  };
}
