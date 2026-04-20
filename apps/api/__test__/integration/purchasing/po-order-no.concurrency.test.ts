// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Regression test for: PO-001 - Purchase Order order_no race condition
// Bug: Math.random() based order numbers can collide under concurrent load,
// causing 409 CONFLICT errors for system-generated values.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('purchase-orders - Concurrency: Order Number Generation', { timeout: 60000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // Regression: PO-001 - Race Condition in order_no generation
  // =============================================================================

  describe('REGRESSION-PO-001: Concurrent PO creation must not produce duplicate order_no', () => {
    it('should assign unique order_no for concurrent PO creations (P1)', async () => {
      // Arrange
      const concurrency = 10;
      const operations: Promise<any>[] = [];

      // Act: Create multiple POs concurrently
      for (let i = 0; i < concurrency; i++) {
        operations.push(
          fetch(`${baseUrl}/api/purchasing/orders`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              supplier_id: 1,
              order_date: '2026-04-20',
              lines: [{ qty: '1', unit_price: '1000.00' }]
            })
          }).then(r => r.json())
        );
      }

      const results = await Promise.allSettled(operations);

      // Assert: No CONFLICT errors from duplicate order_no
      const conflictResults = results.filter(
        r => r.status === 'fulfilled' && r.value.error?.code === 'CONFLICT'
      );
      // TODO: Before fix, collisions may cause CONFLICT. After fix, zero conflicts.
      expect(conflictResults).toHaveLength(0);

      // Assert: All successful POs have unique order_no values
      const successful = results.filter(
        r => r.status === 'fulfilled' && r.value.success
      );
      const orderNos = successful.map(r => (r as any).value.data.order_no);
      const uniqueOrderNos = new Set(orderNos);
      expect(uniqueOrderNos.size).toBe(orderNos.length);
    });

    it('should NOT allow duplicate order_no from race condition (P1)', async () => {
      // This test specifically targets the Math.random() collision
      // Before fix: Two concurrent requests can generate the same order_no
      // After fix: Each request gets a unique order_no via atomic counter or UUID

      // TODO: Implement deterministic collision simulation if possible
      // (e.g., by mocking Date.now() or Math.random() in test setup)
    });
  });
});
