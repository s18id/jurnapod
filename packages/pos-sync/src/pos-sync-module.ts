// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  SyncModule,
  SyncEndpoint,
  SyncModuleInitContext,
  SyncModuleConfig,
  SyncRequest,
  SyncResponse,
} from "@jurnapod/sync-core";
import { syncAuditor } from "@jurnapod/sync-core";
import { PosDataService, type DatabaseConnection } from "./core/pos-data-service.js";
import { createPosSyncEndpoints } from "./endpoints/pos-sync-endpoints.js";
import { createDbPool, DbConn } from "@jurnapod/db";
import { handlePullSync, type PullSyncParams, type PullSyncResult } from "./pull/index.js";

export class PosSyncModule implements SyncModule {
  readonly moduleId = "pos";
  readonly clientType = "POS" as const;
  readonly endpoints: ReadonlyArray<SyncEndpoint>;

  private dataService?: PosDataService;
  private dbConn?: DbConn;
  private logger?: any;

  constructor(public readonly config: SyncModuleConfig) {
    // Initialize endpoints - endpoints call handleSync which delegates to handlePullSync
    this.endpoints = createPosSyncEndpoints(this.handleSync.bind(this));
  }

  async initialize(context: SyncModuleInitContext): Promise<void> {
    this.dataService = new PosDataService(context.database);

    // Create DbConn from the module context's database
    if (context.database) {
      // The context.database could be a mysql pool or a DbConn-like object
      this.dbConn = context.database as DbConn;
    }

    this.logger = context.logger;

    this.logger?.info(`Initialized POS sync module with config:`, {
      moduleId: this.config.module_id,
      clientType: this.config.client_type,
      enabled: this.config.enabled
    });
  }

  /**
   * Canonical entry point for POS pull sync.
   * Accepts PullSyncParams and returns PullSyncResult.
   */
  async handlePullSync(params: PullSyncParams): Promise<PullSyncResult> {
    if (!this.dbConn) {
      throw new Error("POS sync module not initialized - database connection not available");
    }

    return await handlePullSync(this.dbConn, params);
  }

  /**
   * Handle sync request from endpoints.
   * This method wraps handlePullSync with the old SyncRequest/SyncResponse interface
   * for backward compatibility with existing endpoints.
   */
  async handleSync(request: SyncRequest): Promise<SyncResponse> {
    if (!this.dbConn) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        has_more: false,
        error_message: "POS sync module not initialized"
      };
    }

    const startTime = Date.now();
    let auditId: string | undefined;

    try {
      // Extract params from request
      const { company_id: companyId, outlet_id: outletId } = request.context;
      const sinceVersion = request.since_version ?? 0;

      // Start audit tracking - use MASTER as default tier since we're doing pull
      auditId = syncAuditor.startEvent(
        this.moduleId,
        "MASTER",
        request.operation,
        {
          company_id: companyId,
          outlet_id: outletId ?? 0,
          client_type: "POS",
          request_id: request.context.request_id,
          timestamp: request.context.timestamp,
        }
      );

      // Delegate to handlePullSync
      const result = await this.handlePullSync({
        companyId,
        outletId: outletId ?? 0,
        sinceVersion,
        ordersCursor: 0,
      });

      // Complete audit tracking
      if (auditId) {
        syncAuditor.completeEvent(
          auditId,
          result.payload.items.length +
            result.payload.tables.length +
            result.payload.reservations.length +
            result.payload.variants.length,
          result.currentVersion,
          { duration_ms: Date.now() - startTime }
        );
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        data_version: result.currentVersion,
        has_more: false
      };

    } catch (error) {
      // Log audit failure
      if (auditId) {
        syncAuditor.failEvent(auditId, error instanceof Error ? error : new Error('Unknown error'));
      }

      this.logger?.error(`POS sync error:`, error);

      return {
        success: false,
        timestamp: new Date().toISOString(),
        has_more: false,
        error_message: error instanceof Error ? error.message : 'Unknown sync error'
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (!this.dataService) {
        return { healthy: false, message: "Module not initialized" };
      }

      // Test database connectivity with a simple query
      await (this.dataService as any).db.query('SELECT 1');

      return { healthy: true, message: "POS sync module operational" };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async cleanup(): Promise<void> {
    this.dataService = undefined;
    this.dbConn = undefined;
    this.logger = undefined;
  }
}
