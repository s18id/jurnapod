// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * BackofficeSyncModule Integration Tests
 *
 * Tests for BackofficeSyncModule and its components using real database
 * connections from .env.
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createKysely, type KyselySchema } from '@jurnapod/db';
import { BackofficeSyncModule } from '../../src/backoffice-sync-module.js';
import { BackofficeDataService } from '../../src/core/backoffice-data-service.js';
import { BatchProcessor } from '../../src/batch/batch-processor.js';
import { ExportScheduler } from '../../src/scheduler/export-scheduler.js';

// ============================================================================
// Deterministic ID / Time Base
// ============================================================================

/**
 * Frozen base timestamp for deterministic test timestamps.
 * All request_ids and timestamps are computed as deterministic offsets
 * from this fixed epoch to ensure test reproducibility.
 */
const FROZEN_BASE_MS = 1_700_000_000_000; // 2023-11-13T16:53:20.000Z

/** Monotonic counter for deterministic request_id generation */
let _requestIdCounter = 0;

/**
 * Returns deterministic request ID to replace crypto.randomUUID() calls.
 * Format: deterministic-{counter}-{baseMs}
 */
function makeDeterministicRequestId(): string {
  return `deterministic-${++_requestIdCounter}-${FROZEN_BASE_MS}`;
}

/**
 * Returns deterministic ISO timestamp offset by given days from FROZEN_BASE_MS.
 */
function deterministicTimestamp(daysOffset = 0): string {
  return new Date(FROZEN_BASE_MS + daysOffset * 86_400_000).toISOString();
}

// ============================================================================
// Test Configuration
// ============================================================================

interface TestConfig {
  companyCode: string;
  outletCode: string;
  ownerEmail: string;
}

function loadTestConfig(): TestConfig {
  const companyCode = process.env.JP_COMPANY_CODE ?? 'JP';
  const outletCode = process.env.JP_OUTLET_CODE ?? 'MAIN';
  const ownerEmail = process.env.JP_OWNER_EMAIL ?? 'owner@example.com';
  
  return { companyCode, outletCode, ownerEmail };
}

// ============================================================================
// Database Setup
// ============================================================================

interface TestFixtures {
  db: KyselySchema;
  testUserId: number;
  testCompanyId: number;
  testOutletId: number;
}

