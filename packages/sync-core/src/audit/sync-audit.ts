// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { SyncContext, SyncTier, SyncOperationType } from "../types/index.js";

export interface SyncAuditEvent {
  id?: string;
  company_id: number;
  outlet_id?: number;
  user_id?: number;
  module_id: string;
  tier: SyncTier;
  operation: SyncOperationType;
  request_id: string;
  started_at: Date;
  completed_at?: Date;
  status: 'STARTED' | 'SUCCESS' | 'ERROR' | 'CANCELLED';
  error_message?: string;
  metadata?: Record<string, any>;
  records_affected?: number;
  data_version?: number;
}

export class SyncAuditor {
  private events = new Map<string, SyncAuditEvent>();

  /**
   * Start audit event for sync operation
   */
  startEvent(
    moduleId: string,
    tier: SyncTier,
    operation: SyncOperationType,
    context: SyncContext,
    metadata?: Record<string, any>
  ): string {
    const event: SyncAuditEvent = {
      id: context.request_id,
      company_id: context.company_id,
      outlet_id: context.outlet_id,
      user_id: context.user_id,
      module_id: moduleId,
      tier,
      operation,
      request_id: context.request_id,
      started_at: new Date(),
      status: 'STARTED',
      metadata
    };

    this.events.set(context.request_id, event);
    return context.request_id;
  }

  /**
   * Complete audit event successfully
   */
  completeEvent(
    requestId: string,
    recordsAffected?: number,
    dataVersion?: number,
    metadata?: Record<string, any>
  ): void {
    const event = this.events.get(requestId);
    if (!event) {
      console.warn(`Audit event not found for request ${requestId}`);
      return;
    }

    event.completed_at = new Date();
    event.status = 'SUCCESS';
    event.records_affected = recordsAffected;
    event.data_version = dataVersion;
    
    if (metadata) {
      event.metadata = { ...event.metadata, ...metadata };
    }

    // TODO: Persist to database
    this.persistEvent(event);
  }

  /**
   * Mark audit event as failed
   */
  failEvent(requestId: string, error: string | Error, metadata?: Record<string, any>): void {
    const event = this.events.get(requestId);
    if (!event) {
      console.warn(`Audit event not found for request ${requestId}`);
      return;
    }

    event.completed_at = new Date();
    event.status = 'ERROR';
    event.error_message = error instanceof Error ? error.message : error;
    
    if (metadata) {
      event.metadata = { ...event.metadata, ...metadata };
    }

    // TODO: Persist to database
    this.persistEvent(event);
  }

  /**
   * Cancel audit event
   */
  cancelEvent(requestId: string, reason?: string): void {
    const event = this.events.get(requestId);
    if (!event) {
      console.warn(`Audit event not found for request ${requestId}`);
      return;
    }

    event.completed_at = new Date();
    event.status = 'CANCELLED';
    event.error_message = reason;

    // TODO: Persist to database
    this.persistEvent(event);
  }

  /**
   * Get audit event by request ID
   */
  getEvent(requestId: string): SyncAuditEvent | undefined {
    return this.events.get(requestId);
  }

  /**
   * Get audit statistics for a time period
   */
  async getStats(
    companyId: number,
    startDate: Date,
    endDate: Date,
    moduleId?: string,
    tier?: SyncTier
  ): Promise<{
    total_operations: number;
    successful_operations: number;
    failed_operations: number;
    average_duration_ms: number;
    operations_by_tier: Record<SyncTier, number>;
    operations_by_module: Record<string, number>;
  }> {
    // TODO: Implement database query for statistics
    // This would query the audit_logs table with filters
    
    return {
      total_operations: 0,
      successful_operations: 0,
      failed_operations: 0,
      average_duration_ms: 0,
      operations_by_tier: {
        REALTIME: 0,
        OPERATIONAL: 0,
        MASTER: 0,
        ADMIN: 0,
        ANALYTICS: 0
      },
      operations_by_module: {}
    };
  }

  /**
   * Persist audit event to database
   * TODO: Implement actual database persistence
   */
  private async persistEvent(event: SyncAuditEvent): Promise<void> {
    try {
      // TODO: Insert into audit_logs table
      // This would use the existing audit log schema
      console.log('Audit event:', event);
      
      // Clean up from memory after persisting
      if (event.id) {
        this.events.delete(event.id);
      }
    } catch (error) {
      console.error('Failed to persist audit event:', error);
    }
  }

  /**
   * Clean up old events from memory
   */
  cleanup(olderThanMinutes: number = 60): void {
    const cutoff = new Date(Date.now() - (olderThanMinutes * 60 * 1000));
    
    for (const [requestId, event] of this.events.entries()) {
      if (event.started_at < cutoff) {
        this.events.delete(requestId);
      }
    }
  }
}

export const syncAuditor = new SyncAuditor();