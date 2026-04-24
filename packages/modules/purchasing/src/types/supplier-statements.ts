// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier Statement types for purchasing module.
 */

// =============================================================================
// Constants
// =============================================================================

export const SUPPLIER_STATEMENT_STATUS = {
  PENDING: 1,
  RECONCILED: 2,
} as const;

export const SUPPLIER_STATEMENT_STATUS_LABEL: Record<number, keyof typeof SUPPLIER_STATEMENT_STATUS> = {
  1: "PENDING",
  2: "RECONCILED",
};

export const SUPPLIER_STATEMENT_STATUS_VALUES = ["PENDING", "RECONCILED"] as const;

export const DEFAULT_VARIANCE_TOLERANCE = "1.0000";

// =============================================================================
// Error Types
// =============================================================================

export class SupplierStatementError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string
  ) {
    super(message);
    this.name = "SupplierStatementError";
  }
}

export class SupplierStatementNotFoundError extends SupplierStatementError {
  constructor(statementId: number) {
    super("SUPPLIER_STATEMENT_NOT_FOUND", `Supplier statement ${statementId} not found`);
  }
}

export class SupplierStatementSupplierNotOwnedError extends SupplierStatementError {
  constructor(supplierId: number, companyId: number) {
    super(
      "SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED",
      `Supplier ${supplierId} does not belong to company ${companyId}`
    );
  }
}

export class SupplierStatementSupplierNotActiveError extends SupplierStatementError {
  constructor(supplierId: number) {
    super(
      "SUPPLIER_STATEMENT_SUPPLIER_NOT_ACTIVE",
      `Supplier ${supplierId} is not active`
    );
  }
}

export class SupplierStatementAlreadyReconciledError extends SupplierStatementError {
  constructor(statementId: number) {
    super(
      "SUPPLIER_STATEMENT_ALREADY_RECONCILED",
      `Supplier statement ${statementId} is already reconciled`
    );
  }
}

export class SupplierStatementDuplicateError extends SupplierStatementError {
  constructor(supplierId: number, statementDate: string) {
    super(
      "SUPPLIER_STATEMENT_DUPLICATE",
      `A statement for supplier ${supplierId} already exists on ${statementDate}`
    );
  }
}

export class SupplierStatementCurrencyMismatchError extends SupplierStatementError {
  constructor(statementCurrency: string, supplierCurrency: string) {
    super(
      "SUPPLIER_STATEMENT_CURRENCY_MISMATCH",
      `Statement currency ${statementCurrency} does not match supplier currency ${supplierCurrency}`
    );
  }
}

export class SupplierStatementExchangeRateMissingError extends SupplierStatementError {
  constructor(currencyCode: string, onDate: string) {
    super(
      "SUPPLIER_STATEMENT_EXCHANGE_RATE_MISSING",
      `Missing exchange rate for currency ${currencyCode} on or before ${onDate}`
    );
  }
}

export class SupplierStatementInvalidToleranceError extends SupplierStatementError {
  constructor(tolerance: string) {
    super(
      "SUPPLIER_STATEMENT_INVALID_TOLERANCE",
      `Tolerance must be a positive decimal value, got: ${tolerance}`
    );
  }
}

// =============================================================================
// Domain Types
// =============================================================================

export interface SupplierStatement {
  id: number;
  companyId: number;
  supplierId: number;
  statementDate: string;
  closingBalance: string;
  currencyCode: string;
  status: number;
  reconciledAt: string | null;
  reconciledByUserId: number | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierStatementCreateInput {
  supplierId: number;
  statementDate: string;
  closingBalance: string;
  currencyCode: string;
}

export interface SupplierStatementListFilters {
  supplierId?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: number;
  limit?: number;
  offset?: number;
}

export interface SupplierStatementReconcileResult {
  statementId: number;
  supplierId: number;
  statementDate: string;
  statementBalance: string;
  subledgerBalance: string;
  variance: string;
  varianceWithinTolerance: boolean;
  tolerance: string;
  currencyCode: string;
}

// =============================================================================
// Service Params
// =============================================================================

export interface CreateSupplierStatementParams {
  companyId: number;
  userId: number;
  input: SupplierStatementCreateInput;
}

export interface ListSupplierStatementsParams {
  companyId: number;
  filters: SupplierStatementListFilters;
}

export interface GetSupplierStatementParams {
  companyId: number;
  statementId: number;
}

export interface ReconcileSupplierStatementParams {
  companyId: number;
  statementId: number;
  tolerance?: string;
}

export interface MarkSupplierStatementReconciledParams {
  companyId: number;
  statementId: number;
  userId: number;
}
