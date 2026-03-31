// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  AccountTypesService,
  type AccountTypesDbClient
} from "@jurnapod/modules-accounting";
import type {
  AccountTypeResponse,
  AccountTypeCreateRequest,
  AccountTypeUpdateRequest,
  AccountTypeListQuery
} from "@jurnapod/shared";
import { getDb } from "./db";
import { getAuditService } from "./audit";

/**
 * Audit service interface (matches AccountTypesService expectations)
 */
interface AuditServiceInterface {
  logCreate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload: Record<string, any>
  ): Promise<void>;
  logUpdate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    before: Record<string, any>,
    after: Record<string, any>
  ): Promise<void>;
  logDeactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void>;
}

/**
 * Adapter to make AuditService compatible with AuditServiceInterface
 */
class AuditServiceAdapter implements AuditServiceInterface {
  constructor(private readonly auditService: ReturnType<typeof getAuditService>) {}

  async logCreate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload: Record<string, any>
  ): Promise<void> {
    return this.auditService.logCreate(context, entityType as any, entityId, payload);
  }

  async logUpdate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    before: Record<string, any>,
    after: Record<string, any>
  ): Promise<void> {
    return this.auditService.logUpdate(context, entityType as any, entityId, before, after);
  }

  async logDeactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void> {
    return this.auditService.logDeactivate(context, entityType as any, entityId, payload);
  }

  async logReactivate(
    context: { company_id: number; user_id: number; outlet_id?: number | null; ip_address?: string | null },
    entityType: string,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void> {
    return this.auditService.logReactivate(context, entityType as any, entityId, payload);
  }
}

/**
 * Create AccountTypesService instance with DbConn and audit service.
 * Both services share the same db client to support transactions.
 */
async function createAccountTypesService(): Promise<AccountTypesService> {
  const dbClient = getDb();
  
  // Import AuditService class using dynamic import
  const { AuditService } = await import("@jurnapod/modules-platform");
  
  // Create audit service with the SAME db client to share transactions
  const auditService = new AuditService(dbClient);
  const auditServiceAdapter = new AuditServiceAdapter(auditService);
  
  return new AccountTypesService(dbClient as AccountTypesDbClient, auditServiceAdapter);
}

// Singleton instance
let accountTypesServiceInstance: AccountTypesService | null = null;

async function getAccountTypesService(): Promise<AccountTypesService> {
  if (!accountTypesServiceInstance) {
    accountTypesServiceInstance = await createAccountTypesService();
  }
  return accountTypesServiceInstance;
}

/**
 * Export service methods
 */
export async function listAccountTypes(query: AccountTypeListQuery): Promise<AccountTypeResponse[]> {
  const service = await getAccountTypesService();
  return service.listAccountTypes(query);
}

export async function getAccountTypeById(accountTypeId: number, companyId: number): Promise<AccountTypeResponse> {
  const service = await getAccountTypesService();
  return service.getAccountTypeById(accountTypeId, companyId);
}

export async function createAccountType(data: AccountTypeCreateRequest, userId?: number): Promise<AccountTypeResponse> {
  const service = await getAccountTypesService();
  return service.createAccountType(data, userId);
}

export async function updateAccountType(
  accountTypeId: number,
  data: AccountTypeUpdateRequest,
  companyId: number,
  userId?: number
): Promise<AccountTypeResponse> {
  const service = await getAccountTypesService();
  return service.updateAccountType(accountTypeId, data, companyId, userId);
}

export async function deactivateAccountType(accountTypeId: number, companyId: number, userId?: number): Promise<AccountTypeResponse> {
  const service = await getAccountTypesService();
  return service.deactivateAccountType(accountTypeId, companyId, userId);
}

export async function isAccountTypeInUse(accountTypeId: number, companyId: number): Promise<boolean> {
  const service = await getAccountTypesService();
  return service.isAccountTypeInUse(accountTypeId, companyId);
}

/**
 * Export error classes
 */
export {
  AccountTypeNameExistsError,
  AccountTypeNotFoundError,
  AccountTypeInUseError
} from "@jurnapod/modules-accounting";
