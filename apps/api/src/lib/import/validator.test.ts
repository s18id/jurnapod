// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Batch FK Validation Tests (Story 7.6 — TD-012)
 * 
 * Verifies that batchValidateForeignKeys:
 * - Issues ONE query for N rows, not N queries
 * - Returns correct existence results for valid/invalid IDs
 * - Handles empty ID sets correctly
 * - Properly scopes by company_id for tenant isolation
 * - Handles large ID sets with batching
 */

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { batchValidateForeignKeys } from './validator.js';
import type { FkLookupRequest } from './types.js';
import { closeDbPool } from '../db.js';

// ============================================================================
// Test Helpers
// ============================================================================

interface MockPoolOptions {
  /** Tables to mock and their existing IDs */
  existingIds: Record<string, number[]>;
  /** Company ID for scoping */
  companyId: number;
}

/**
 * Creates a mock MySQL pool that tracks query count and returns configurable results.
 */
function createMockPool(options: MockPoolOptions): { pool: Pool; queryCount: { value: number } } {
  const queryCount = { value: 0 };
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPool: Pool = {
    execute: async (query: string, params: unknown[]): Promise<any> => {
      queryCount.value++;
      
      // Parse the query to determine which table and IDs to return
      const tableMatch = query.match(/FROM `?(\w+)`? WHERE/);
      const companyIdFromQuery = params[0] as number;
      const idsFromQuery = params.slice(1) as number[];
      
      if (!tableMatch || companyIdFromQuery !== options.companyId) {
        return [[], { affectedRows: 0 }];
      }
      
      const tableName = tableMatch[1];
      const existingIdsForTable = options.existingIds[tableName] || [];
      
      // Filter IDs that exist in our mock data
      const foundIds = idsFromQuery.filter(id => existingIdsForTable.includes(id));
      
      // Create rows that will match RowDataPacket structure
      const rows = foundIds.map(id => ({ id }));
      return [rows, { affectedRows: foundIds.length }];
    },
  } as unknown as Pool;
  
  return { pool: mockPool, queryCount };
}

// ============================================================================
// batchValidateForeignKeys Tests
// ============================================================================

