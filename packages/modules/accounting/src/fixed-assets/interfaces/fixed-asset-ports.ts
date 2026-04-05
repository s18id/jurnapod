// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * FixedAssetPorts Interface
 *
 * Injection boundary for fixed assets module.
 * Abstracts ACL logic and fiscal year validation so that modules-accounting
 * has NO direct dependency on apps/api.
 *
 * The API composes a concrete implementation and injects it at service creation time.
 */

/**
 * Port for checking user access to outlets.
 */
export interface AccessScopeChecker {
  userHasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean>;
}

/**
 * Context passed to FiscalYearGuard operations
 */
export interface FiscalYearContext {
  companyId: number;
  userId?: number;
}

/**
 * Port for fiscal year boundary validation.
 */
export interface FiscalYearGuard {
  ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void>;

  /**
   * Ensures the fiscal year is open for transactions.
   * Throws FiscalYearClosedError if the fiscal year is closed.
   */
  ensureFiscalYearIsOpen(fiscalYearId: number, ctx: FiscalYearContext): Promise<void>;

  /**
   * Ensures the fiscal year allows updates (not locked or in close process).
   * Throws FiscalYearCloseConflictError if the fiscal year is being closed.
   */
  ensureFiscalYearAllowsUpdate(fiscalYearId: number, ctx: FiscalYearContext): Promise<void>;
}

/**
 * Complete set of ports required by fixed-assets services.
 */
export interface FixedAssetPorts {
  accessScopeChecker: AccessScopeChecker;
  fiscalYearGuard: FiscalYearGuard;
}
