// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Example usage of the modular sync architecture
 */

import { syncModuleRegistry, type SyncModuleInitContext } from "./index.js";

// Example of how to register and use sync modules
export async function demonstrateModularSync() {
  // 1. Create initialization context
  const initContext: SyncModuleInitContext = {
    database: {}, // Database connection pool
    logger: console, // Logger instance
    config: { // Environment configuration
      enableAuditLogging: true,
      defaultRetryAttempts: 3
    }
  };

  // 2. Initialize the registry
  await syncModuleRegistry.initialize(initContext);

  // 3. Register module factories (this would be done at app startup)
  // syncModuleRegistry.registerFactory('pos', (config) => new PosSyncModule(config));
  // syncModuleRegistry.registerFactory('backoffice', (config) => new BackofficeSyncModule(config));

  // 4. Create modules with specific configurations
  // const posModule = await syncModuleRegistry.createModule('pos', {
  //   module_id: 'pos',
  //   client_type: 'POS',
  //   enabled: true,
  //   frequencies: {
  //     realtime: 'websocket',
  //     operational: 30_000,    // 30 seconds
  //     master: 300_000,        // 5 minutes
  //     admin: 'startup'        // On app start only
  //   }
  // });

  // 5. Health check all modules
  const healthResults = await syncModuleRegistry.healthCheck();
  console.log('Sync module health:', healthResults);

  // 6. Get all endpoints for API registration
  const endpoints = syncModuleRegistry.getAllEndpoints();
  console.log(`Found ${endpoints.length} sync endpoints`);

  // 7. Cleanup when done
  await syncModuleRegistry.cleanup();
}

// Example sync request handler that would be used in API routes
export async function handleSyncRequest(
  moduleId: string,
  tierParam: string,
  requestData: any
) {
  const module = syncModuleRegistry.getModule(moduleId);
  if (!module) {
    throw new Error(`Module '${moduleId}' not found`);
  }

  // Validate tier parameter
  const validTiers = ['REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS'];
  if (!validTiers.includes(tierParam)) {
    throw new Error(`Invalid tier: ${tierParam}`);
  }

  // Create sync request
  const syncRequest = {
    tier: tierParam as any,
    operation: 'PULL' as const,
    since_version: requestData.since_version,
    limit: requestData.limit || 100,
    context: {
      company_id: requestData.company_id,
      outlet_id: requestData.outlet_id,
      user_id: requestData.user_id,
      client_type: module.clientType,
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }
  };

  // Handle the sync request
  return await module.handleSync(syncRequest);
}

// Example of tier-based endpoint registration
export function registerModularSyncEndpoints(app: any) {
  // Get all registered modules
  const modules = syncModuleRegistry.listModuleIds();
  
  for (const moduleId of modules) {
    const module = syncModuleRegistry.getModule(moduleId);
    if (!module) continue;

    const supportedTiers = module.getSupportedTiers();

    // Register tier-specific endpoints
    for (const tier of supportedTiers) {
      const path = `/api/sync/${moduleId}/${tier.toLowerCase()}`;
      
      app.get(path, async (req: any, res: any) => {
        try {
          const result = await handleSyncRequest(moduleId, tier, req.query);
          res.json(result);
        } catch (error) {
          res.status(400).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      });
      
      console.log(`Registered sync endpoint: ${path}`);
    }
  }
}