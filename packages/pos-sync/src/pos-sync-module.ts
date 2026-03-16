// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncModule,
  SyncEndpoint,
  SyncModuleInitContext,
  SyncModuleConfig,
  SyncRequest,
  SyncResponse,
  SyncTier
} from "@jurnapod/sync-core";
import { syncAuditor, syncVersionManager } from "@jurnapod/sync-core";
import { PosDataService, type DatabaseConnection } from "./core/pos-data-service.js";
import { createPosSyncEndpoints } from "./endpoints/pos-sync-endpoints.js";

export class PosSyncModule implements SyncModule {
  readonly moduleId = "pos";
  readonly clientType = "POS" as const;
  readonly endpoints: ReadonlyArray<SyncEndpoint>;

  private dataService?: PosDataService;
  private logger?: any;

  constructor(public readonly config: SyncModuleConfig) {
    // Initialize endpoints with this module's handleSync method
    this.endpoints = createPosSyncEndpoints(this.handleSync.bind(this));
  }

  async initialize(context: SyncModuleInitContext): Promise<void> {
    this.dataService = new PosDataService(context.database);
    this.logger = context.logger;
    
    this.logger?.info(`Initialized POS sync module with config:`, {
      moduleId: this.config.module_id,
      frequencies: this.config.frequencies
    });
  }

  async handleSync(request: SyncRequest): Promise<SyncResponse> {
    if (!this.dataService) {
      throw new Error("POS sync module not initialized");
    }

    const startTime = Date.now();
    let auditId: string | undefined;

    try {
      // Start audit tracking
      auditId = syncAuditor.startEvent(
        this.moduleId,
        request.tier,
        request.operation,
        request.context
      );

      let responseData: any;
      let dataVersion: number | undefined;

      switch (request.tier) {
        case 'REALTIME':
          responseData = await this.handleRealtimeSync(request);
          break;
        case 'OPERATIONAL':
          responseData = await this.handleOperationalSync(request);
          dataVersion = await syncVersionManager.getCurrentVersion(request.context.company_id, 'OPERATIONAL');
          break;
        case 'MASTER':
          responseData = await this.handleMasterSync(request);
          dataVersion = responseData.data_version; // Master data includes its own version
          break;
        case 'ADMIN':
          responseData = await this.handleAdminSync(request);
          dataVersion = await syncVersionManager.getCurrentVersion(request.context.company_id, 'ADMIN');
          break;
        default:
          throw new Error(`Unsupported tier: ${request.tier}`);
      }

      const response: SyncResponse = {
        success: true,
        timestamp: new Date().toISOString(),
        data_version: dataVersion,
        has_more: false,
        ...responseData
      };

      // Complete audit tracking
      if (auditId) {
        syncAuditor.completeEvent(
          auditId,
          this.countRecords(responseData),
          dataVersion,
          { duration_ms: Date.now() - startTime }
        );
      }

      return response;

    } catch (error) {
      // Log audit failure
      if (auditId) {
        syncAuditor.failEvent(auditId, error instanceof Error ? error : new Error('Unknown error'));
      }

      this.logger?.error(`POS sync error for tier ${request.tier}:`, error);

      return {
        success: false,
        timestamp: new Date().toISOString(),
        has_more: false,
        error_message: error instanceof Error ? error.message : 'Unknown sync error'
      };
    }
  }

  getSupportedTiers(): ReadonlyArray<SyncTier> {
    return ['REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN'];
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
    this.logger = undefined;
  }

  private async handleRealtimeSync(request: SyncRequest): Promise<any> {
    if (!this.dataService) throw new Error("Data service not available");

    const realtimeData = await this.dataService.getRealtimeData(request.context);
    
    return {
      tier: 'REALTIME' as const,
      data: realtimeData
    };
  }

  private async handleOperationalSync(request: SyncRequest): Promise<any> {
    if (!this.dataService) throw new Error("Data service not available");

    const operationalData = await this.dataService.getOperationalData(
      request.context, 
      request.since_version
    );
    
    return {
      tier: 'OPERATIONAL' as const,
      data: operationalData
    };
  }

  private async handleMasterSync(request: SyncRequest): Promise<any> {
    if (!this.dataService) throw new Error("Data service not available");

    const masterData = await this.dataService.getMasterData(
      request.context, 
      request.since_version
    );
    
    return {
      tier: 'MASTER' as const,
      data: masterData,
      data_version: masterData.data_version
    };
  }

  private async handleAdminSync(request: SyncRequest): Promise<any> {
    if (!this.dataService) throw new Error("Data service not available");

    const adminData = await this.dataService.getAdminData(request.context);
    
    return {
      tier: 'ADMIN' as const,
      data: adminData
    };
  }

  private countRecords(data: any): number {
    if (!data || !data.data) return 0;

    let count = 0;
    const tierData = data.data;

    // Count records based on tier type
    if (tierData.active_orders) count += tierData.active_orders.length;
    if (tierData.table_status_updates) count += tierData.table_status_updates.length;
    if (tierData.tables) count += tierData.tables.length;
    if (tierData.reservations) count += tierData.reservations.length;
    if (tierData.items) count += tierData.items.length;
    if (tierData.item_groups) count += tierData.item_groups.length;
    if (tierData.prices) count += tierData.prices.length;
    if (tierData.tax_rates) count += tierData.tax_rates.length;

    return count;
  }
}