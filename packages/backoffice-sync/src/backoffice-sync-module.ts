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
import { BackofficeDataService, type DatabaseConnection } from "./core/backoffice-data-service.js";
import { createBackofficeSyncEndpoints } from "./endpoints/backoffice-sync-endpoints.js";
import { BatchProcessor, type BatchProcessorConfig } from "./batch/batch-processor.js";
import { ExportScheduler } from "./scheduler/export-scheduler.js";

export class BackofficeSyncModule implements SyncModule {
  readonly moduleId = "backoffice";
  readonly clientType = "BACKOFFICE" as const;
  readonly endpoints: ReadonlyArray<SyncEndpoint>;

  private dataService?: BackofficeDataService;
  private logger?: any;
  private batchProcessor?: BatchProcessor;
  private exportScheduler?: ExportScheduler;
  private batchProcessorConfig: BatchProcessorConfig = {
    maxConcurrentJobs: 3,
    pollIntervalMs: 30_000,
    retryDelayMs: 60_000,
    cleanupIntervalMs: 300_000
  };

  constructor(public readonly config: SyncModuleConfig) {
    // Initialize endpoints with this module's handleSync method
    this.endpoints = createBackofficeSyncEndpoints(this.handleSync.bind(this));
  }

  async initialize(context: SyncModuleInitContext): Promise<void> {
    this.dataService = new BackofficeDataService(context.database);
    this.logger = context.logger;
    
    // Initialize batch processor
    this.batchProcessor = new BatchProcessor(context.database, this.batchProcessorConfig);
    
    // Initialize export scheduler
    this.exportScheduler = new ExportScheduler(context.database);
    this.exportScheduler.setBatchProcessor(this.batchProcessor);
    
    this.logger?.info(`Initialized backoffice sync module with config:`, {
      moduleId: this.config.module_id,
      frequencies: this.config.frequencies,
      batchProcessor: {
        maxConcurrentJobs: this.batchProcessorConfig.maxConcurrentJobs,
        pollIntervalMs: this.batchProcessorConfig.pollIntervalMs
      },
      exportScheduler: {
        pollIntervalMs: 60000
      }
    });
  }

  async handleSync(request: SyncRequest): Promise<SyncResponse> {
    if (!this.dataService) {
      throw new Error("Backoffice sync module not initialized");
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
        case 'ANALYTICS':
          responseData = await this.handleAnalyticsSync(request);
          dataVersion = await syncVersionManager.getCurrentVersion(request.context.company_id, 'ANALYTICS');
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

      this.logger?.error(`Backoffice sync error for tier ${request.tier}:`, error);

      return {
        success: false,
        timestamp: new Date().toISOString(),
        has_more: false,
        error_message: error instanceof Error ? error.message : 'Unknown sync error'
      };
    }
  }

  getSupportedTiers(): ReadonlyArray<SyncTier> {
    return ['REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS'];
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (!this.dataService) {
        return { healthy: false, message: "Module not initialized" };
      }

      // Test database connectivity with a simple query
      await (this.dataService as any).db.query('SELECT 1');
      
      const batchStatus = this.getBatchProcessorStatus();
      const message = batchStatus 
        ? "Backoffice sync module and batch processor operational" 
        : "Backoffice sync module operational (batch processor not available)";
      
      return { healthy: true, message };
    } catch (error) {
      return { 
        healthy: false, 
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async cleanup(): Promise<void> {
    await this.stopExportScheduler();
    await this.stopBatchProcessor();
    this.dataService = undefined;
    this.logger = undefined;
  }

  async startBatchProcessor(): Promise<void> {
    if (this.batchProcessor) {
      await this.batchProcessor.start();
      this.logger?.info("Batch processor started");
    }
  }

  async stopBatchProcessor(): Promise<void> {
    if (this.batchProcessor) {
      await this.batchProcessor.stop();
      this.logger?.info("Batch processor stopped");
    }
  }

  async startExportScheduler(): Promise<void> {
    if (this.exportScheduler) {
      await this.exportScheduler.start();
      this.logger?.info("Export scheduler started");
    }
  }

  async stopExportScheduler(): Promise<void> {
    if (this.exportScheduler) {
      await this.exportScheduler.stop();
      this.logger?.info("Export scheduler stopped");
    }
  }

  getExportScheduler(): ExportScheduler | undefined {
    return this.exportScheduler;
  }

  getBatchProcessorStatus(): { available: boolean } | null {
    if (!this.batchProcessor) return null;
    return {
      available: true
    };
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

  private async handleAnalyticsSync(request: SyncRequest): Promise<any> {
    if (!this.dataService) throw new Error("Data service not available");

    const analyticsData = await this.dataService.getAnalyticsData(request.context);
    
    return {
      tier: 'ANALYTICS' as const,
      data: analyticsData
    };
  }

  private countRecords(data: any): number {
    if (!data || !data.data) return 0;

    let count = 0;
    const tierData = data.data;

    // Count records based on tier type
    if (tierData.recent_transactions) count += tierData.recent_transactions.length;
    if (tierData.staff_activity) count += tierData.staff_activity.length;
    if (tierData.system_alerts) count += tierData.system_alerts.length;
    if (tierData.items) count += tierData.items.length;
    if (tierData.customers) count += tierData.customers.length;
    if (tierData.suppliers) count += tierData.suppliers.length;
    if (tierData.chart_of_accounts) count += tierData.chart_of_accounts.length;
    if (tierData.users) count += tierData.users.length;
    if (tierData.outlets) count += tierData.outlets.length;
    if (tierData.audit_logs) count += tierData.audit_logs.length;

    return count;
  }
}