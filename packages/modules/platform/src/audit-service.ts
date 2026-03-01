// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AuditLogEntryRequest, AuditAction, AuditEntityType, AuditResult } from "@jurnapod/shared";

/**
 * Database client interface for audit logging
 * Should support parameterized queries and transactions
 */
export interface AuditDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

/**
 * Context for audit operations
 */
export interface AuditContext {
  company_id: number;
  user_id: number;
  outlet_id?: number | null;
  ip_address?: string | null;
}

/**
 * AuditService
 * Framework-agnostic service for audit logging
 * 
 * Stores audit logs for all master data changes and important operations
 * according to AGENTS.md requirements.
 */
export class AuditService {
  constructor(private readonly db: AuditDbClient) {}

  /**
   * Log entity creation
   */
  async logCreate(
    context: AuditContext,
    entityType: AuditEntityType,
    entityId: string | number,
    payload: Record<string, any>
  ): Promise<void> {
    return this.log({
      ...context,
      entity_type: entityType,
      entity_id: String(entityId),
      action: "CREATE",
      result: "SUCCESS",
      payload
    });
  }

  /**
   * Log entity update with before/after changes
   */
  async logUpdate(
    context: AuditContext,
    entityType: AuditEntityType,
    entityId: string | number,
    before: Record<string, any>,
    after: Record<string, any>
  ): Promise<void> {
    // Only include fields that actually changed
    const changes = this.computeChanges(before, after);

    return this.log({
      ...context,
      entity_type: entityType,
      entity_id: String(entityId),
      action: "UPDATE",
      result: "SUCCESS",
      changes: {
        before: changes.before,
        after: changes.after
      }
    });
  }

  /**
   * Log entity deletion
   */
  async logDelete(
    context: AuditContext,
    entityType: AuditEntityType,
    entityId: string | number,
    payload: Record<string, any>
  ): Promise<void> {
    return this.log({
      ...context,
      entity_type: entityType,
      entity_id: String(entityId),
      action: "DELETE",
      result: "SUCCESS",
      payload
    });
  }

  /**
   * Log entity deactivation (soft delete)
   */
  async logDeactivate(
    context: AuditContext,
    entityType: AuditEntityType,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void> {
    return this.log({
      ...context,
      entity_type: entityType,
      entity_id: String(entityId),
      action: "DEACTIVATE",
      result: "SUCCESS",
      payload: payload || {}
    });
  }

  /**
   * Log entity reactivation
   */
  async logReactivate(
    context: AuditContext,
    entityType: AuditEntityType,
    entityId: string | number,
    payload?: Record<string, any>
  ): Promise<void> {
    return this.log({
      ...context,
      entity_type: entityType,
      entity_id: String(entityId),
      action: "REACTIVATE",
      result: "SUCCESS",
      payload: payload || {}
    });
  }

  /**
   * Generic log method for custom actions
   */
  async logAction(
    context: AuditContext,
    entityType: AuditEntityType,
    entityId: string | number,
    action: AuditAction,
    payload?: Record<string, any>,
    result: AuditResult = "SUCCESS"
  ): Promise<void> {
    return this.log({
      ...context,
      entity_type: entityType,
      entity_id: String(entityId),
      action,
      result,
      payload: payload || {}
    });
  }

  /**
   * Internal method to write audit log entry
   */
  private async log(entry: AuditLogEntryRequest): Promise<void> {
    try {
      const sql = `
        INSERT INTO audit_logs (
          company_id, outlet_id, user_id, entity_type, entity_id,
          action, result, ip_address, payload_json, changes_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const params = [
        entry.company_id,
        entry.outlet_id ?? null,
        entry.user_id,
        entry.entity_type,
        entry.entity_id,
        entry.action,
        entry.result,
        entry.ip_address ?? null,
        JSON.stringify(entry.payload || {}),
        entry.changes ? JSON.stringify(entry.changes) : null
      ];

      await this.db.execute(sql, params);
    } catch (error) {
      // If we're in a transaction (db.begin was called), we should throw
      // to trigger rollback. Otherwise, log error but don't throw.
      const inTransaction = this.db.begin !== undefined;
      
      if (inTransaction) {
        // Re-throw to trigger transaction rollback
        throw error;
      } else {
        // Audit logging should NOT fail the main operation when not in transaction
        // Log error but don't throw
        console.error("[AuditService] Failed to write audit log:", error);
        console.error("[AuditService] Entry details:", {
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          action: entry.action,
          user_id: entry.user_id
        });
      }
    }
  }

  /**
   * Compute changed fields between before and after states
   * Returns only the fields that changed with their before/after values
   */
  private computeChanges(
    before: Record<string, any>,
    after: Record<string, any>
  ): { before: Record<string, any>; after: Record<string, any> } {
    const changedBefore: Record<string, any> = {};
    const changedAfter: Record<string, any> = {};

    // Check all fields in 'after' object
    for (const key of Object.keys(after)) {
      // Skip if values are the same
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changedBefore[key] = before[key];
        changedAfter[key] = after[key];
      }
    }

    // Check for removed fields (present in before but not in after)
    for (const key of Object.keys(before)) {
      if (!(key in after)) {
        changedBefore[key] = before[key];
        changedAfter[key] = undefined;
      }
    }

    return {
      before: changedBefore,
      after: changedAfter
    };
  }
}
