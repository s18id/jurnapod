// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useMemo, useRef, useState } from "react";
import { CASHIER_USER_ID } from "../../shared/utils/constants.js";
import { createSaleDraft, completeSale } from "../../offline/sales.js";
import type { RuntimeOutletScope } from "../../services/runtime-service.js";
import type { ActiveOrderContextState } from "../cart/useCart.js";
import type { CartTotals, CartLine, PaymentEntry } from "../../shared/utils/money.js";

type SyncPushReason = "MANUAL_PUSH" | "AUTO_REFRESH" | "NETWORK_ONLINE" | "BACKGROUND_SYNC";

export interface UseCheckoutOptions {
  scope: RuntimeOutletScope;
  activeOrderContext: ActiveOrderContextState;
  initialPaymentMethods?: string[];
  requestPush?: (reason: SyncPushReason) => Promise<void>;
  runtime: {
    isPaymentMethodAllowed: (method: string, methods: readonly string[]) => boolean;
    resolvePaymentMethod: (method: string, methods: readonly string[]) => string;
  };
}

export interface UseCheckoutReturn {
  paymentMethods: string[];
  canAttemptSaleCompletion: (cartLines: CartLine[], cartTotals: CartTotals) => boolean;
  canCompleteSale: (cartLines: CartLine[], cartTotals: CartTotals) => boolean;
  completeInFlight: boolean;
  lastCompleteMessage: string | null;
  runCompleteSale: (
    cartLines: CartLine[],
    cartTotals: CartTotals,
    payments: PaymentEntry[],
    options?: {
      onAfterSaleCommit?: () => Promise<void> | void;
      setPayments?: (payments: PaymentEntry[]) => void;
      setCurrentFlowId?: (id: string) => void;
      onAfterComplete?: () => Promise<void> | void;
    }
  ) => Promise<void>;
}

function areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

