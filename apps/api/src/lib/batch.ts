// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Batch Processing Utility with Configurable Delays
 * 
 * Provides batch processing with optional delays between batches
 * to reduce lock contention during large backfill operations.
 */

import { sleep } from "./retry";

/**
 * Batch processing options
 */
export interface BatchProcessingOptions<T, R> {
  /** Number of items to process per batch */
  batchSize: number;
  /** Delay in milliseconds between batches (default: 0) */
  delayBetweenBatches?: number;
  /** Function to process each batch */
  processor: (batch: T[], batchIndex: number) => Promise<R[]>;
  /** Callback invoked after each batch */
  onBatchComplete?: (batchIndex: number, results: R[]) => void;
}

/**
 * Process items in batches with optional delay between batches
 * 
 * This utility is useful for large backfill operations where
 * adding delays between batches can reduce lock contention.
 * 
 * @param items - Items to process
 * @param options - Batch processing configuration
 * @returns All results from processing all batches
 * 
 * @example
 * ```typescript
 * const results = await withBatchProcessing(
 *   items,
 *   {
 *     batchSize: 100,
 *     delayBetweenBatches: 100, // 100ms delay between batches
 *     processor: async (batch) => {
 *       // Process batch
 *       return results;
 *     }
 *   }
 * );
 * ```
 */
export async function withBatchProcessing<T, R>(
  items: T[],
  options: BatchProcessingOptions<T, R>
): Promise<R[]> {
  const {
    batchSize,
    delayBetweenBatches = 0,
    processor,
    onBatchComplete,
  } = options;

  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize);
    const batch = items.slice(i, i + batchSize);

    // Process the batch
    const batchResults = await processor(batch, batchIndex);
    results.push(...batchResults);

    // Notify callback
    onBatchComplete?.(batchIndex, batchResults);

    // Add delay between batches (except after the last batch)
    if (batchIndex < totalBatches - 1 && delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Simple chunking utility that splits an array into chunks
 * 
 * @param items - Items to chunk
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 * 
 * @example
 * ```typescript
 * const chunks = chunkArray([1, 2, 3, 4, 5], 2);
 * // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
