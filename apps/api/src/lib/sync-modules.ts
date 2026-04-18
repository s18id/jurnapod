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

// Lazy init single-flight guard for async accessor
let posLazyInitPromise: Promise<void> | null = null;

// Startup init single-flight guard
let syncModulesInitPromise: Promise<void> | null = null;

const POS_MODULE_CONFIG = {
  module_id: "pos",
  client_type: "POS",
  enabled: true,
  poll_interval_ms: 30_000
} as const;

const BACKOFFICE_MODULE_CONFIG = {
  module_id: "backoffice",
  client_type: "BACKOFFICE",
  enabled: true,
  poll_interval_ms: 120_000
} as const;

function buildSyncInitContext() {
  return {
    database: getDbPool(),
    logger: console,
    config: {
      enableAuditLogging: true,
      defaultRetryAttempts: 3,
      environment: process.env.NODE_ENV || "development"
    }
  };
}

function createPosModule(): PosSyncModule {
  return new PosSyncModule(POS_MODULE_CONFIG);
}

function createBackofficeModule(): BackofficeSyncModule {
  return new BackofficeSyncModule(BACKOFFICE_MODULE_CONFIG);
}

/**
 * Initialize sync modules for the API server
 *
 * POS module is considered initialized as soon as registry.initialize() succeeds.
 * Backoffice startup failures (batch processor / export scheduler) do NOT affect
 * POS availability — they only affect the backoffice singleton.
 */
export async function initializeSyncModules(): Promise<void> {
  if (syncModulesInitPromise) {
    return syncModulesInitPromise;
  }

  syncModulesInitPromise = (async () => {
  let posModule: PosSyncModule | null = null;
  let backofficeModule: BackofficeSyncModule | null = null;
  let registryInitSucceeded = false;

  try {
    // Create and register POS sync module
    posModule = createPosModule();

    // Create and register Backoffice sync module
    backofficeModule = createBackofficeModule();

    // Register the modules
    syncModuleRegistry.register(posModule);
    syncModuleRegistry.register(backofficeModule);

    // Initialize registry after modules are registered
    await syncModuleRegistry.initialize(buildSyncInitContext());

    registryInitSucceeded = true;

    // POS singleton published immediately after registry init — backoffice
    // startup failures must not affect POS availability.
    posSyncModuleInstance = posModule;

    // Backoffice singleton is also published here, but backoffice-specific
    // startup (batch/export) runs below and may fail independently.
    backofficeModuleInstance = backofficeModule;

    // Start batch processor and export scheduler (backoffice-only concern).
    // Failure here does NOT affect POS singleton or sync/push/pull availability.
    await backofficeModule.startBatchProcessor();
    await backofficeModule.startExportScheduler();

    console.log("✅ Sync modules initialized successfully");
    console.log(`   - POS sync module: registered`);
    console.log(`   - Backoffice sync module: registered`);
    console.log(`   - Batch processor: RUNNING`);
    console.log(`   - Export scheduler: RUNNING`);

  } catch (error) {
    // Clean up registry if registry init failed (no modules were ever registered).
    if (!registryInitSucceeded) {
      try {
        await syncModuleRegistry.cleanup();
      } catch (cleanupError) {
        console.error("❌ Failed to cleanup sync registry after init failure:", cleanupError);
      }
    } else {
      // Registry initialized — POS is registered and available.
      // Only backoffice-specific resources need best-effort cleanup.
      // posSyncModuleInstance and backofficeModuleInstance remain valid for
      // callers that handle their own cleanup via cleanupSyncModules().
    }

    // Best-effort backoffice cleanup (POS is unaffected).
    if (backofficeModuleInstance) {
      try {
        await backofficeModuleInstance.stopBatchProcessor();
      } catch { /* best-effort */ }
      try {
        await backofficeModuleInstance.stopExportScheduler();
      } catch { /* best-effort */ }
    }

    console.error("❌ Failed to initialize sync modules:", error);
    throw error;
  } finally {
    if (!posSyncModuleInstance && !backofficeModuleInstance) {
      // failed before any usable singleton state; allow retries
      syncModulesInitPromise = null;
    }
  }
  })();

  return syncModulesInitPromise;
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
 * Synchronous safe accessor — throws if not yet initialized.
 * Prefer getPosSyncModuleAsync() in route handlers to avoid throw-on-cold-start.
 */
export function getPosSyncModule(): PosSyncModule {
  if (!posSyncModuleInstance) {
    throw new Error("PosSyncModule not initialized. Call initializeSyncModules() first.");
  }
  return posSyncModuleInstance;
}

/**
 * Async safe accessor with single-flight lazy initialization.
 * If initializeSyncModules() has never run, performs a minimal inline init.
 * Safe to call from concurrent route handlers — only one init succeeds.
 *
 * Registers lazy-init instance in syncModuleRegistry so health/lifecycle state
 * stays consistent with startup initialization behavior.
 *
 * Returns the initialized PosSyncModule instance.
 */
export async function getPosSyncModuleAsync(): Promise<PosSyncModule> {
  if (posSyncModuleInstance) {
    return posSyncModuleInstance;
  }

  if (syncModulesInitPromise) {
    try {
      await syncModulesInitPromise;
    } catch {
      // Startup may fail on backoffice while POS is still usable/published.
    }

    if (posSyncModuleInstance) {
      return posSyncModuleInstance;
    }
  }

  const registeredPosModule = syncModuleRegistry.getModule("pos");
  if (registeredPosModule) {
    posSyncModuleInstance = registeredPosModule as PosSyncModule;
    return posSyncModuleInstance;
  }

  // Single-flight guard — initialize exactly once per lifecycle.
  posLazyInitPromise ??= (async () => {
    const module = createPosModule();
    await module.initialize(buildSyncInitContext());

    // Keep registry-consistent state for health checks and lifecycle introspection.
    try {
      syncModuleRegistry.register(module);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("already registered")) {
        throw error;
      }

      const existing = syncModuleRegistry.getModule("pos");
      if (existing) {
        posSyncModuleInstance = existing as PosSyncModule;
        return;
      }
    }

    posSyncModuleInstance = module;
    console.info("PosSyncModule lazy-initialized on demand");
  })();

  await posLazyInitPromise;

  if (!posSyncModuleInstance) {
    throw new Error("PosSyncModule not initialized. Lazy init failed.");
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
    // Reset lazy init guard so re-get after cleanup succeeds cleanly.
    posLazyInitPromise = null;
    syncModulesInitPromise = null;
    posSyncModuleInstance = null;
    backofficeModuleInstance = null;

    if (cleanupErrors.length === 0) {
      console.log("✅ Sync modules cleaned up successfully");
    }
  }
}