export function useCheckout({
  scope,
  activeOrderContext,
  runtime,
  requestPush,
  initialPaymentMethods = ["CASH"]
}: UseCheckoutOptions): UseCheckoutReturn {
  const [paymentMethods, setPaymentMethods] = useState<string[]>(initialPaymentMethods);
  const [completeInFlight, setCompleteInFlight] = useState<boolean>(false);
  const [lastCompleteMessage, setLastCompleteMessage] = useState<string | null>(null);
  const inFlightFlowIdsRef = useRef<Set<string>>(new Set());

  const normalizedInitialMethods = useMemo(() => {
    const seen = new Set<string>();
    const normalizedMethods: string[] = [];
    for (const method of initialPaymentMethods) {
      const trimmed = method.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        normalizedMethods.push(trimmed);
      }
    }
    return normalizedMethods;
  }, [initialPaymentMethods]);

  React.useEffect(() => {
    setPaymentMethods((previous) =>
      areStringArraysEqual(previous, normalizedInitialMethods) ? previous : normalizedInitialMethods
    );
  }, [normalizedInitialMethods]);

  const lockSaleCompletion = useCallback((flowId: string): boolean => {
    if (inFlightFlowIdsRef.current.size > 0) {
      return false;
    }
    inFlightFlowIdsRef.current.add(flowId);
    setCompleteInFlight(true);
    return true;
  }, []);

  const unlockSaleCompletion = useCallback((flowId: string): void => {
    inFlightFlowIdsRef.current.delete(flowId);
    setCompleteInFlight(inFlightFlowIdsRef.current.size > 0);
  }, []);

  const canAttemptSaleCompletion = useCallback(
    (cartLines: CartLine[], cartTotals: CartTotals): boolean => {
      return cartLines.length > 0 && cartTotals.paid_total >= cartTotals.grand_total;
    },
    []
  );

  const canCompleteSale = useCallback(
    (cartLines: CartLine[], cartTotals: CartTotals): boolean => {
      return (
        canAttemptSaleCompletion(cartLines, cartTotals) &&
        paymentMethods.length > 0
      );
    },
    [canAttemptSaleCompletion, paymentMethods.length]
  );

  const runCompleteSale = useCallback(
    async (
      cartLines: CartLine[],
      cartTotals: CartTotals,
      payments: PaymentEntry[],
      options?: {
        onAfterSaleCommit?: () => Promise<void> | void;
        setPayments?: (payments: PaymentEntry[]) => void;
        setCurrentFlowId?: (id: string) => void;
        onAfterComplete?: () => Promise<void> | void;
      }
    ) => {
      if (!cartLines.length || cartTotals.paid_total < cartTotals.grand_total) {
        return;
      }

      if (payments.length === 0) {
        setLastCompleteMessage("Add at least one payment method before completing sale.");
        return;
      }

      const hasDisallowedPaymentMethod = payments.some(
        (payment) => !runtime.isPaymentMethodAllowed(payment.method, paymentMethods)
      );

      if (hasDisallowedPaymentMethod) {
        const correctedPayments = payments.map((payment) => {
          if (runtime.isPaymentMethodAllowed(payment.method, paymentMethods)) {
            return payment;
          }
          return {
            ...payment,
            method: runtime.resolvePaymentMethod(payment.method, paymentMethods)
          };
        });

        options?.setPayments?.(correctedPayments);
        setLastCompleteMessage(
          "One or more payment methods are no longer allowed for this outlet. Review updated methods, then complete sale again."
        );
        return;
      }

      const flowId = crypto.randomUUID();
      if (!lockSaleCompletion(flowId)) {
        return;
      }

      setLastCompleteMessage(null);
      let saleResult: { client_tx_id: string } | null = null;

      try {
        const draft = await createSaleDraft({
          company_id: scope.company_id,
          outlet_id: scope.outlet_id,
          cashier_user_id: CASHIER_USER_ID,
          service_type: activeOrderContext.service_type,
          table_id: activeOrderContext.table_id,
          reservation_id: activeOrderContext.reservation_id,
          guest_count: activeOrderContext.guest_count,
          order_status: activeOrderContext.order_status,
          notes: activeOrderContext.notes,
          opened_at: activeOrderContext.opened_at
        });

        saleResult = await completeSale({
          sale_id: draft.sale_id,
          items: cartLines.map((line) => ({
            item_id: line.product.item_id,
            variant_id: line.product.variant_id,
            qty: line.qty,
            discount_amount: line.discount_amount
          })),
          payments: payments,
          totals: cartTotals,
          service_type: activeOrderContext.service_type,
          table_id: activeOrderContext.table_id,
          reservation_id: activeOrderContext.reservation_id,
          guest_count: activeOrderContext.guest_count,
          order_status: "COMPLETED",
          opened_at: activeOrderContext.opened_at,
          closed_at: new Date().toISOString(),
          notes: activeOrderContext.notes
        });

        setLastCompleteMessage(`Sale completed offline (${saleResult.client_tx_id}). Outbox job queued.`);
        if (requestPush) {
          void requestPush("BACKGROUND_SYNC").catch(() => {});
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setLastCompleteMessage(`Failed to complete sale: ${message}`);
        unlockSaleCompletion(flowId);
        return;
      }

      try {
        await options?.onAfterComplete?.();
        await options?.onAfterSaleCommit?.();
        options?.setPayments?.([]);
        options?.setCurrentFlowId?.(crypto.randomUUID());
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Unknown error";
        setLastCompleteMessage(
          `Sale completed offline (${saleResult.client_tx_id}), but order cleanup needs attention: ${cleanupMessage}`
        );
      } finally {
        unlockSaleCompletion(flowId);
      }
    },
    [
      activeOrderContext,
      paymentMethods,
      requestPush,
      scope,
      runtime,
      lockSaleCompletion,
      unlockSaleCompletion
    ]
  );

  return {
    paymentMethods,
    canAttemptSaleCompletion,
    canCompleteSale,
    completeInFlight,
    lastCompleteMessage,
    runCompleteSale
  };
}
