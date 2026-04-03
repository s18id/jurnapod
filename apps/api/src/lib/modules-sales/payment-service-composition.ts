// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Service Composition
 * 
 * Wires together the payment service dependencies:
 * - ApiSalesDbExecutor: database access adapter
 * - ApiAccessScopeChecker: authorization adapter  
 * - ApiPaymentPostingHook: journal posting adapter using sales-posting.ts
 * 
 * This composition creates a fully wired PaymentService that supports
 * atomic journal posting within the payment transaction.
 */

import { createApiSalesDb } from "./sales-db.js";
import { getAccessScopeChecker } from "./access-scope-checker.js";
import { ApiPaymentPostingHook } from "./payment-posting-hook.js";
import { createPaymentService, type PaymentService } from "@jurnapod/modules-sales";

/**
 * Create a fully wired payment service with journal posting support.
 * 
 * This composes:
 * - ApiSalesDb: database access with transaction support
 * - ApiAccessScopeChecker: authorization checks
 * - ApiPaymentPostingHook: posts journal entries atomically within payment tx
 */
export function createComposedPaymentService(): PaymentService {
  const db = createApiSalesDb();
  const accessScopeChecker = getAccessScopeChecker();
  const postingHook = new ApiPaymentPostingHook();

  return createPaymentService({
    db,
    accessScopeChecker,
    postingHook
  });
}

// Singleton instance for consistent reuse across the API
let _composedPaymentService: PaymentService | null = null;

export function getComposedPaymentService(): PaymentService {
  if (!_composedPaymentService) {
    _composedPaymentService = createComposedPaymentService();
  }
  return _composedPaymentService;
}