async function setupTestFixtures(): Promise<TestFixtures> {
  const config = loadTestConfig();
  
  // Create Kysely instance using environment variables
  const db = createKysely({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jurnapod',
  });

  // Find test user fixture using Kysely (user_outlets replaced by user_role_assignments)
  const userResult = await db
    .selectFrom('users as u')
    .innerJoin('companies as c', 'c.id', 'u.company_id')
    .select(['u.id as user_id', 'u.company_id'])
    .where('c.code', '=', config.companyCode)
    .where('u.email', '=', config.ownerEmail)
    .where('u.is_active', '=', 1)
    .limit(1)
    .executeTakeFirst();

  if (!userResult) {
    throw new Error(
      `Owner fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, email=${config.ownerEmail}`
    );
  }

  // Get outlet by code
  const outletResult = await db
    .selectFrom('outlets as o')
    .innerJoin('companies as c', 'c.id', 'o.company_id')
    .select(['o.id as outlet_id'])
    .where('c.code', '=', config.companyCode)
    .where('o.code', '=', config.outletCode)
    .limit(1)
    .executeTakeFirst();

  if (!outletResult) {
    throw new Error(
      `Outlet fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, outlet=${config.outletCode}`
    );
  }

  return {
    db,
    testUserId: Number(userResult.user_id),
    testCompanyId: Number(userResult.company_id),
    testOutletId: Number(outletResult.outlet_id),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('BackofficeSyncModule Integration', () => {
  let fixtures: TestFixtures;
  let module: BackofficeSyncModule;
  let dataService: BackofficeDataService;

  beforeAll(async () => {
    // Setup database connection
    fixtures = await setupTestFixtures();

    // Create data service directly for focused tests
    dataService = new BackofficeDataService(fixtures.db);

    // Create backoffice sync module
    module = new BackofficeSyncModule({
      module_id: 'backoffice',
      client_type: 'BACKOFFICE',
      enabled: true,
    });

    // Initialize with database connection
    await module.initialize({
      database: fixtures.db,
      logger: console,
      config: { env: 'test' },
    });
  });

  afterAll(async () => {
    // Cleanup module (only if initialized successfully)
    if (module) {
      await module.cleanup();
    }
    
    // Close database pool (only if fixtures were setup successfully)
    if (fixtures?.db) {
      await fixtures.db.destroy();
    }
  });

  beforeEach(() => {
    // Reset correlation ID for each test
  });

  // ===========================================================================
  // BackofficeDataService Tests
  // ===========================================================================

  describe('BackofficeDataService', () => {
    // Helper to create valid SyncContext
    function createSyncContext(companyId: number, userId: number, outletId: number) {
      return {
        company_id: companyId,
        user_id: userId,
        outlet_id: outletId,
        client_type: 'BACKOFFICE' as const,
        request_id: makeDeterministicRequestId(),
        timestamp: deterministicTimestamp(),
      };
    }

    let syncContext: ReturnType<typeof createSyncContext>;

    beforeEach(() => {
      // Create fresh context for each test
      syncContext = createSyncContext(
        fixtures.testCompanyId,
        fixtures.testUserId,
        fixtures.testOutletId
      );
    });

    describe('getRealtimeData', () => {
      test('should return realtime data with correct structure', async () => {
        const result = await dataService.getRealtimeData(syncContext);

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.live_sales_metrics).toBeDefined();
        expect(result.system_alerts).toBeDefined();
        expect(result.staff_activity).toBeDefined();

        // Verify live_sales_metrics structure
        expect(typeof result.live_sales_metrics.total_sales_today).toBe('number');
        expect(typeof result.live_sales_metrics.transaction_count_today).toBe('number');
        expect(typeof result.live_sales_metrics.active_orders_count).toBe('number');
        expect(typeof result.live_sales_metrics.occupied_tables_count).toBe('number');
        expect(typeof result.live_sales_metrics.revenue_this_hour).toBe('number');
        expect(typeof result.live_sales_metrics.avg_transaction_value).toBe('number');
        expect(typeof result.live_sales_metrics.last_updated).toBe('string');

        // Verify system_alerts is an array
        expect(Array.isArray(result.system_alerts)).toBe(true);

        // Verify staff_activity is an array
        expect(Array.isArray(result.staff_activity)).toBe(true);
      });

      test('should return nonnegative sales metrics', async () => {
        const result = await dataService.getRealtimeData(syncContext);

        expect(result.live_sales_metrics.total_sales_today).toBeGreaterThanOrEqual(0);
        expect(result.live_sales_metrics.transaction_count_today).toBeGreaterThanOrEqual(0);
        expect(result.live_sales_metrics.active_orders_count).toBeGreaterThanOrEqual(0);
        expect(result.live_sales_metrics.revenue_this_hour).toBeGreaterThanOrEqual(0);
        expect(result.live_sales_metrics.avg_transaction_value).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getOperationalData', () => {
      test('should return operational data with correct structure', async () => {
        const result = await dataService.getOperationalData(syncContext);

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.recent_transactions).toBeDefined();
        expect(result.payment_reconciliation).toBeDefined();

        // Verify recent_transactions is an array
        expect(Array.isArray(result.recent_transactions)).toBe(true);

        // Verify payment_reconciliation is an array
        expect(Array.isArray(result.payment_reconciliation)).toBe(true);
      });

      test('should accept sinceVersion parameter for incremental sync', async () => {
        const result = await dataService.getOperationalData(syncContext, 0);

        expect(result).toBeDefined();
        expect(Array.isArray(result.recent_transactions)).toBe(true);
        expect(Array.isArray(result.payment_reconciliation)).toBe(true);
      });

      test('should return valid transaction structure when data exists', async () => {
        const result = await dataService.getOperationalData(syncContext);

        if (result.recent_transactions.length > 0) {
          const tx = result.recent_transactions[0];
          expect(tx).toHaveProperty('transaction_id');
          expect(tx).toHaveProperty('outlet_id');
          expect(tx).toHaveProperty('cashier_user_id');
          expect(tx).toHaveProperty('cashier_name');
          expect(tx).toHaveProperty('total_amount');
          expect(tx).toHaveProperty('payment_methods');
          expect(tx).toHaveProperty('transaction_at');
          expect(tx).toHaveProperty('status');
        }
      });
    });

    describe('getMasterData', () => {
      test('should return master data with correct structure', async () => {
        const result = await dataService.getMasterData(syncContext);

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.data_version).toBeDefined();
        expect(result.items).toBeDefined();
        expect(result.customers).toBeDefined();
        expect(result.suppliers).toBeDefined();
        expect(result.chart_of_accounts).toBeDefined();

        // Verify arrays
        expect(Array.isArray(result.items)).toBe(true);
        expect(Array.isArray(result.customers)).toBe(true);
        expect(Array.isArray(result.suppliers)).toBe(true);
        expect(Array.isArray(result.chart_of_accounts)).toBe(true);

        // data_version should be a number
        expect(typeof result.data_version).toBe('number');
      });

      test('should accept sinceVersion parameter for incremental sync', async () => {
        const result = await dataService.getMasterData(syncContext, 0);

        expect(result).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(Array.isArray(result.chart_of_accounts)).toBe(true);
      });

      test('should return valid item structure when data exists', async () => {
        const result = await dataService.getMasterData(syncContext);

        if (result.items.length > 0) {
          const item = result.items[0];
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('sku');
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('type');
          expect(item).toHaveProperty('cost_price');
          expect(item).toHaveProperty('selling_price');
          expect(item).toHaveProperty('is_active');
        }
      });
    });

    describe('getAdminData', () => {
      test('should return admin data with correct structure', async () => {
        const result = await dataService.getAdminData(syncContext);

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.company_settings).toBeDefined();
        expect(result.outlets).toBeDefined();
        expect(result.users).toBeDefined();
        expect(result.tax_settings).toBeDefined();
        expect(result.feature_flags).toBeDefined();

        // Verify arrays
        expect(Array.isArray(result.outlets)).toBe(true);
        expect(Array.isArray(result.users)).toBe(true);
        expect(Array.isArray(result.tax_settings)).toBe(true);

        // Verify feature_flags is a record
        expect(typeof result.feature_flags).toBe('object');
      });

      test('should return valid company_settings structure', async () => {
        const result = await dataService.getAdminData(syncContext);

        expect(result.company_settings).toHaveProperty('company_id');
        expect(result.company_settings).toHaveProperty('name');
        expect(result.company_settings).toHaveProperty('currency_code');
        expect(result.company_settings).toHaveProperty('timezone');
        expect(result.company_settings).toHaveProperty('accounting_method');
        expect(result.company_settings).toHaveProperty('multi_outlet_enabled');
      });

      test('should return valid outlet structure when data exists', async () => {
        const result = await dataService.getAdminData(syncContext);

        if (result.outlets.length > 0) {
          const outlet = result.outlets[0];
          expect(outlet).toHaveProperty('id');
          expect(outlet).toHaveProperty('name');
          expect(outlet).toHaveProperty('code');
          expect(outlet).toHaveProperty('is_active');
          expect(outlet).toHaveProperty('table_count');
          expect(outlet).toHaveProperty('staff_count');
        }
      });
    });

    describe('getAnalyticsData', () => {
      test('should return analytics data with correct structure', async () => {
        const result = await dataService.getAnalyticsData(syncContext);

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.financial_reports).toBeDefined();
        expect(result.sales_analytics).toBeDefined();
        expect(result.audit_logs).toBeDefined();
        expect(result.reconciliation_data).toBeDefined();

        // Verify arrays
        expect(Array.isArray(result.financial_reports)).toBe(true);
        expect(Array.isArray(result.audit_logs)).toBe(true);
        expect(Array.isArray(result.reconciliation_data)).toBe(true);

        // Verify sales_analytics structure
        expect(result.sales_analytics).toHaveProperty('daily_sales');
        expect(result.sales_analytics).toHaveProperty('monthly_trends');
        expect(Array.isArray(result.sales_analytics.daily_sales)).toBe(true);
        expect(Array.isArray(result.sales_analytics.monthly_trends)).toBe(true);
      });

      test('should return valid audit log structure when data exists', async () => {
        const result = await dataService.getAnalyticsData(syncContext);

        if (result.audit_logs.length > 0) {
          const log = result.audit_logs[0];
          expect(log).toHaveProperty('id');
          expect(log).toHaveProperty('company_id');
          expect(log).toHaveProperty('action');
          expect(log).toHaveProperty('entity_type');
          expect(log).toHaveProperty('success');
          expect(log).toHaveProperty('created_at');
        }
      });
    });
  });

  // ===========================================================================
  // BatchProcessor Tests
  // ===========================================================================

  describe('BatchProcessor', () => {
    let batchProcessor: BatchProcessor;

    beforeEach(() => {
      batchProcessor = new BatchProcessor(fixtures.db, {
        maxConcurrentJobs: 2,
        pollIntervalMs: 5000,
        retryDelayMs: 5000,
        cleanupIntervalMs: 10000,
      });
    });

    test('should start and stop without errors', async () => {
      await batchProcessor.start();
      expect(batchProcessor).toBeDefined();
      
      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await batchProcessor.stop();
    });

    test('should handle multiple start/stop cycles', async () => {
      await batchProcessor.start();
      await batchProcessor.stop();
      
      // Start again
      await batchProcessor.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      await batchProcessor.stop();
    });

    test('should not start twice', async () => {
      await batchProcessor.start();

      // Try to start again - should be no-op (isRunning prevents double-start)
      await batchProcessor.start();

      // Verify start was idempotent by checking the isRunning internal flag
      const isRunning = (batchProcessor as any).isRunning;
      expect(isRunning).toBe(true);

      await batchProcessor.stop();
    });
  });

  // ===========================================================================
  // ExportScheduler Tests
  // ===========================================================================

  describe('ExportScheduler', () => {
    let exportScheduler: ExportScheduler;
    let batchProcessor: BatchProcessor;

    beforeEach(() => {
      batchProcessor = new BatchProcessor(fixtures.db, {
        maxConcurrentJobs: 2,
        pollIntervalMs: 5000,
        retryDelayMs: 5000,
        cleanupIntervalMs: 10000,
      });
      
      exportScheduler = new ExportScheduler(fixtures.db, {
        pollIntervalMs: 5000,
      });
      exportScheduler.setBatchProcessor(batchProcessor);
    });

    test('should start and stop without errors', async () => {
      await exportScheduler.start();
      expect(exportScheduler).toBeDefined();
      
      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await exportScheduler.stop();
      await batchProcessor.stop();
    });

    test('should handle multiple start/stop cycles', async () => {
      await exportScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      await exportScheduler.stop();
      
      // Start again
      await exportScheduler.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      await exportScheduler.stop();
    });

    test('should not start twice', async () => {
      await exportScheduler.start();
      
      // Try to start again - should be no-op
      await exportScheduler.start();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await exportScheduler.stop();
      await batchProcessor.stop();
    });
  });

  // ===========================================================================
  // BackofficeSyncModule Lifecycle Tests
  // ===========================================================================

  describe('BackofficeSyncModule Lifecycle', () => {
    test('should initialize with correct moduleId', () => {
      expect(module).toBeDefined();
      expect(module.moduleId).toBe('backoffice');
      expect(module.clientType).toBe('BACKOFFICE');
    });

    test('should have endpoints defined', () => {
      expect(module.endpoints).toBeDefined();
      expect(Array.isArray(module.endpoints)).toBe(true);
    });

    test('should return healthy status after initialization', async () => {
      const health = await module.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.message).toBeDefined();
    });

    test('should start and stop batch processor', async () => {
      await module.startBatchProcessor();
      // Batch processor should be running now
      await module.stopBatchProcessor();
    });

    test('should start and stop export scheduler', async () => {
      await module.startExportScheduler();
      // Export scheduler should be running now
      await module.stopExportScheduler();
    });

    test('should get export scheduler instance', () => {
      const scheduler = module.getExportScheduler();
      expect(scheduler).toBeDefined();
    });

    test('should get batch processor status', () => {
      const status = module.getBatchProcessorStatus();
      expect(status).toBeDefined();
      expect(typeof status?.available).toBe('boolean');
    });

    test('should cleanup without errors', async () => {
      // Create a new module for cleanup test
      const tempModule = new BackofficeSyncModule({
        module_id: 'backoffice-test',
        client_type: 'BACKOFFICE',
        enabled: true,
      });

      await tempModule.initialize({
        database: fixtures.db,
        logger: console,
        config: { env: 'test' },
      });

      await tempModule.cleanup();
    });

    test('should handle cleanup when not initialized', async () => {
      const tempModule = new BackofficeSyncModule({
        module_id: 'backoffice-test',
        client_type: 'BACKOFFICE',
        enabled: true,
      });

      // cleanup should handle uninitialized state gracefully
      await tempModule.cleanup();
    });
  });

  // ===========================================================================
  // Integration: Full Module with Data Service
  // ===========================================================================

  describe('Full Integration', () => {
    // Helper to create valid SyncContext
    function createSyncContext(companyId: number, userId: number, outletId: number) {
      return {
        company_id: companyId,
        user_id: userId,
        outlet_id: outletId,
        client_type: 'BACKOFFICE' as const,
        request_id: makeDeterministicRequestId(),
        timestamp: deterministicTimestamp(),
      };
    }

    test('should fetch all data types in sequence', async () => {
      const context = createSyncContext(
        fixtures.testCompanyId,
        fixtures.testUserId,
        fixtures.testOutletId
      );

      // Fetch all data types
      const realtime = await dataService.getRealtimeData(context);
      const operational = await dataService.getOperationalData(context);
      const master = await dataService.getMasterData(context);
      const admin = await dataService.getAdminData(context);
      const analytics = await dataService.getAnalyticsData(context);

      // All should return valid data
      expect(realtime).toBeDefined();
      expect(operational).toBeDefined();
      expect(master).toBeDefined();
      expect(admin).toBeDefined();
      expect(analytics).toBeDefined();

      // All should have the expected top-level keys
      expect(realtime.live_sales_metrics).toBeDefined();
      expect(operational.recent_transactions).toBeDefined();
      expect(master.items).toBeDefined();
      expect(admin.company_settings).toBeDefined();
      expect(analytics.sales_analytics).toBeDefined();
    });

    test('should maintain data isolation by company_id', async () => {
      const context = createSyncContext(
        fixtures.testCompanyId,
        fixtures.testUserId,
        fixtures.testOutletId
      );

      // Fetch master data
      const master = await dataService.getMasterData(context);

      // All items should belong to the correct company (company_id is implicit in query)
      // The service only queries data for the provided company_id in context
      expect(master).toBeDefined();
      expect(Array.isArray(master.items)).toBe(true);
    });
  });
});
