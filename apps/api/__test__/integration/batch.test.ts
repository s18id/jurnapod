// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
//
// Unit tests for batch processing utility
// Run with: npm run test:unit:single -w @jurnapod/api src/lib/batch.test.ts

import assert from "node:assert/strict";
import { describe, test } from 'vitest';
import { withBatchProcessing, chunkArray } from "../../src/lib/batch";

describe("chunkArray()", () => {
  test("chunks array into equal-sized chunks", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const chunks = chunkArray(items, 2);

    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks[0], [1, 2]);
    assert.deepEqual(chunks[1], [3, 4]);
    assert.deepEqual(chunks[2], [5, 6]);
  });

  test("handles uneven chunking", () => {
    const items = [1, 2, 3, 4, 5];
    const chunks = chunkArray(items, 2);

    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks[0], [1, 2]);
    assert.deepEqual(chunks[1], [3, 4]);
    assert.deepEqual(chunks[2], [5]);
  });

  test("handles items smaller than chunk size", () => {
    const items = [1, 2];
    const chunks = chunkArray(items, 5);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], [1, 2]);
  });

  test("handles empty array", () => {
    const items: number[] = [];
    const chunks = chunkArray(items, 2);

    assert.equal(chunks.length, 0);
  });

  test("handles single item", () => {
    const items = [1];
    const chunks = chunkArray(items, 2);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], [1]);
  });
});

describe("withBatchProcessing()", () => {
  test("processes all items in batches", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const processed: number[] = [];

    const results = await withBatchProcessing(
      items,
      {
        batchSize: 2,
        processor: async (batch) => {
          processed.push(...batch);
          return batch.map((x) => x * 2);
        },
      }
    );

    assert.deepEqual(processed, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
  });

  test("calls onBatchComplete after each batch", async () => {
    const items = [1, 2, 3, 4];
    const batchCompletions: number[][] = [];

    await withBatchProcessing(items, {
      batchSize: 2,
      processor: async (batch) => batch,
      onBatchComplete: (index, results) => {
        batchCompletions.push([index, ...results]);
      },
    });

    assert.equal(batchCompletions.length, 2);
    assert.deepEqual(batchCompletions[0], [0, 1, 2]); // batch 0: [1, 2]
    assert.deepEqual(batchCompletions[1], [1, 3, 4]); // batch 1: [3, 4]
  });

  test("adds delay between batches when delayBetweenBatches > 0", async () => {
    const items = [1, 2, 3, 4];
    const batchTimes: number[] = [];

    await withBatchProcessing(items, {
      batchSize: 2,
      delayBetweenBatches: 50,
      processor: async (batch, index) => {
        batchTimes.push(Date.now());
        return batch;
      },
    });

    // Should have delay between batches
    const timeBetweenBatches = batchTimes[1] - batchTimes[0];
    assert.ok(timeBetweenBatches >= 45, `Expected >= 45ms, got ${timeBetweenBatches}ms`);
  });

  test("does not add delay after last batch", async () => {
    const items = [1, 2, 3, 4];
    const startTime = Date.now();
    let endTime = 0;

    await withBatchProcessing(items, {
      batchSize: 2,
      delayBetweenBatches: 100,
      processor: async (batch, index) => {
        if (index === 1) {
          // This is the last batch
          endTime = Date.now();
        }
        return batch;
      },
    });

    // End time should be close to start time since there's no delay after last batch
    const totalTime = endTime - startTime;
    // Should be less than 150ms since only 1 delay (100ms) should occur
    assert.ok(totalTime < 150, `Expected < 150ms, got ${totalTime}ms`);
  });

  test("handles empty items array", async () => {
    const items: number[] = [];
    let processorCalled = false;

    const results = await withBatchProcessing(items, {
      batchSize: 2,
      processor: async (batch) => {
        processorCalled = true;
        return batch;
      },
    });

    assert.equal(results.length, 0);
    assert.equal(processorCalled, false);
  });

  test("processes remaining items when not evenly divisible", async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];

    await withBatchProcessing(items, {
      batchSize: 2,
      processor: async (batch) => {
        processed.push(...batch);
        return batch;
      },
    });

    assert.deepEqual(processed, [1, 2, 3, 4, 5]);
  });

  test("batchIndex increments correctly", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const batchIndices: number[] = [];

    await withBatchProcessing(items, {
      batchSize: 2,
      processor: async (_batch, index) => {
        batchIndices.push(index);
        return [];
      },
    });

    assert.deepEqual(batchIndices, [0, 1, 2]);
  });
});
