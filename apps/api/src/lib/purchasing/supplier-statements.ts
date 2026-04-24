// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier Statements API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import {
  SupplierStatementService,
  toScaled,
  fromScaled4,
  SUPPLIER_STATEMENT_STATUS,
  DEFAULT_VARIANCE_TOLERANCE,
} from "@jurnapod/modules-purchasing";
import type {
  SupplierStatement,
  SupplierStatementCreateInput,
  SupplierStatementListFilters,
  SupplierStatementReconcileResult,
} from "@jurnapod/modules-purchasing";

// Re-export error classes and constants for use in routes
export {
  SupplierStatementError,
  SupplierStatementNotFoundError,
  SupplierStatementSupplierNotOwnedError,
  SupplierStatementSupplierNotActiveError,
  SupplierStatementAlreadyReconciledError,
  SupplierStatementDuplicateError,
  SupplierStatementCurrencyMismatchError,
  SupplierStatementExchangeRateMissingError,
  SupplierStatementInvalidToleranceError,
} from "@jurnapod/modules-purchasing";

// Re-export types for use in routes
export type {
  SupplierStatement,
  SupplierStatementCreateInput,
  SupplierStatementListFilters,
  SupplierStatementReconcileResult,
};

export { SUPPLIER_STATEMENT_STATUS, DEFAULT_VARIANCE_TOLERANCE };

export { toScaled, fromScaled4 };

export async function createSupplierStatement(
  companyId: number,
  userId: number,
  input: SupplierStatementCreateInput
): Promise<SupplierStatement> {
  const db = getDb();
  const service = new SupplierStatementService(db);
  return service.createSupplierStatement({ companyId, userId, input });
}

export async function listSupplierStatements(
  companyId: number,
  filters: SupplierStatementListFilters
): Promise<{ statements: SupplierStatement[]; total: number }> {
  const db = getDb();
  const service = new SupplierStatementService(db);
  return service.listSupplierStatements({ companyId, filters });
}

export async function getSupplierStatement(
  companyId: number,
  statementId: number
): Promise<SupplierStatement | null> {
  const db = getDb();
  const service = new SupplierStatementService(db);
  return service.getSupplierStatement({ companyId, statementId });
}

export async function reconcileSupplierStatement(
  companyId: number,
  statementId: number,
  tolerance?: string
): Promise<SupplierStatementReconcileResult> {
  const db = getDb();
  const service = new SupplierStatementService(db);
  return service.reconcileSupplierStatement({ companyId, statementId, tolerance });
}

export async function markSupplierStatementReconciled(
  companyId: number,
  statementId: number,
  userId: number
): Promise<SupplierStatement> {
  const db = getDb();
  const service = new SupplierStatementService(db);
  return service.markSupplierStatementReconciled({ companyId, statementId, userId });
}
