// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Batch Processing for Import Operations
 * 
 * Provides configurable batch processing with transaction support,
 * progress tracking, and graceful error handling.
 */

import type {
  BatchOptions,
  BatchContext,
  BatchResult,
  BatchProcessingResult,
  BatchProcessor,
  ProgressInfo,
  ImportError,
  ProgressCallback,
} from './types.js';
import { getDb } from '../db.js';
import { withTransactionRetry } from '@jurnapod/db';
import type { Kysely } from 'kysely';
import { createValidationError } from './validator.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ERRORS = Infinity;
const DEFAULT_CONTINUE_ON_ERROR = true;

// ============================================================================
// Batch Processor
// ============================================================================

/**
 * Process items in batches with transaction support
 * 
 * @param items - Items to process
 * @param processor - Batch processor implementation
 * @param options - Batch processing options
 * @returns Aggregated results from all batches
 */
export async function processBatches<T>(
  items: T[],
  processor: BatchProcessor<T>,
  options: BatchOptions
): Promise<BatchProcessingResult<T>> {
  const {
    companyId,
    outletId,
    userId,
    importSessionId,
    batchSize = DEFAULT_BATCH_SIZE,
    maxErrors = DEFAULT_MAX_ERRORS,
    continueOnError = DEFAULT_CONTINUE_ON_ERROR,
    onProgress,
    startRowNumber = 1,
  } = options;

  const processed: T[] = [];
  const failed: Array<{ item: T; error: ImportError }> = [];
  const startTime = new Date();
  const totalBatches = Math.ceil(items.length / batchSize);
  
  let currentBatch = 0;
  let batchesCompleted = 0;
  let batchesFailed = 0;
  let errorsEncountered = 0;
  let aborted = false;

  // Create batch context with tenant isolation
  const context: BatchContext = {
    companyId,
    outletId,
    userId,
    importSessionId,
    startTime,
  };

  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    // Check if we've hit max errors
    if (errorsEncountered >= maxErrors) {
      aborted = true;
      break;
    }

    currentBatch++;
    const batchItems = items.slice(i, i + batchSize);
    const batchStartTime = Date.now();

    // Create progress info
    const progress: ProgressInfo = {
      totalRows: items.length,
      processedRows: processed.length,
      currentBatch,
      totalBatches,
      batchRowsProcessed: 0,
      errorsEncountered,
      phase: 'processing',
    };

    // Report progress
    onProgress?.(progress);

    // Process batch
    let batchResult: BatchResult<T>;
    try {
      batchResult = await processor.processBatch(batchItems, context);
      batchResult.durationMs = Date.now() - batchStartTime;
    } catch (error) {
      // Handle unexpected batch error
      const importError = createValidationError(
        startRowNumber + i,
        'BATCH_PROCESSING_ERROR',
        `Batch ${currentBatch} failed: ${error instanceof Error ? error.message : String(error)}`
      );

      // Mark all items in batch as failed
      for (const item of batchItems) {
        failed.push({ item, error: importError });
        errorsEncountered++;
      }

      // Call error handler if provided
      await processor.onBatchError?.(
        error instanceof Error ? error : new Error(String(error)),
        batchItems
      );

      if (!continueOnError) {
        aborted = true;
        break;
      }

      continue;
    }

    // Handle batch result
    if (batchResult.committed) {
      batchesCompleted++;
      processed.push(...batchResult.processed);
      await processor.onBatchSuccess?.(batchResult.processed);
    } else {
      batchesFailed++;
      // Add successful items to processed (they didn't error during processing)
      processed.push(...batchResult.processed);

      // Add failed items to failed list
      for (const fail of batchResult.failed) {
        failed.push(fail);
        errorsEncountered++;
      }

      if (!continueOnError) {
        aborted = true;
        break;
      }
    }

    // Update progress after batch
    progress.processedRows = processed.length;
    progress.batchRowsProcessed = batchItems.length;
    progress.errorsEncountered = errorsEncountered;
    onProgress?.(progress);
  }

  const totalDurationMs = Date.now() - startTime.getTime();

  return {
    processed,
    failed,
    totalBatches: currentBatch,
    batchesCompleted,
    batchesFailed,
    totalRows: items.length,
    totalErrors: failed.length,
    totalDurationMs,
    aborted,
  };
}

/**
 * Process batches with database transaction support
 * 
 * This function wraps processBatches and provides automatic transaction
 * management per batch using Kysely transactions.
 */