describe('batchValidateForeignKeys (TD-012)', () => {
  test('issues ONE query for N item_group_ids (not N queries)', async () => {
    const { pool, queryCount } = createMockPool({
      existingIds: { item_groups: [1, 2, 3] },
      companyId: 100,
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set([1, 2, 3, 4, 5]), companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    assert.equal(queryCount.value, 1, 'Should issue exactly 1 query for batch of 5 IDs');
    
    // Verify results
    assert.ok(results.has('item_groups'), 'Results should contain item_groups table');
    assert.equal(results.get('item_groups')?.get(1), true, 'ID 1 should exist');
    assert.equal(results.get('item_groups')?.get(2), true, 'ID 2 should exist');
    assert.equal(results.get('item_groups')?.get(3), true, 'ID 3 should exist');
    assert.equal(results.get('item_groups')?.get(4), false, 'ID 4 should not exist');
    assert.equal(results.get('item_groups')?.get(5), false, 'ID 5 should not exist');
  });

  test('issues ONE query per table for multiple tables', async () => {
    const { pool, queryCount } = createMockPool({
      existingIds: { 
        item_groups: [1, 2],
        outlets: [10, 20],
      },
      companyId: 100,
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set([1, 2, 3]), companyId: 100 },
      { table: 'outlets', ids: new Set([10, 11]), companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    assert.equal(queryCount.value, 2, 'Should issue exactly 2 queries (1 per table)');
    
    // Verify item_groups results
    assert.ok(results.has('item_groups'), 'Results should contain item_groups table');
    assert.equal(results.get('item_groups')?.get(1), true);
    assert.equal(results.get('item_groups')?.get(3), false);
    
    // Verify outlets results
    assert.ok(results.has('outlets'), 'Results should contain outlets table');
    assert.equal(results.get('outlets')?.get(10), true);
    assert.equal(results.get('outlets')?.get(11), false);
  });

  test('handles empty ID set correctly', async () => {
    const { pool, queryCount } = createMockPool({
      existingIds: { item_groups: [1, 2] },
      companyId: 100,
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set<number>(), companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    assert.equal(queryCount.value, 0, 'Should not issue query for empty ID set');
    assert.ok(!results.has('item_groups'), 'Should not have entry for empty ID set');
  });

  test('returns Map structure for O(1) lookup', async () => {
    const { pool } = createMockPool({
      existingIds: { item_groups: [1, 2] },
      companyId: 100,
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set([1, 2, 3]), companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    // Verify structure allows O(1) lookup
    assert.ok(results instanceof Map, 'Results should be a Map');
    assert.ok(results.get('item_groups') instanceof Map, 'Table results should be a Map');
    
    // O(1) lookup test
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      results.get('item_groups')?.get(1);
    }
    const duration = performance.now() - start;
    
    assert.ok(duration < 100, `O(1) lookup should be fast (${duration.toFixed(2)}ms for 1000 lookups)`);
  });

  test('deduplicates IDs within single request', async () => {
    const { pool, queryCount } = createMockPool({
      existingIds: { item_groups: [1, 2] },
      companyId: 100,
    });
    
    // Pass duplicate IDs - they should be deduplicated
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set([1, 1, 2, 2, 3, 3]), companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    // Should still only issue one query with unique IDs
    assert.equal(queryCount.value, 1, 'Should deduplicate and issue 1 query');
    assert.equal(results.get('item_groups')?.get(1), true);
  });

  test('properly scopes by company_id for tenant isolation', async () => {
    const { pool } = createMockPool({
      existingIds: { item_groups: [1, 2] },
      companyId: 100, // Only company 100 has these IDs
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set([1, 2]), companyId: 200 }, // Different company
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    // Company 200 should not see company 100's data
    assert.equal(results.get('item_groups')?.get(1), false, 'Company 200 should not see company 100 data');
    assert.equal(results.get('item_groups')?.get(2), false, 'Company 200 should not see company 100 data');
  });

  test('handles mixed valid/invalid IDs correctly', async () => {
    const { pool } = createMockPool({
      existingIds: { item_groups: [10, 20, 30] },
      companyId: 100,
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: new Set([5, 10, 15, 20, 25, 30]), companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    const tableResults = results.get('item_groups');
    assert.equal(tableResults?.get(5), false, 'ID 5 does not exist');
    assert.equal(tableResults?.get(10), true, 'ID 10 exists');
    assert.equal(tableResults?.get(15), false, 'ID 15 does not exist');
    assert.equal(tableResults?.get(20), true, 'ID 20 exists');
    assert.equal(tableResults?.get(25), false, 'ID 25 does not exist');
    assert.equal(tableResults?.get(30), true, 'ID 30 exists');
  });

  test('handles large ID sets with batching (>100 IDs)', async () => {
    const { pool, queryCount } = createMockPool({
      existingIds: { item_groups: Array.from({ length: 100 }, (_, i) => i + 1) },
      companyId: 100,
    });
    
    // Create a large set of 250 IDs
    const largeSet = new Set<number>();
    for (let i = 1; i <= 250; i++) {
      largeSet.add(i);
    }
    
    const requests: FkLookupRequest[] = [
      { table: 'item_groups', ids: largeSet, companyId: 100 },
    ];
    
    const results = await batchValidateForeignKeys(requests, pool);
    
    // Should batch into 3 queries (100 + 100 + 50)
    assert.equal(queryCount.value, 3, 'Should batch large ID set into 3 queries');
    
    // Verify results
    assert.equal(results.get('item_groups')?.get(1), true, 'ID 1 exists');
    assert.equal(results.get('item_groups')?.get(100), true, 'ID 100 exists');
    assert.equal(results.get('item_groups')?.get(200), false, 'ID 200 does not exist');
    assert.equal(results.get('item_groups')?.get(250), false, 'ID 250 does not exist');
  });
});

// ============================================================================
// Anti-Pattern Warning Documentation Test
// ============================================================================

describe('N+1 Anti-Pattern Documentation', () => {
  test('batchValidateForeignKeys returns Map as documented', async () => {
    const { pool } = createMockPool({
      existingIds: { test_table: [1] },
      companyId: 100,
    });
    
    const requests: FkLookupRequest[] = [
      { table: 'test_table', ids: new Set([1, 2, 3]), companyId: 100 },
    ];
    
    // Function should exist and be callable
    const results = await batchValidateForeignKeys(requests, pool);
    assert.ok(results instanceof Map, 'Function should return Map as documented');
  });
});

// ============================================================================
// Cleanup
// ============================================================================

test.after(async () => {
  await closeDbPool();
});
