// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useMemo, useRef, useState } from "react";
import { CASHIER_USER_ID } from "../../shared/utils/constants.js";
import { createSaleDraft, completeSale } from "../../offline/sales.js";
import type { RuntimeOutletScope } from "../../services/runtime-service.js";
import type { ActiveOrderContextState } from "../cart/useCart.js";
import type { CartTotals, CartLine } from "../../shared/utils/money.js";

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
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  paymentMethods: string[];
  paymentMethodAllowed: boolean;
  canAttemptSaleCompletion: (cartLines: CartLine[], cartTotals: CartTotals) => boolean;
  canCompleteSale: (cartLines: CartLine[], cartTotals: CartTotals) => boolean;
  completeInFlight: boolean;
  lastCompleteMessage: string | null;
  runCompleteSale: (
    cartLines: CartLine[],
    cartTotals: CartTotals,
      options?: {
      setPaymentMethod?: (method: string) => void;
      onAfterSaleCommit?: () => Promise<void> | void;
      setPaidAmount?: (amount: number) => void;
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
  const [paymentMethod, setPaymentMethod] = useState<string>(initialPaymentMethods[0]);
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

  React.useEffect(() => {
    if (
      paymentMethods.length > 0 &&
      !runtime.isPaymentMethodAllowed(paymentMethod, paymentMethods)
    ) {
      const nextMethod = runtime.resolvePaymentMethod(paymentMethod, paymentMethods);
      setPaymentMethod(nextMethod);
      setLastCompleteMessage(
        `Payment method ${paymentMethod} is no longer allowed for this outlet. Switched to ${nextMethod}.`
      );
    }
  }, [
    paymentMethod,
    paymentMethods,
    runtime.isPaymentMethodAllowed,
    runtime.resolvePaymentMethod
  ]);

  const lockSaleCompletion = useCallback((flowId: string): boolean => {
    if (inFlightFlowIdsRef.current.has(flowId)) {
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

  const paymentMethodAllowed = runtime.isPaymentMethodAllowed(paymentMethod, paymentMethods);

  const canAttemptSaleCompletion = useCallback((cartLines: CartLine[], cartTotals: CartTotals): boolean => {
    return cartLines.length > 0 && cartTotals.paid_total >= cartTotals.grand_total;
  }, []);

  const canCompleteSale = useCallback((cartLines: CartLine[], cartTotals: CartTotals): boolean => {
    return canAttemptSaleCompletion(cartLines, cartTotals) && paymentMethodAllowed;
  }, [canAttemptSaleCompletion, paymentMethodAllowed]);

  const runCompleteSale = useCallback(
    async (
      cartLines: CartLine[],
      cartTotals: CartTotals,
      options?: {
        setPaymentMethod?: (method: string) => void;
        onAfterSaleCommit?: () => Promise<void> | void;
        setPaidAmount?: (amount: number) => void;
        setCurrentFlowId?: (id: string) => void;
        onAfterComplete?: () => Promise<void> | void;
      }
    ) => {
      if (!cartLines.length || cartTotals.paid_total < cartTotals.grand_total) {
        return;
      }

      if (!runtime.isPaymentMethodAllowed(paymentMethod, paymentMethods)) {
        const nextPaymentMethod = runtime.resolvePaymentMethod(paymentMethod, paymentMethods);
        options?.setPaymentMethod?.(nextPaymentMethod);
        setLastCompleteMessage(
          `Payment method ${paymentMethod} is no longer allowed for this outlet. Switched to ${nextPaymentMethod}.`
        );
        return;
      }

      const flowId = crypto.randomUUID();
      if (!lockSaleCompletion(flowId)) {
        return;
      }

      setLastCompleteMessage(null);
      let saleResult: { client_tx_id: string } | null = null;

      // Phase A: Authoritative sale write (must succeed or fail atomically)
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
            qty: line.qty,
            discount_amount: line.discount_amount
          })),
          payments: [
            {
              method: paymentMethod,
              amount: cartTotals.paid_total
            }
          ],
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

      // Phase B: UI/session cleanup (non-authoritative, must not mask success)
      try {
        await options?.onAfterComplete?.();
        await options?.onAfterSaleCommit?.();
        options?.setPaidAmount?.(0);
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
      paymentMethod,
      paymentMethods,
      requestPush,
      scope,
      runtime,
      lockSaleCompletion,
      unlockSaleCompletion
    ]
  );

  return {
    paymentMethod,
    setPaymentMethod,
    paymentMethods,
    paymentMethodAllowed,
    canAttemptSaleCompletion,
    canCompleteSale,
    completeInFlight,
    lastCompleteMessage,
    runCompleteSale
  };
}
