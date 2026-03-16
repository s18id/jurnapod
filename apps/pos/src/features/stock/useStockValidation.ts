// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useState } from "react";
import { type PosOfflineDb, posDb } from "@jurnapod/offline-db/dexie";
import type { CheckStockResult } from "@jurnapod/offline-db/dexie";
import {
  checkStockAvailability,
  validateStockForItems,
  type CheckStockAvailabilityInput,
  type ValidateStockForItemsInput
} from "../../services/stock.js";

export interface UseStockValidationOptions {
  companyId: number;
  outletId: number;
}

export interface StockValidationError {
  itemId: number;
  itemName: string;
  requestedQty: number;
  availableQty: number;
}

export interface UseStockValidationReturn {
  checkStock: (itemId: number, quantity: number) => Promise<CheckStockResult | null>;
  validateItems: (items: Array<{ itemId: number; quantity: number }>) => Promise<boolean>;
  validationErrors: StockValidationError[];
  isValidating: boolean;
  clearErrors: () => void;
}

export function useStockValidation(options: UseStockValidationOptions): UseStockValidationReturn {
  const { companyId, outletId } = options;
  const [validationErrors, setValidationErrors] = useState<StockValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const checkStock = useCallback(
    async (itemId: number, quantity: number): Promise<CheckStockResult | null> => {
      try {
        const result = await checkStockAvailability({
          itemId,
          quantity,
          companyId,
          outletId
        });
        return {
          item_id: itemId,
          available: result.available,
          quantity_on_hand: result.quantityOnHand,
          quantity_reserved: result.quantityReserved,
          quantity_available: result.quantityAvailable,
          track_stock: result.trackStock
        };
      } catch {
        return null;
      }
    },
    [companyId, outletId]
  );

  const validateItems = useCallback(
    async (items: Array<{ itemId: number; quantity: number }>): Promise<boolean> => {
      setIsValidating(true);
      setValidationErrors([]);

      try {
        await validateStockForItems({
          items,
          companyId,
          outletId
        });
        return true;
      } catch (error) {
        if (error && typeof error === "object" && "details" in error) {
          const stockError = error as { details: StockValidationError[] };
          setValidationErrors(stockError.details);
        } else if (error && typeof error === "object" && "itemId" in error) {
          const singleError = error as StockValidationError;
          setValidationErrors([singleError]);
        }
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    [companyId, outletId]
  );

  const clearErrors = useCallback(() => {
    setValidationErrors([]);
  }, []);

  return {
    checkStock,
    validateItems,
    validationErrors,
    isValidating,
    clearErrors
  };
}
