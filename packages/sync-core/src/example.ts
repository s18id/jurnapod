// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Example usage of the modular sync architecture
 */

import { syncModuleRegistry, type SyncModuleInitContext } from "./index.js";

// Example of how to register and use sync modules
export async function demonstrateModularSync() {
  // 1. Create initialization context
  // NOTE: In production, pass a real DbConn instance:
  //   import { createDbPool, DbConn } from '@jurnapod/db';
  //   const pool = createDbPool({ host: '...', port: 3306, user: '...', password: '...', database: '...' });
  //   const dbConn = new DbConn(pool);
  // For this example, we use a placeholder that satisfies the type
  const initContext: SyncModuleInitContext = {
    database: null as any, // Replace with real DbConn in production
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
  //   poll_interval_ms: 30_000  // 30 seconds operational polling
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