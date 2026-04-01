// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncModule,
  SyncEndpoint,
  SyncModuleInitContext,
  SyncModuleConfig,
  SyncRequest,
  SyncResponse
} from "@jurnapod/sync-core";
import { BackofficeDataService } from "./core/backoffice-data-service.js";
import { createBackofficeSyncEndpoints } from "./endpoints/backoffice-sync-endpoints.js";
import { BatchProcessor, type BatchProcessorConfig } from "./batch/batch-processor.js";
import { ExportScheduler } from "./scheduler/export-scheduler.js";
import { sql } from "kysely";

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
      pollIntervalMs: this.config.poll_interval_ms,
      batchProcessor: {
        maxConcurrentJobs: this.batchProcessorConfig.maxConcurrentJobs,
        pollIntervalMs: this.batchProcessorConfig.pollIntervalMs
      },
      exportScheduler: {
        pollIntervalMs: 60000
      }
    });
  }

  /**
   * Handle sync request (legacy - not used by API routes).
   * API routes use lib/sync/push and lib/sync/master-data directly.
   * This method is kept for potential future use or testing.
   */
  async handleSync(request: SyncRequest): Promise<SyncResponse> {
    // This is legacy dead code - API routes use lib/sync/ implementations directly
    // Log and return not implemented
    this.logger?.warn(`Backoffice handleSync called but is not used by API routes`);
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      has_more: false,
      error_message: "handleSync is deprecated - use API sync endpoints directly"
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (!this.dataService) {
        return { healthy: false, message: "Module not initialized" };
      }

      // Test database connectivity with a simple query using Kysely
      await sql`SELECT 1`.execute((this.dataService as any).db);
      
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
}