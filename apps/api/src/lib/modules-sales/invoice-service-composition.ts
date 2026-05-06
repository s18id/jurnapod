// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Service Composition
 * 
 * Wires together the invoice service dependencies:
 * - ApiSalesDbExecutor: database access adapter
 * - ApiAccessScopeChecker: authorization adapter  
 * - ApiInvoicePostingHook: journal posting adapter using sales-posting.ts
 * 
 * This composition creates a fully wired InvoiceService that supports
 * atomic journal posting within the invoice transaction.
 */

import { createApiSalesDb } from "./sales-db.js";
import { getAccessScopeChecker } from "./access-scope-checker.js";
import { ApiInvoicePostingHook } from "./invoice-posting-hook.js";
import { createInvoiceService, type InvoiceService } from "@jurnapod/modules-sales";

/**
 * Create a fully wired invoice service with journal posting support.
 * 
 * This composes:
 * - ApiSalesDb: database access with transaction support
 * - ApiAccessScopeChecker: authorization checks
 * - ApiInvoicePostingHook: posts journal entries atomically within invoice tx
 */
export function createComposedInvoiceService(): InvoiceService {
  const db = createApiSalesDb();
  const accessScopeChecker = getAccessScopeChecker();
  const postingHook = new ApiInvoicePostingHook();

  return createInvoiceService({
    db,
    accessScopeChecker,
    postingHook
  });
}

// Singleton instance for consistent reuse across the API
let _composedInvoiceService: InvoiceService | null = null;

export function getComposedInvoiceService(): InvoiceService {
  if (!_composedInvoiceService) {
    _composedInvoiceService = createComposedInvoiceService();
  }
  return _composedInvoiceService;
}