export async function processBatchesWithTransaction<T>(
  items: T[],
  processor: BatchProcessor<T>,
  context: BatchContext,
  options: BatchOptions
): Promise<BatchProcessingResult<T>> {
  const db = getDb();
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    maxErrors = DEFAULT_MAX_ERRORS,
    continueOnError = DEFAULT_CONTINUE_ON_ERROR,
    onProgress,
    startRowNumber = 1,
  } = options;

  const processed: T[] = [];
  const failed: Array<{ item: T; error: ImportError }> = [];
  const startTime = new Date();
  const totalBatches = Math.ceil(items.length / batchSize);
  
  let currentBatch = 0;
  let batchesCompleted = 0;
  let batchesFailed = 0;
  let errorsEncountered = 0;
  let aborted = false;

  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    // Check if we've hit max errors
    if (errorsEncountered >= maxErrors) {
      aborted = true;
      break;
    }

    currentBatch++;
    const batchItems = items.slice(i, i + batchSize);
    const batchStartTime = Date.now();

    // Create progress info
    const progress: ProgressInfo = {
      totalRows: items.length,
      processedRows: processed.length,
      currentBatch,
      totalBatches,
      batchRowsProcessed: 0,
      errorsEncountered,
      phase: 'processing',
    };

    // Report progress
    onProgress?.(progress);

    let batchResult: BatchResult<T>;

    try {
      // Execute batch within a Kysely transaction with deadlock retry
      batchResult = await withTransactionRetry(db, async (trx) => {
        // Process batch with transaction handle
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await processor.processBatch(batchItems, { ...context, connection: trx as any });
        result.durationMs = Date.now() - batchStartTime;
        return result;
      });

      if (batchResult.committed) {
        batchesCompleted++;
        processed.push(...batchResult.processed);
        await processor.onBatchSuccess?.(batchResult.processed);
      } else {
        batchesFailed++;

        // Mark items as failed
        for (const fail of batchResult.failed) {
          failed.push(fail);
          errorsEncountered++;
        }

        if (!continueOnError) {
          aborted = true;
          break;
        }
      }
    } catch (error) {
      const importError = createValidationError(
        startRowNumber + i,
        'BATCH_PROCESSING_ERROR',
        `Batch ${currentBatch} failed: ${error instanceof Error ? error.message : String(error)}`
      );

      // Mark all items in batch as failed
      for (const item of batchItems) {
        failed.push({ item, error: importError });
        errorsEncountered++;
      }

      await processor.onBatchError?.(
        error instanceof Error ? error : new Error(String(error)),
        batchItems
      );

      if (!continueOnError) {
        aborted = true;
        break;
      }
    }

    // Update progress after batch
    progress.processedRows = processed.length;
    progress.batchRowsProcessed = batchItems.length;
    progress.errorsEncountered = errorsEncountered;
    onProgress?.(progress);
  }

  const totalDurationMs = Date.now() - startTime.getTime();

  return {
    processed,
    failed,
    totalBatches: currentBatch,
    batchesCompleted,
    batchesFailed,
    totalRows: items.length,
    totalErrors: failed.length,
    totalDurationMs,
    aborted,
  };
}

// ============================================================================
// Batch Processor Helper
// ============================================================================

/**
 * Create a simple batch processor that runs a function on each item
 */
export function createSimpleBatchProcessor<T, R>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processFn: (item: T, connection?: import("kysely").Kysely<any>) => Promise<R>,
  options: {
    onSuccess?: (results: R[]) => Promise<void>;
    onError?: (error: Error, items: T[]) => Promise<void>;
  } = {}
): BatchProcessor<T> {
  return {
    async processBatch(items: T[], context: BatchContext): Promise<BatchResult<T>> {
      const processed: T[] = [];
      const failed: Array<{ item: T; error: ImportError }> = [];
      const startTime = Date.now();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const connection = 'connection' in context ? context.connection as import("kysely").Kysely<any> | undefined : undefined;

      for (const item of items) {
        try {
          await processFn(item, connection);
          processed.push(item);
        } catch (error) {
          const importError: ImportError = {
            rowNumber: 0,
            message: error instanceof Error ? error.message : String(error),
            severity: 'error',
            code: 'BATCH_PROCESSING_ERROR',
          };
          failed.push({ item, error: importError });
        }
      }

      return {
        processed,
        failed,
        committed: failed.length === 0,
        batchNumber: 0, // Will be set by caller
        durationMs: Date.now() - startTime,
      };
    },

    async onBatchSuccess(results: T[]): Promise<void> {
      await options.onSuccess?.(results as unknown as R[]);
    },

    async onBatchError(error: Error, items: T[]): Promise<void> {
      await options.onError?.(error, items);
    },
  };
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Create a progress tracker that reports progress at intervals
 */
export function createProgressTracker(
  onProgress?: ProgressCallback,
  options: {
    reportIntervalMs?: number;
    reportOnComplete?: boolean;
  } = {}
): ProgressCallback {
  const {
    reportIntervalMs = 1000,
    reportOnComplete = true,
  } = options;

  let lastReportTime = 0; // Initialize to 0 so first call always reports
  let isFirstCall = true;

  return (progress: ProgressInfo) => {
    const now = Date.now();
    
    // First call always reports
    if (isFirstCall) {
      isFirstCall = false;
      onProgress?.(progress);
      lastReportTime = now;
      return;
    }
    
    const shouldReport =
      (now - lastReportTime >= reportIntervalMs) ||
      (reportOnComplete && progress.phase === 'complete');

    if (shouldReport) {
      onProgress?.(progress);
      lastReportTime = now;
    }
  };
}

/**
 * Format progress info for logging
 */
export function formatProgress(progress: ProgressInfo): string {
  const percent = progress.totalRows > 0
    ? Math.round((progress.processedRows / progress.totalRows) * 100)
    : 0;

  return [
    `Progress: ${progress.processedRows}/${progress.totalRows} rows (${percent}%)`,
    `Batch: ${progress.currentBatch}/${progress.totalBatches}`,
    `Errors: ${progress.errorsEncountered}`,
    `Phase: ${progress.phase}`,
  ].join(' | ');
}

// ============================================================================
// Batch Context Extensions
// ============================================================================

/**
 * Extended batch context with database connection
 */
 
export interface BatchContextWithConnection extends BatchContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection?: import("kysely").Kysely<any>;
}

/**
 * Check if context has an active connection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasConnection(context: BatchContext): context is BatchContext & { connection: import("kysely").Kysely<any> } {
  return 'connection' in context && context.connection !== undefined;
}
