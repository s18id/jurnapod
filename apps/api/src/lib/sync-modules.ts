// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { syncModuleRegistry } from "@jurnapod/sync-core";
import { PosSyncModule } from "@jurnapod/pos-sync";
import { BackofficeSyncModule } from "@jurnapod/backoffice-sync";
import { getDbPool } from "./db";

// Store reference to backoffice module for batch processor access
let backofficeModuleInstance: BackofficeSyncModule | null = null;

/**
 * Initialize sync modules for the API server
 */
export async function initializeSyncModules(): Promise<void> {
  try {
    // Get database pool
    const dbPool = getDbPool();

    // Create database adapter for sync modules
    const databaseAdapter = {
      async query(sql: string, params?: any[]): Promise<any[]> {
        const connection = await dbPool.getConnection();
        try {
          const [rows] = await connection.execute(sql, params);
          return Array.isArray(rows) ? rows : [];
        } finally {
          connection.release();
        }
      },

      async querySingle(sql: string, params?: any[]): Promise<any | null> {
        const results = await this.query(sql, params);
        return results[0] || null;
      }
    };

    // Initialize the sync module registry
    await syncModuleRegistry.initialize({
      database: databaseAdapter,
      logger: console,
      config: {
        enableAuditLogging: true,
        defaultRetryAttempts: 3,
        environment: process.env.NODE_ENV || 'development'
      }
    });

  // Create and register POS sync module
  const posModule = new PosSyncModule({
    module_id: "pos",
    client_type: "POS",
    enabled: true,
    frequencies: {
      realtime: "websocket",
      operational: 30_000,  // 30 seconds
      master: 300_000,      // 5 minutes
      admin: "startup"      // On app start
    }
  });

  // Create and register Backoffice sync module
  const backofficeModule = new BackofficeSyncModule({
    module_id: "backoffice",
    client_type: "BACKOFFICE",
    enabled: true,
    frequencies: {
      realtime: "websocket",
      operational: 120_000,  // 2 minutes
      master: 600_000,       // 10 minutes
      admin: 1_800_000,      // 30 minutes
      analytics: "batch"     // Hourly/daily
    }
  });
  
  // Store reference for batch processor access
  backofficeModuleInstance = backofficeModule;

  // Register the modules
  syncModuleRegistry.register(posModule);
  syncModuleRegistry.register(backofficeModule);

  // Start batch processor and export scheduler after module registration
  await backofficeModule.startBatchProcessor();
  await backofficeModule.startExportScheduler();

  console.log("✅ Sync modules initialized successfully");
  console.log(`   - POS sync module: ${posModule.getSupportedTiers().join(', ')} tiers`);
  console.log(`   - Backoffice sync module: ${backofficeModule.getSupportedTiers().join(', ')} tiers`);
  console.log(`   - Batch processor: RUNNING`);
  console.log(`   - Export scheduler: RUNNING`);

  } catch (error) {
    console.error("❌ Failed to initialize sync modules:", error);
    throw error;
  }
}

/**
 * Health check for all sync modules
 */
export async function checkSyncModuleHealth(): Promise<{
  healthy: boolean;
  modules: Record<string, { healthy: boolean; message?: string }>;
  batchProcessor?: { available: boolean };
}> {
  try {
    const moduleHealth = await syncModuleRegistry.healthCheck();
    const healthy = Object.values(moduleHealth).every(status => status.healthy);
    
    // Check batch processor status
    const batchStatus = backofficeModuleInstance?.getBatchProcessorStatus();

    return {
      healthy,
      modules: moduleHealth,
      batchProcessor: batchStatus ?? { available: false }
    };
  } catch (error) {
    console.error("Sync module health check failed:", error);
    return {
      healthy: false,
      modules: {},
      batchProcessor: { available: false }
    };
  }
}

/**
 * Start batch processor manually
 */
export async function startBatchProcessor(): Promise<void> {
  if (backofficeModuleInstance) {
    await backofficeModuleInstance.startBatchProcessor();
  }
}

/**
 * Stop batch processor manually
 */
export async function stopBatchProcessor(): Promise<void> {
  if (backofficeModuleInstance) {
    await backofficeModuleInstance.stopBatchProcessor();
  }
}

/**
 * Get export scheduler instance
 */
export function getExportScheduler(): any {
  return backofficeModuleInstance?.getExportScheduler();
}

/**
 * Cleanup sync modules (for graceful shutdown)
 */
export async function cleanupSyncModules(): Promise<void> {
  try {
    // Stop export scheduler and batch processor
    if (backofficeModuleInstance) {
      await backofficeModuleInstance.stopExportScheduler();
      await backofficeModuleInstance.stopBatchProcessor();
    }
    
    await syncModuleRegistry.cleanup();
    console.log("✅ Sync modules cleaned up successfully");
  } catch (error) {
    console.error("❌ Error cleaning up sync modules:", error);
  }
}