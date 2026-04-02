// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Thin API adapter for accounts - composition/IO boundary only.
 * All business logic delegates to accounting module services.
 */

import type {
  AccountResponse,
  AccountCreateRequest,
  AccountUpdateRequest,
  AccountListQuery,
  AccountTreeNode
} from "@jurnapod/shared";
import { getAccountsService } from "./accounting-services";

/**
 * Export service methods - thin wrappers around accounting module
 */
export async function listAccounts(query: AccountListQuery): Promise<AccountResponse[]> {
  const service = getAccountsService();
  return service.listAccounts(query);
}

export async function getAccountById(accountId: number, companyId: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.getAccountById(accountId, companyId);
}

export async function createAccount(data: AccountCreateRequest, userId?: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.createAccount(data, userId);
}

export async function updateAccount(
  accountId: number,
  data: AccountUpdateRequest,
  companyId: number,
  userId?: number
): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.updateAccount(accountId, data, companyId, userId);
}

export async function deactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.deactivateAccount(accountId, companyId, userId);
}

export async function reactivateAccount(accountId: number, companyId: number, userId?: number): Promise<AccountResponse> {
  const service = getAccountsService();
  return service.reactivateAccount(accountId, companyId, userId);
}

export async function getAccountTree(companyId: number, includeInactive = false): Promise<AccountTreeNode[]> {
  const service = getAccountsService();
  return service.getAccountTree(companyId, includeInactive);
}

export async function isAccountInUse(accountId: number, companyId: number): Promise<boolean> {
  const service = getAccountsService();
  return service.isAccountInUse(accountId, companyId);
}

/**
 * Export error classes from accounting module
 */
export {
  AccountCodeExistsError,
  CircularReferenceError,
  AccountInUseError,
  AccountNotFoundError,
  ParentAccountCompanyMismatchError,
  AccountTypeCompanyMismatchError
} from "@jurnapod/modules-accounting";
