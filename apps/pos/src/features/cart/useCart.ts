// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useMemo } from "react";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";
import { normalizeMoney, computeCartTotals, type CartTotals, type PaymentEntry } from "../../shared/utils/money.js";

export type OrderServiceType = "TAKEAWAY" | "DINE_IN";

export type OrderLifecycleStatus = "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";

export interface ActiveOrderContextState {
  service_type: OrderServiceType;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  kitchen_sent: boolean;  // Renamed from is_finalized
  order_status: OrderLifecycleStatus;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  discount_percent: number;
  discount_fixed: number;
  discount_code: string | null;
}

export interface CartLineState {
  product: RuntimeProductCatalogItem;
  qty: number;
  kitchen_sent_qty: number;  // Renamed from committed_qty
  discount_amount: number;
}

export type CartState = Record<number, CartLineState>;

function cartToList(cart: CartState): CartLineState[] {
  return Object.values(cart).filter((line) => line.qty > 0);
}

export interface UseCartOptions {
  initialCart?: CartState;
  payments?: PaymentEntry[];
  activeOrderContext?: ActiveOrderContextState;
}

export interface UseCartReturn {
  cart: CartState;
  cartLines: CartLineState[];
  cartTotals: CartTotals;
  upsertCartLine: (product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLineState, "qty" | "discount_amount">>) => void;
  clearCart: () => void;
  setPayments: (payments: PaymentEntry[]) => void;
  payments: PaymentEntry[];
  activeOrderContext: ActiveOrderContextState;
  setServiceType: (serviceType: OrderServiceType) => void;
  setActiveTableId: (tableId: number | null) => void;
  setOrderReservationId: (reservationId: number | null) => void;
  setGuestCount: (guestCount: number | null) => void;
  setOrderStatus: (status: OrderLifecycleStatus) => void;
  setOrderNotes: (notes: string | null) => void;
  setOrderFinalized: (isFinalized: boolean) => void;
  applyPercentDiscount: (percent: number) => void;
  applyFixedDiscount: (amount: number) => void;
  applyDiscountCode: (code: string) => void;
  clearTransactionDiscounts: () => void;
  hydrateOrder: (input: {
    cart: CartState;
    payments: PaymentEntry[];
    activeOrderContext: ActiveOrderContextState;
  }) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultActiveOrderContext(): ActiveOrderContextState {
  return {
    service_type: "TAKEAWAY",
    table_id: null,
    reservation_id: null,
    guest_count: null,
    kitchen_sent: false,  // Renamed from is_finalized
    order_status: "OPEN",
    opened_at: nowIso(),
    closed_at: null,
    notes: null,
    discount_percent: 0,
    discount_fixed: 0,
    discount_code: null
  };
}

export function useCart({
  initialCart = {},
  payments: initialPayments = [],
  activeOrderContext: initialOrderContext = createDefaultActiveOrderContext()
}: UseCartOptions = {}): UseCartReturn {
  const [cart, setCart] = React.useState<CartState>(initialCart);
  const [payments, setPayments] = React.useState<PaymentEntry[]>(initialPayments);
  const [activeOrderContext, setActiveOrderContext] = React.useState<ActiveOrderContextState>(initialOrderContext);

  const upsertCartLine = useCallback(
    (product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLineState, "qty" | "discount_amount">>) => {
      setCart((previous) => {
        const existing = previous[product.item_id] ?? {
          product,
          qty: 1,
          kitchen_sent_qty: 0,  // Renamed from committed_qty
          discount_amount: 0
        };

        const minQty = existing.kitchen_sent_qty;  // Renamed from committed_qty
        const nextQty = Math.max(minQty, patch.qty ?? existing.qty);
        const rawDiscount = patch.discount_amount ?? existing.discount_amount;
        const maxDiscount = normalizeMoney(nextQty * product.price_snapshot);
        const nextDiscount = Math.max(0, Math.min(normalizeMoney(rawDiscount), maxDiscount));

        if (nextQty === 0 && minQty === 0) {
          const next = { ...previous };
          delete next[product.item_id];
          return next;
        }

        return {
          ...previous,
          [product.item_id]: {
            product,
            qty: nextQty,
            kitchen_sent_qty: existing.kitchen_sent_qty,  // Renamed from committed_qty
            discount_amount: nextDiscount
          }
        };
      });
      setActiveOrderContext((previous) => ({
        ...previous,
        kitchen_sent: false  // Renamed from is_finalized
      }));
    },
    []
  );

  const clearCart = useCallback(() => {
    setCart({});
    setPayments([]);
    setActiveOrderContext(createDefaultActiveOrderContext());
  }, []);

  const setServiceType = useCallback((serviceType: OrderServiceType) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      service_type: serviceType,
      table_id: serviceType === "TAKEAWAY" ? null : previous.table_id,
      reservation_id: serviceType === "TAKEAWAY" ? null : previous.reservation_id,
      guest_count: serviceType === "TAKEAWAY" ? null : previous.guest_count,
      kitchen_sent: false  // Renamed from is_finalized
    }));
  }, []);

  const setActiveTableId = useCallback((tableId: number | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      service_type: tableId ? "DINE_IN" : previous.service_type,
      table_id: tableId,
      kitchen_sent: false  // Renamed from is_finalized
    }));
  }, []);

  const setOrderReservationId = useCallback((reservationId: number | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      reservation_id: reservationId,
      service_type: reservationId ? "DINE_IN" : previous.service_type,
      kitchen_sent: false  // Renamed from is_finalized
    }));
  }, []);

  const setGuestCount = useCallback((guestCount: number | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      guest_count: guestCount,
      kitchen_sent: false  // Renamed from is_finalized
    }));
  }, []);

  const setOrderStatus = useCallback((status: OrderLifecycleStatus) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      order_status: status,
      closed_at: status === "COMPLETED" || status === "CANCELLED" ? nowIso() : previous.closed_at
    }));
  }, []);

  const setOrderNotes = useCallback((notes: string | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      notes,
      kitchen_sent: false  // Renamed from is_finalized
    }));
  }, []);

  const setOrderFinalized = useCallback((isFinalized: boolean) => {
    if (isFinalized) {
      setCart((previous) => {
        const next: CartState = {};
        for (const [itemId, line] of Object.entries(previous)) {
          next[Number(itemId)] = {
            ...line,
            kitchen_sent_qty: line.qty  // Renamed from committed_qty
          };
        }
        return next;
      });
    }
    setActiveOrderContext((previous) => ({
      ...previous,
      kitchen_sent: isFinalized  // Renamed from is_finalized
    }));
  }, []);

  const hydrateOrder = useCallback((input: {
    cart: CartState;
    payments: PaymentEntry[];
    activeOrderContext: ActiveOrderContextState;
  }) => {
    setCart(input.cart);
    setPayments(input.payments);
    setActiveOrderContext(input.activeOrderContext);
  }, []);

  const applyPercentDiscount = useCallback((percent: number) => {
    const validPercent = Math.max(0, Math.min(100, percent));
    setActiveOrderContext((previous) => ({
      ...previous,
      discount_percent: validPercent,
      discount_code: null,
      kitchen_sent: false
    }));
  }, []);

  const applyFixedDiscount = useCallback((amount: number) => {
    const validAmount = Math.max(0, amount);
    setActiveOrderContext((previous) => ({
      ...previous,
      discount_fixed: validAmount,
      discount_code: null,
      kitchen_sent: false
    }));
  }, []);

  const applyDiscountCode = useCallback((code: string) => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return;
    setActiveOrderContext((previous) => ({
      ...previous,
      discount_code: trimmedCode,
      kitchen_sent: false
    }));
  }, []);

  const clearTransactionDiscounts = useCallback(() => {
    setActiveOrderContext((previous) => ({
      ...previous,
      discount_percent: 0,
      discount_fixed: 0,
      discount_code: null,
      kitchen_sent: false
    }));
  }, []);

  const transactionDiscounts = useMemo(() => ({
    discount_percent: activeOrderContext.discount_percent,
    discount_fixed: activeOrderContext.discount_fixed,
    discount_code: activeOrderContext.discount_code
  }), [activeOrderContext.discount_percent, activeOrderContext.discount_fixed, activeOrderContext.discount_code]);

  const cartLines = useMemo(() => cartToList(cart), [cart]);
  const cartTotals = useMemo(() => computeCartTotals(cartLines, payments, transactionDiscounts), [cartLines, payments, transactionDiscounts]);

  return {
    cart,
    cartLines,
    cartTotals,
    upsertCartLine,
    clearCart,
    setPayments,
    payments,
    activeOrderContext,
    setServiceType,
    setActiveTableId,
    setOrderReservationId,
    setGuestCount,
    setOrderStatus,
    setOrderNotes,
    setOrderFinalized,
    applyPercentDiscount,
    applyFixedDiscount,
    applyDiscountCode,
    clearTransactionDiscounts,
    hydrateOrder
  };
}
