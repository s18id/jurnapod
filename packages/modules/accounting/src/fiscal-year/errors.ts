// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fiscal Year Domain Errors
 * 
 * These errors are thrown by FiscalYearService to indicate domain-specific
 * failure conditions. They are exported from the package for use by API routes.
 */

export class FiscalYearNotFoundError extends Error {
  code = "FISCAL_YEAR_NOT_FOUND";
  constructor(message?: string) {
    super(message ?? "Fiscal year not found");
    this.name = "FiscalYearNotFoundError";
  }
}

export class FiscalYearCodeExistsError extends Error {
  code = "FISCAL_YEAR_CODE_EXISTS";
  constructor(message?: string) {
    super(message ?? "Fiscal year code already exists");
    this.name = "FiscalYearCodeExistsError";
  }
}

export class FiscalYearDateRangeError extends Error {
  code = "FISCAL_YEAR_DATE_RANGE";
  constructor(message?: string) {
    super(message ?? "Start date must be before end date");
    this.name = "FiscalYearDateRangeError";
  }
}

export class FiscalYearOverlapError extends Error {
  code = "FISCAL_YEAR_OVERLAP";
  constructor(message?: string) {
    super(message ?? "Fiscal years cannot overlap");
    this.name = "FiscalYearOverlapError";
  }
}

export class FiscalYearOpenConflictError extends Error {
  code = "FISCAL_YEAR_OPEN_CONFLICT";
  constructor(message?: string) {
    super(message ?? "Only one open fiscal year allowed");
    this.name = "FiscalYearOpenConflictError";
  }
}

export class FiscalYearNotOpenError extends Error {
  code = "FISCAL_YEAR_NOT_OPEN";
  constructor(message?: string) {
    super(message ?? "Fiscal year is not open");
    this.name = "FiscalYearNotOpenError";
  }
}

export class FiscalYearSelectionError extends Error {
  code = "FISCAL_YEAR_SELECTION_ERROR";
  constructor(message?: string) {
    super(message ?? "Fiscal year selection error");
    this.name = "FiscalYearSelectionError";
  }
}

export class FiscalYearAlreadyClosedError extends Error {
  code = "FISCAL_YEAR_ALREADY_CLOSED";
  constructor(message?: string) {
    super(message ?? "Fiscal year is already closed");
    this.name = "FiscalYearAlreadyClosedError";
  }
}

export class FiscalYearCloseConflictError extends Error {
  code = "FISCAL_YEAR_CLOSE_CONFLICT";
  constructor(message?: string) {
    super(message ?? "Fiscal year close conflict");
    this.name = "FiscalYearCloseConflictError";
  }
}

export class FiscalYearClosePreconditionError extends Error {
  code = "FISCAL_YEAR_CLOSE_PRECONDITION_FAILED";
  constructor(message?: string) {
    super(message ?? "Fiscal year close preconditions not met");
    this.name = "FiscalYearClosePreconditionError";
  }
}

/**
 * Error thrown when fiscal year close preview fails validation
 */
export class FiscalYearClosePreviewError extends Error {
  code = "FISCAL_YEAR_CLOSE_PREVIEW_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "FiscalYearClosePreviewError";
  }
}

/**
 * Error thrown when no retained earnings account is found
 */
export class RetainedEarningsAccountNotFoundError extends Error {
  code = "RETAINED_EARNINGS_ACCOUNT_NOT_FOUND";
  constructor(companyId: number) {
    super(`Retained Earnings account not found for company ${companyId}. Please configure a retained earnings account.`);
    this.name = "RetainedEarningsAccountNotFoundError";
  }
}
