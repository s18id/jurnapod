// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared Accounting Services Factory
 * 
 * Centralizes creation of accounting services with shared db client and audit service.
 * This ensures transaction consistency across services and removes duplication.
 */

import {
  AccountsService,
  AccountTypesService,
  JournalsService,
  type AccountsDbClient,
  type AccountTypesDbClient,
  type JournalsDbClient,
  type AuditServiceInterface
} from "@jurnapod/modules-accounting";
import { getDb } from "./db";
import { getAuditService } from "./audit";

/**
 * Adapter to make platform AuditService compatible with accounting module AuditServiceInterface
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

// Singleton instances
let accountsServiceInstance: AccountsService | null = null;
let accountTypesServiceInstance: AccountTypesService | null = null;
let journalsServiceInstance: JournalsService | null = null;

/**
 * Get singleton AccountsService instance
 */
export function getAccountsService(): AccountsService {
  if (!accountsServiceInstance) {
    const dbClient = getDb();
    const auditService = new AuditServiceAdapter(getAuditService());
    accountsServiceInstance = new AccountsService(dbClient as AccountsDbClient, auditService);
  }
  return accountsServiceInstance;
}

/**
 * Get singleton AccountTypesService instance
 */
export function getAccountTypesService(): AccountTypesService {
  if (!accountTypesServiceInstance) {
    const dbClient = getDb();
    const auditService = new AuditServiceAdapter(getAuditService());
    accountTypesServiceInstance = new AccountTypesService(dbClient as AccountTypesDbClient, auditService);
  }
  return accountTypesServiceInstance;
}

/**
 * Get singleton JournalsService instance
 * Note: JournalsService only requires logCreate, so we use a minimal adapter
 */
export function getJournalsService(): JournalsService {
  if (!journalsServiceInstance) {
    const dbClient = getDb();
    const auditService = new AuditServiceAdapter(getAuditService());
    
    // Minimal adapter for journals (only logCreate is used)
    const journalsAuditAdapter: AuditServiceInterface = {
      logCreate: auditService.logCreate.bind(auditService),
      logUpdate: async () => { throw new Error("Not implemented for journals"); },
      logDeactivate: async () => { throw new Error("Not implemented for journals"); },
      logReactivate: async () => { throw new Error("Not implemented for journals"); }
    };
    
    journalsServiceInstance = new JournalsService(dbClient as JournalsDbClient, journalsAuditAdapter);
  }
  return journalsServiceInstance;
}
