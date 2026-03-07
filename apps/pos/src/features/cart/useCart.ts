// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useMemo } from "react";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";
import { normalizeMoney, computeCartTotals, type CartTotals } from "../../shared/utils/money.js";

export type OrderServiceType = "TAKEAWAY" | "DINE_IN";

export type OrderLifecycleStatus = "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";

export interface ActiveOrderContextState {
  service_type: OrderServiceType;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  order_status: OrderLifecycleStatus;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

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
  activeOrderContext?: ActiveOrderContextState;
}

export interface UseCartReturn {
  cart: CartState;
  cartLines: CartLineState[];
  cartTotals: CartTotals;
  upsertCartLine: (product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLineState, "qty" | "discount_amount">>) => void;
  clearCart: () => void;
  setPaidAmount: (amount: number) => void;
  paidAmount: number;
  activeOrderContext: ActiveOrderContextState;
  setServiceType: (serviceType: OrderServiceType) => void;
  setActiveTableId: (tableId: number | null) => void;
  setOrderReservationId: (reservationId: number | null) => void;
  setGuestCount: (guestCount: number | null) => void;
  setOrderStatus: (status: OrderLifecycleStatus) => void;
  setOrderNotes: (notes: string | null) => void;
  hydrateOrder: (input: {
    cart: CartState;
    paidAmount: number;
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
    order_status: "OPEN",
    opened_at: nowIso(),
    closed_at: null,
    notes: null
  };
}

export function useCart({
  initialCart = {},
  paidAmount: initialPaidAmount = 0,
  activeOrderContext: initialOrderContext = createDefaultActiveOrderContext()
}: UseCartOptions = {}): UseCartReturn {
  const [cart, setCart] = React.useState<CartState>(initialCart);
  const [paidAmount, setPaidAmount] = React.useState<number>(initialPaidAmount);
  const [activeOrderContext, setActiveOrderContext] = React.useState<ActiveOrderContextState>(initialOrderContext);

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
    setActiveOrderContext(createDefaultActiveOrderContext());
  }, []);

  const setServiceType = useCallback((serviceType: OrderServiceType) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      service_type: serviceType,
      table_id: serviceType === "TAKEAWAY" ? null : previous.table_id,
      reservation_id: serviceType === "TAKEAWAY" ? null : previous.reservation_id,
      guest_count: serviceType === "TAKEAWAY" ? null : previous.guest_count
    }));
  }, []);

  const setActiveTableId = useCallback((tableId: number | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      service_type: tableId ? "DINE_IN" : previous.service_type,
      table_id: tableId
    }));
  }, []);

  const setOrderReservationId = useCallback((reservationId: number | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      reservation_id: reservationId,
      service_type: reservationId ? "DINE_IN" : previous.service_type
    }));
  }, []);

  const setGuestCount = useCallback((guestCount: number | null) => {
    setActiveOrderContext((previous) => ({
      ...previous,
      guest_count: guestCount
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
      notes
    }));
  }, []);

  const hydrateOrder = useCallback((input: {
    cart: CartState;
    paidAmount: number;
    activeOrderContext: ActiveOrderContextState;
  }) => {
    setCart(input.cart);
    setPaidAmount(input.paidAmount);
    setActiveOrderContext(input.activeOrderContext);
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
    paidAmount,
    activeOrderContext,
    setServiceType,
    setActiveTableId,
    setOrderReservationId,
    setGuestCount,
    setOrderStatus,
    setOrderNotes,
    hydrateOrder
  };
}
