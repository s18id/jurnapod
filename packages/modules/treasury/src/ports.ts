// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Port interfaces for CashBankService.
 *
 * These interfaces define the boundary between the treasury package (domain logic)
 * and the API adapter (infrastructure). The API implements these ports using
 * Kysely database access, auth helpers, and fiscal year guards.
 */

import type { CashBankTransaction, CashBankStatus, CreateCashBankInput, CashBankListFilters } from "./types.js";

/**
 * Actor performing a mutation - carries user context.
 */
export interface MutationActor {
  userId: number;
}

/**
 * Account information for cash-bank validation.
 */
export interface AccountInfo {
  id: number;
  company_id: number;
  name: string;
  type_name: string | null;
}

/**
 * Repository port for CashBank data access.
 * Implementations provide database operations via Kysely.
 */
export interface CashBankRepository {
  // Read operations
  findById(id: number, companyId: number): Promise<CashBankTransaction | null>;
  findByIdForUpdate(id: number, companyId: number): Promise<CashBankTransaction | null>;
  list(companyId: number, filters: CashBankListFilters): Promise<{ total: number; transactions: CashBankTransaction[] }>;

  // Write operations
  create(input: CreateCashBankInput, companyId: number, createdByUserId: number | null): Promise<CashBankTransaction>;
  updateStatus(
    id: number,
    companyId: number,
    status: CashBankStatus,
    postedAt?: Date
  ): Promise<void>;

  // Validation helpers
  findAccount(accountId: number, companyId: number): Promise<AccountInfo | null>;
  outletBelongsToCompany(outletId: number, companyId: number): Promise<boolean>;

  // Transaction control (for atomic operations)
  withTransaction<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Port for checking user access to outlets.
 */
export interface AccessScopeChecker {
  userHasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean>;
}

/**
 * Port for fiscal year boundary validation.
 */
export interface FiscalYearGuard {
  ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void>;
}

/**
 * Complete set of ports required by CashBankService.
 */
export interface TreasuryPorts {
  repository: CashBankRepository;
  accessChecker: AccessScopeChecker;
  fiscalYearGuard: FiscalYearGuard;
}
