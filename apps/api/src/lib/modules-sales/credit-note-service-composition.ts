// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Service Composition
 * 
 * Wires together the credit note service dependencies:
 * - ApiSalesDbExecutor: database access adapter
 * - ApiAccessScopeChecker: authorization adapter  
 * - ApiCreditNotePostingHook: journal posting adapter using sales-posting.ts
 * 
 * This composition creates a fully wired CreditNoteService that supports
 * atomic journal posting within the credit note transaction.
 */

import { createApiSalesDb } from "./sales-db.js";
import { getAccessScopeChecker } from "./access-scope-checker.js";
import { ApiCreditNotePostingHook } from "./credit-note-posting-hook.js";
import { createCreditNoteService, type CreditNoteService } from "@jurnapod/modules-sales";

/**
 * Create a fully wired credit note service with journal posting support.
 * 
 * This composes:
 * - ApiSalesDb: database access with transaction support
 * - ApiAccessScopeChecker: authorization checks
 * - ApiCreditNotePostingHook: posts journal entries atomically within credit note tx
 */
export function createComposedCreditNoteService(): CreditNoteService {
  const db = createApiSalesDb();
  const accessScopeChecker = getAccessScopeChecker();
  const postingHook = new ApiCreditNotePostingHook();

  return createCreditNoteService({
    db,
    accessScopeChecker,
    postingHook
  });
}

// Singleton instance for consistent reuse across the API
let _composedCreditNoteService: CreditNoteService | null = null;

export function getComposedCreditNoteService(): CreditNoteService {
  if (!_composedCreditNoteService) {
    _composedCreditNoteService = createComposedCreditNoteService();
  }
  return _composedCreditNoteService;
}