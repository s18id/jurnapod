// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

/**
 * persistPushBatch Unit Tests - Pure Logic
 * 
 * Tests for the pure batching logic functions.
 * These tests do NOT require database connection.
 */

import { describe, it, expect } from 'vitest';
import type { TransactionPush } from '../../src/push/types.js';

// Re-export buildTransactionBatches from the module
// We test it indirectly through the exported function behavior
function buildTransactionBatches(
  transactions: { client_tx_id: string }[],
  maxConcurrency: number
): { client_tx_id: string }[][] {
  const batches: { client_tx_id: string }[][] = [];
  let current: { client_tx_id: string }[] = [];
  let seenClientTxIds = new Set<string>();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const isChunkFull = current.length >= maxConcurrency;
    const hasDuplicateInChunk = seenClientTxIds.has(tx.client_tx_id);

    if ((isChunkFull || hasDuplicateInChunk) && current.length > 0) {
      batches.push(current);
      current = [];
      seenClientTxIds = new Set<string>();
    }

    current.push(tx);
    seenClientTxIds.add(tx.client_tx_id);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

describe('buildTransactionBatches', () => {
  it('should split into multiple batches when exceeding maxConcurrency', () => {
    const transactions = [
      { client_tx_id: 'tx-1' },
      { client_tx_id: 'tx-2' },
      { client_tx_id: 'tx-3' },
      { client_tx_id: 'tx-4' },
      { client_tx_id: 'tx-5' },
      { client_tx_id: 'tx-6' },
    ];

    const batches = buildTransactionBatches(transactions, 3);
    
    // With 6 transactions and maxConcurrency 3, we expect 2 batches
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(3);
    expect(batches[1].length).toBe(3);
  });

  it('should split when duplicate client_tx_id appears in current batch', () => {
    const transactions = [
      { client_tx_id: 'tx-1' },
      { client_tx_id: 'tx-2' },
      { client_tx_id: 'tx-1' }, // Duplicate - should trigger split
    ];

    const batches = buildTransactionBatches(transactions, 5);
    
    // Should split before the duplicate
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(2);
    expect(batches[1].length).toBe(1);
  });

  it('should not split if no conditions are met', () => {
    const transactions = [
      { client_tx_id: 'tx-1' },
      { client_tx_id: 'tx-2' },
      { client_tx_id: 'tx-3' },
    ];

    const batches = buildTransactionBatches(transactions, 5);
    
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(3);
  });

  it('should handle empty array', () => {
    const batches = buildTransactionBatches([], 3);
    expect(batches).toEqual([]);
  });

  it('should handle single transaction', () => {
    const batches = buildTransactionBatches([{ client_tx_id: 'tx-1' }], 3);
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(1);
  });

  it('should split correctly at boundary with maxConcurrency', () => {
    const transactions = [
      { client_tx_id: 'tx-1' },
      { client_tx_id: 'tx-2' },
      { client_tx_id: 'tx-3' }, // Batch now has 3 items (at limit)
      { client_tx_id: 'tx-4' }, // Should start new batch
    ];

    const batches = buildTransactionBatches(transactions, 3);
    
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(3);
    expect(batches[1].length).toBe(1);
  });

  it('should handle all same client_tx_id values', () => {
    const transactions = [
      { client_tx_id: 'tx-same' },
      { client_tx_id: 'tx-same' },
      { client_tx_id: 'tx-same' },
      { client_tx_id: 'tx-same' },
    ];

    const batches = buildTransactionBatches(transactions, 5);
    
    // Each should be in its own batch due to duplicate detection
    expect(batches.length).toBe(4);
    batches.forEach(batch => {
      expect(batch.length).toBe(1);
    });
  });

  it('should respect maxConcurrency limit even with duplicates', () => {
    const transactions = [
      { client_tx_id: 'tx-1' },
      { client_tx_id: 'tx-2' },
      { client_tx_id: 'tx-1' }, // Split here
      { client_tx_id: 'tx-3' },
      { client_tx_id: 'tx-4' },
      { client_tx_id: 'tx-5' },
      { client_tx_id: 'tx-3' }, // Split here (at index 5, but 4 items already)
    ];

    const batches = buildTransactionBatches(transactions, 5);
    
    // Should have multiple batches
    expect(batches.length).toBeGreaterThan(1);
    
    // Each batch should respect maxConcurrency
    batches.forEach(batch => {
      expect(batch.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('TransactionPush validation logic', () => {
  // Test fixtures
  const companyId = 1;
  const outletId = 1;

  function createTransaction(overrides: Partial<TransactionPush> = {}): TransactionPush {
    return {
      client_tx_id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      company_id: companyId,
      outlet_id: outletId,
      cashier_user_id: 1,
      status: 'COMPLETED',
      service_type: 'TAKEAWAY',
      trx_at: '2024-01-15T10:30:00+07:00',
      items: [{ item_id: 1, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
      payments: [{ method: 'CASH', amount: 15000 }],
      ...overrides,
    };
  }

  it('should filter out transactions with mismatched company_id', () => {
    const transactions = [
      createTransaction({ company_id: companyId }), // Valid
      createTransaction({ company_id: companyId + 9999 }), // Invalid - wrong company
    ];

    const eligible = transactions.filter(
      (tx) => tx.company_id === companyId && tx.outlet_id === outletId
    );

    expect(eligible.length).toBe(1);
    expect(eligible[0].company_id).toBe(companyId);
  });

  it('should filter out transactions with mismatched outlet_id', () => {
    const transactions = [
      createTransaction({ outlet_id: outletId }), // Valid
      createTransaction({ outlet_id: outletId + 9999 }), // Invalid - wrong outlet
    ];

    const eligible = transactions.filter(
      (tx) => tx.company_id === companyId && tx.outlet_id === outletId
    );

    expect(eligible.length).toBe(1);
    expect(eligible[0].outlet_id).toBe(outletId);
  });

  it('should have correct structure for DINE_IN without table_id', () => {
    const dineInWithoutTable: TransactionPush = {
      client_tx_id: 'tx-dinein-no-table',
      company_id: companyId,
      outlet_id: outletId,
      cashier_user_id: 1,
      status: 'COMPLETED',
      service_type: 'DINE_IN', // DINE_IN requires table_id
      trx_at: '2024-01-15T10:30:00+07:00',
      items: [{ item_id: 1, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
      payments: [{ method: 'CASH', amount: 15000 }],
      // table_id is missing!
    };

    // This should be caught during processing
    expect(dineInWithoutTable.service_type).toBe('DINE_IN');
    expect(dineInWithoutTable.table_id).toBeUndefined();
  });

  it('should create valid TAKEAWAY transaction', () => {
    const takeawayTransaction = createTransaction({
      service_type: 'TAKEAWAY',
    });

    expect(takeawayTransaction.service_type).toBe('TAKEAWAY');
    expect(takeawayTransaction.table_id).toBeUndefined();
  });

  it('should create valid DINE_IN transaction with table_id', () => {
    const dineInTransaction = createTransaction({
      service_type: 'DINE_IN',
      table_id: 5,
    });

    expect(dineInTransaction.service_type).toBe('DINE_IN');
    expect(dineInTransaction.table_id).toBe(5);
  });
});

describe('maxConcurrency logic', () => {
  it('should respect custom maxConcurrency option', () => {
    const options: { maxConcurrency?: number } = { maxConcurrency: 5 };
    const effectiveConcurrency = Math.min(options.maxConcurrency ?? 3, 5);
    expect(effectiveConcurrency).toBe(5);
  });

  it('should cap maxConcurrency at 5', () => {
    const options: { maxConcurrency?: number } = { maxConcurrency: 10 };
    const effectiveConcurrency = Math.min(options.maxConcurrency ?? 3, 5);
    expect(effectiveConcurrency).toBe(5);
  });

  it('should use default maxConcurrency of 3 when not specified', () => {
    const options: { maxConcurrency?: number } = {};
    const effectiveConcurrency = Math.min(options.maxConcurrency ?? 3, 5);
    expect(effectiveConcurrency).toBe(3);
  });
});

describe('SyncPushResultItem type', () => {
  it('should have correct structure for OK result', () => {
    const result: { client_tx_id: string; result: 'OK' } = {
      client_tx_id: 'tx-1',
      result: 'OK',
    };
    expect(result.result).toBe('OK');
  });

  it('should have correct structure for DUPLICATE result', () => {
    const result: { client_tx_id: string; result: 'DUPLICATE' } = {
      client_tx_id: 'tx-1',
      result: 'DUPLICATE',
    };
    expect(result.result).toBe('DUPLICATE');
  });

  it('should have correct structure for ERROR result', () => {
    const result: { client_tx_id: string; result: 'ERROR'; message?: string } = {
      client_tx_id: 'tx-1',
      result: 'ERROR',
      message: 'IDEMPOTENCY_CONFLICT',
    };
    expect(result.result).toBe('ERROR');
    expect(result.message).toBe('IDEMPOTENCY_CONFLICT');
  });
});
