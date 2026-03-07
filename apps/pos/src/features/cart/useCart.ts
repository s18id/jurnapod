// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useMemo } from "react";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";
import { normalizeMoney, computeCartTotals, type CartTotals } from "../../shared/utils/money.js";

export interface CartLineState {
  product: RuntimeProductCatalogItem;
  qty: number;
  discount_amount: number;
}

export type CartState = Record<number, CartLineState>;

function cartToList(cart: CartState): CartLineState[] {
  return Object.values(cart).filter((line) => line.qty > 0);
}

export interface UseCartOptions {
  initialCart?: CartState;
  paidAmount?: number;
}

export interface UseCartReturn {
  cart: CartState;
  cartLines: CartLineState[];
  cartTotals: CartTotals;
  upsertCartLine: (product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLineState, "qty" | "discount_amount">>) => void;
  clearCart: () => void;
  setPaidAmount: (amount: number) => void;
  paidAmount: number;
}

export function useCart({ initialCart = {}, paidAmount: initialPaidAmount = 0 }: UseCartOptions = {}): UseCartReturn {
  const [cart, setCart] = React.useState<CartState>(initialCart);
  const [paidAmount, setPaidAmount] = React.useState<number>(initialPaidAmount);

  const upsertCartLine = useCallback(
    (product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLineState, "qty" | "discount_amount">>) => {
      setCart((previous) => {
        const existing = previous[product.item_id] ?? {
          product,
          qty: 1,
          discount_amount: 0
        };

        const nextQty = Math.max(0, patch.qty ?? existing.qty);
        const rawDiscount = patch.discount_amount ?? existing.discount_amount;
        const maxDiscount = normalizeMoney(nextQty * product.price_snapshot);
        const nextDiscount = Math.max(0, Math.min(normalizeMoney(rawDiscount), maxDiscount));

        if (nextQty === 0) {
          const next = { ...previous };
          delete next[product.item_id];
          return next;
        }

        return {
          ...previous,
          [product.item_id]: {
            product,
            qty: nextQty,
            discount_amount: nextDiscount
          }
        };
      });
    },
    []
  );

  const clearCart = useCallback(() => {
    setCart({});
    setPaidAmount(0);
  }, []);

  const cartLines = useMemo(() => cartToList(cart), [cart]);
  const cartTotals = useMemo(() => computeCartTotals(cartLines, paidAmount), [cartLines, paidAmount]);

  return {
    cart,
    cartLines,
    cartTotals,
    upsertCartLine,
    clearCart,
    setPaidAmount,
    paidAmount
  };
}
