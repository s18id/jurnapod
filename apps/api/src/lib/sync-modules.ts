// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { syncModuleRegistry } from "@jurnapod/sync-core";
import { PosSyncModule } from "@jurnapod/pos-sync";
import { BackofficeSyncModule } from "@jurnapod/backoffice-sync";
import { getDbPool } from "./db";

// Store reference to backoffice module for batch processor access
let backofficeModuleInstance: BackofficeSyncModule | null = null;

// Store reference to POS sync module for shared lifecycle access
let posSyncModuleInstance: PosSyncModule | null = null;

/**
 * Initialize sync modules for the API server
 */
export async function initializeSyncModules(): Promise<void> {
  let posModule: PosSyncModule | null = null;
  let backofficeModule: BackofficeSyncModule | null = null;

  try {
    // Get database pool (KyselySchema)
    const db = getDbPool();

  // Create and register POS sync module
  posModule = new PosSyncModule({
    module_id: "pos",
    client_type: "POS",
    enabled: true,
    poll_interval_ms: 30_000  // 30 seconds - operational polling interval
  });

  // Create and register Backoffice sync module
  backofficeModule = new BackofficeSyncModule({
    module_id: "backoffice",
    client_type: "BACKOFFICE",
    enabled: true,
    poll_interval_ms: 120_000  // 2 minutes - operational polling interval
  });

  // Register the modules
  syncModuleRegistry.register(posModule);
  syncModuleRegistry.register(backofficeModule);

    // Initialize registry after modules are registered
    await syncModuleRegistry.initialize({
      database: db,
      logger: console,
      config: {
        enableAuditLogging: true,
        defaultRetryAttempts: 3,
        environment: process.env.NODE_ENV || 'development'
      }
    });

  // Start batch processor and export scheduler after module registration
  await backofficeModule.startBatchProcessor();
  await backofficeModule.startExportScheduler();

  // Publish initialized module singletons only after successful startup
  posSyncModuleInstance = posModule;
  backofficeModuleInstance = backofficeModule;

  console.log("✅ Sync modules initialized successfully");
  console.log(`   - POS sync module: registered`);
  console.log(`   - Backoffice sync module: registered`);
  console.log(`   - Batch processor: RUNNING`);
  console.log(`   - Export scheduler: RUNNING`);

  } catch (error) {
    // Ensure failed initialization never leaves stale singleton references.
    posSyncModuleInstance = null;
    backofficeModuleInstance = null;

    // Best-effort cleanup to avoid duplicate registrations on retries.
    try {
      await syncModuleRegistry.cleanup();
    } catch (cleanupError) {
      console.error("❌ Failed to cleanup sync registry after init failure:", cleanupError);
    }

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
 * Initialize the PosSyncModule singleton.
 * Called during app startup via initializeSyncModules().
 */
export async function initializePosSyncModule(): Promise<void> {
  // Already initialized via initializeSyncModules()
  if (posSyncModuleInstance) {
    return;
  }

  const dbPool = getDbPool();
  posSyncModuleInstance = new PosSyncModule({
    module_id: "pos",
    client_type: "POS",
    enabled: true
  });

  await posSyncModuleInstance.initialize({
    database: dbPool,
    logger: console,
    config: { env: process.env.NODE_ENV }
  });

  console.info("PosSyncModule initialized");
}

/**
 * Get the PosSyncModule instance.
 * Throws if not initialized.
 */
export function getPosSyncModule(): PosSyncModule {
  if (!posSyncModuleInstance) {
    throw new Error("PosSyncModule not initialized. Call initializePosSyncModule() first.");
  }
  return posSyncModuleInstance;
}

/**
 * Cleanup sync modules (for graceful shutdown)
 */
export async function cleanupSyncModules(): Promise<void> {
  const cleanupErrors: unknown[] = [];

  try {
    // Stop export scheduler and batch processor
    if (backofficeModuleInstance) {
      try {
        await backofficeModuleInstance.stopExportScheduler();
      } catch (error) {
        cleanupErrors.push(error);
        console.error("❌ Error stopping export scheduler:", error);
      }

      try {
        await backofficeModuleInstance.stopBatchProcessor();
      } catch (error) {
        cleanupErrors.push(error);
        console.error("❌ Error stopping batch processor:", error);
      }
    }

    try {
      await syncModuleRegistry.cleanup();
    } catch (error) {
      cleanupErrors.push(error);
      console.error("❌ Error cleaning up sync module registry:", error);
    }
  } catch (error) {
    console.error("❌ Error cleaning up sync modules:", error);
    cleanupErrors.push(error);
  } finally {
    posSyncModuleInstance = null;
    backofficeModuleInstance = null;

    if (cleanupErrors.length === 0) {
      console.log("✅ Sync modules cleaned up successfully");
    }
  }
}
