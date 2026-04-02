// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Thin API adapter for account types - composition/IO boundary only.
 * All business logic delegates to accounting module services.
 */

import type {
  AccountTypeResponse,
  AccountTypeCreateRequest,
  AccountTypeUpdateRequest,
  AccountTypeListQuery
} from "@jurnapod/shared";
import { getAccountTypesService } from "./accounting-services";

/**
 * Export service methods - thin wrappers around accounting module
 */
export async function listAccountTypes(query: AccountTypeListQuery): Promise<AccountTypeResponse[]> {
  const service = getAccountTypesService();
  return service.listAccountTypes(query);
}

export async function getAccountTypeById(accountTypeId: number, companyId: number): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.getAccountTypeById(accountTypeId, companyId);
}

export async function createAccountType(data: AccountTypeCreateRequest, userId?: number): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.createAccountType(data, userId);
}

export async function updateAccountType(
  accountTypeId: number,
  data: AccountTypeUpdateRequest,
  companyId: number,
  userId?: number
): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.updateAccountType(accountTypeId, data, companyId, userId);
}

export async function deactivateAccountType(accountTypeId: number, companyId: number, userId?: number): Promise<AccountTypeResponse> {
  const service = getAccountTypesService();
  return service.deactivateAccountType(accountTypeId, companyId, userId);
}

export async function isAccountTypeInUse(accountTypeId: number, companyId: number): Promise<boolean> {
  const service = getAccountTypesService();
  return service.isAccountTypeInUse(accountTypeId, companyId);
}

/**
 * Export error classes from accounting module
 */
export {
  AccountTypeNameExistsError,
  AccountTypeNotFoundError,
  AccountTypeInUseError
} from "@jurnapod/modules-accounting";
