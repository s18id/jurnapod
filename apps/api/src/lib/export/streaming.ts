// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Streaming Export for Large Datasets
 * 
 * Provides streaming export capabilities for handling large datasets without
 * memory exhaustion. Uses database cursors and response streaming with
 * proper backpressure handling.
 */

import { Readable } from 'node:stream';
import type { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  ExportColumn,
  ExportFormat,
  ExportOptions,
  ExportProgress,
  ExportProgressCallback,
  ExportResult,
  StreamingExport,
  ExportError,
  ExportErrorCode,
} from './types.js';
import { buildColumnMap, extractColumnValue, mergeFormatOptions } from './formatter.js';
import { generateCSVStream, generateExcel, generateExcelChunked, generateCSVBuffer } from './generators.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum rows to buffer before yielding in streaming mode
 */
const BUFFER_SIZE = 500;

// ============================================================================
// Backpressure Handling Constants
// ============================================================================

/**
 * Default maximum buffer size before pausing (10MB)
 */
const DEFAULT_BUFFER_LIMIT = 10 * 1024 * 1024;

/**
 * Default timeout for drain event (30 seconds)
 */
const DEFAULT_DRAIN_TIMEOUT_MS = 30 * 1000;

/**
 * Time after which we start throttling if backpressure persists (60 seconds)
 */
const THROTTLE_THRESHOLD_MS = 60 * 1000;

/**
 * Maximum rows per second when throttling due to backpressure
 */
const THROTTLE_ROWS_PER_SECOND = 1000;

/**
 * Minimum delay between rows when throttled (1ms = 1000 rows/sec)
 */
const THROTTLE_MIN_DELAY_MS = 1;

// ============================================================================
// Backpressure Metrics
// ============================================================================

/**
 * Metrics for monitoring backpressure events
 */
export interface BackpressureMetrics {
  /** Total number of backpressure events triggered */
  backpressureEventsTotal: number;
  /** Total duration of all backpressure events in ms */
  backpressureDurationMs: number;
  /** Current backpressure state */
  isBackpressured: boolean;
  /** Number of rows streamed */
  rowsStreamed: number;
  /** Peak memory usage during export */
  peakMemoryBytes: number;
}

/**
 * Backpressure configuration options
 */
export interface BackpressureOptions {
  /** Maximum buffer size before pausing (default: 10MB) */
  bufferLimit?: number;
  /** Timeout for drain event in ms (default: 30 seconds) */
  drainTimeoutMs?: number;
  /** Enable throttling after backpressure persists (default: true) */
  enableThrottling?: boolean;
  /** Throttle threshold in ms (default: 60 seconds) */
  throttleThresholdMs?: number;
  /** Rows per second when throttling (default: 1000) */
  throttleRowsPerSecond?: number;
  /** Callback for metrics updates */
  onMetrics?: (metrics: BackpressureMetrics) => void;
  /** Callback for backpressure events */
  onBackpressureEvent?: (event: BackpressureEvent) => void;
}

/**
 * Backpressure event types
 */
export type BackpressureEventType = 
  | 'started'
  | 'drained'
  | 'memory_limit'
  | 'timeout'
  | 'throttle_started'
  | 'throttle_ended'
  | 'client_disconnect';

/**
 * Backpressure event details
 */
export interface BackpressureEvent {
  type: BackpressureEventType;
  timestamp: Date;
  rowsStreamed: number;
  memoryUsedBytes?: number;
  durationMs?: number;
  message?: string;
}

/**
 * Internal state for backpressure handling
 */
interface BackpressureState {
  isBackpressured: boolean;
  backpressureStartTime: number | null;
  currentBufferBytes: number;
  lastDrainTime: number;
  throttleStartTime: number | null;
  totalBackpressureEvents: number;
  totalBackpressureDurationMs: number;
  peakMemoryBytes: number;
}

/**
 * Create backpressure metrics from internal state
 */
function createMetrics(state: BackpressureState, rowsStreamed: number): BackpressureMetrics {
  return {
    backpressureEventsTotal: state.totalBackpressureEvents,
    backpressureDurationMs: state.totalBackpressureDurationMs,
    isBackpressured: state.isBackpressured,
    rowsStreamed,
    peakMemoryBytes: state.peakMemoryBytes,
  };
}

/**
 * Track export buffer size (actual bytes in export buffer, not process heap)
 */
function getExportBufferSize(state: BackpressureState): number {
  return state.currentBufferBytes ?? 0;
}

// ============================================================================
// Backpressure-Aware Stream Wrapper
// ============================================================================

/**
 * Options for creating a backpressure-aware stream
 */
export interface BackpressureStreamOptions extends BackpressureOptions {
  /** The destination writable stream */
  destination: Writable;
  /** High water mark for the internal buffer */
  highWaterMark?: number;
}

/**
 * Create a write function that handles backpressure properly
 * 
 * This function returns a write handler that monitors the writable.write()
 * return value and pauses/resumes data generation based on backpressure.
 */
export function createBackpressureWriter<T>(
  options: BackpressureStreamOptions
): {
  write: (chunk: Buffer) => Promise<boolean>;
  waitForDrain: () => Promise<void>;
  checkBufferLimit: (currentBufferSize: number) => boolean;
  getMetrics: () => BackpressureMetrics;
  abort: () => void;
} {
  const bufferLimit = options.bufferLimit ?? DEFAULT_BUFFER_LIMIT;
  const drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
  const enableThrottling = options.enableThrottling ?? true;
  const throttleThresholdMs = options.throttleThresholdMs ?? THROTTLE_THRESHOLD_MS;
  const throttleRowsPerSecond = options.throttleRowsPerSecond ?? THROTTLE_ROWS_PER_SECOND;
  const throttleMinDelay = Math.ceil(1000 / throttleRowsPerSecond);

  const destination = options.destination;
  let rowsStreamed = 0;
  
  const state: BackpressureState = {
    isBackpressured: false,
    backpressureStartTime: null,
    currentBufferBytes: 0,
    lastDrainTime: Date.now(),
    throttleStartTime: null,
    totalBackpressureEvents: 0,
    totalBackpressureDurationMs: 0,
    peakMemoryBytes: 0,
  };

  let drainResolver: (() => void) | null = null;
  let drainTimeout: NodeJS.Timeout | null = null;
  let aborted = false;

  // Track memory usage
  function updateMemoryMetrics(): void {
    const bufferBytes = getExportBufferSize(state);
    if (bufferBytes > state.peakMemoryBytes) {
      state.peakMemoryBytes = bufferBytes;
    }
  }

  // Emit backpressure event
  function emitEvent(type: BackpressureEventType, message?: string): void {
    updateMemoryMetrics();
    
    const event: BackpressureEvent = {
      type,
      timestamp: new Date(),
      rowsStreamed,
      memoryUsedBytes: state.peakMemoryBytes,
      durationMs: state.backpressureStartTime 
        ? Date.now() - state.backpressureStartTime 
        : undefined,
      message,
    };

    options.onBackpressureEvent?.(event);

    // Log at appropriate level
    const logMessage = `[Backpressure] ${type}: ${message ?? ''} (rows: ${rowsStreamed}, memory: ${Math.round(state.peakMemoryBytes / 1024 / 1024)}MB)`;
    
    switch (type) {
      case 'started':
      case 'memory_limit':
        console.warn(logMessage);
        break;
      case 'timeout':
        console.error(logMessage);
        break;
      case 'client_disconnect':
        console.info(logMessage);
        break;
      default:
        console.debug(logMessage);
    }
  }

  // Handle backpressure start
  function startBackpressure(): void {
    if (aborted) return;
    
    state.isBackpressured = true;
    state.backpressureStartTime = Date.now();
    state.totalBackpressureEvents++;
    
    emitEvent('started', 'Consumer slow - pausing data generation');
  }

  // Handle drain event
  function handleDrain(): void {
    if (aborted) return;
    
    const wasBackpressured = state.isBackpressured;
    state.isBackpressured = false;
    state.currentBufferBytes = 0; // Reset buffer tracking on drain
    state.lastDrainTime = Date.now();
    
    if (wasBackpressured && state.backpressureStartTime) {
      const duration = Date.now() - state.backpressureStartTime;
      state.totalBackpressureDurationMs += duration;
      
      // Check if we were throttled
      if (state.throttleStartTime) {
        emitEvent('throttle_ended', `Throttling ended after ${Math.round(duration / 1000)}s`);
        state.throttleStartTime = null;
      }
      
      emitEvent('drained', `Resume data generation after ${Math.round(duration)}ms`);
    }
    
    // Clear any pending drain timeout
    if (drainTimeout) {
      clearTimeout(drainTimeout);
      drainTimeout = null;
    }
    
    // Resolve any waiting drain promise
    if (drainResolver) {
      drainResolver();
      drainResolver = null;
    }
  }

  // Set up drain listener
  destination.on('drain', handleDrain);

  // Set up error handler
  destination.on('error', (err) => {
    console.error('[Backpressure] Destination error:', err.message);
    aborted = true;
  });

  // Write chunk with backpressure handling
  async function write(chunk: Buffer): Promise<boolean> {
    if (aborted) return false;
    
    rowsStreamed++;
    state.currentBufferBytes += chunk.length;
    updateMemoryMetrics();
    
    const canContinue = destination.write(chunk);
    
    if (!canContinue) {
      startBackpressure();
      
      // Start drain timeout
      if (drainTimeoutMs > 0) {
        drainTimeout = setTimeout(() => {
          if (state.isBackpressured) {
            emitEvent('timeout', `Drain timeout after ${drainTimeoutMs}ms - consumer stalled`);
            aborted = true;
            options.onBackpressureEvent?.({
              type: 'timeout',
              timestamp: new Date(),
              rowsStreamed,
              durationMs: drainTimeoutMs,
              message: 'Consumer stalled - aborting export',
            });
          }
        }, drainTimeoutMs);
      }
    }
    
    return canContinue;
  }

  // Wait for drain with optional throttling
  async function waitForDrain(): Promise<void> {
    if (aborted || !state.isBackpressured) return;
    
    // Reset throttle state if throttling was disabled
    if (!enableThrottling && state.throttleStartTime) {
      state.throttleStartTime = null;
    }
    
    // Check if we should start throttling
    if (enableThrottling && 
        state.backpressureStartTime && 
        Date.now() - state.backpressureStartTime > throttleThresholdMs &&
        !state.throttleStartTime) {
      state.throttleStartTime = Date.now();
      emitEvent('throttle_started', `Starting throttle to ${throttleRowsPerSecond} rows/sec`);
    }
    
    // If throttled, add delay between rows
    if (state.throttleStartTime) {
      await new Promise(resolve => setTimeout(resolve, throttleMinDelay));
    }
    
    return new Promise<void>((resolve) => {
      if (state.isBackpressured) {
        drainResolver = resolve;
      } else {
        resolve();
      }
    });
  }

  // Check if buffer limit is exceeded
  function checkBufferLimit(currentBufferSize: number): boolean {
    updateMemoryMetrics();
    
    if (currentBufferSize > bufferLimit) {
      if (!state.isBackpressured) {
        startBackpressure();
        emitEvent('memory_limit', `Buffer limit exceeded: ${currentBufferSize} > ${bufferLimit}`);
      }
      return true;
    }
    return false;
  }

  // Get current metrics
  function getMetrics(): BackpressureMetrics {
    updateMemoryMetrics();
    return createMetrics(state, rowsStreamed);
  }

  // Abort operation
  function abort(): void {
    aborted = true;
    state.isBackpressured = true; // Signal to stop processing
    if (drainTimeout) {
      clearTimeout(drainTimeout);
    }
    emitEvent('client_disconnect', 'Client disconnected - aborting export');
  }

  return {
    write,
    waitForDrain,
    checkBufferLimit,
    getMetrics,
    abort,
  };
}

/**
 * Create a backpressure-aware async generator from a readable stream
 */
export async function* createBackpressureStream<T>(
  readable: Readable,
  options: BackpressureStreamOptions
): AsyncGenerator<T> {
  const writer = createBackpressureWriter<T>(options);
  let bufferSize = 0;

  const iterator = readable[Symbol.asyncIterator]
    ? readable
    : (async function* () {
        for await (const chunk of readable) {
          yield chunk;
        }
      })();

  // Store reference to drain handler for proper cleanup
  const drainHandler = () => {
    // Drain is handled internally by writer
  };
  options.destination.on('drain', drainHandler);

  try {
    for await (const row of iterator) {
      const chunk = Buffer.isBuffer(row) ? row : Buffer.from(String(row));
      bufferSize += chunk.length;

      // Check buffer limit before writing
      if (writer.checkBufferLimit(bufferSize)) {
        await writer.waitForDrain();
        bufferSize = 0;
      }

      const canContinue = await writer.write(chunk);
      if (!canContinue) {
        await writer.waitForDrain();
        bufferSize = 0;
      }

      yield row;
    }
  } finally {
    // Report final metrics
    const finalMetrics = writer.getMetrics();
    options.onMetrics?.(finalMetrics);
    
    // Clean up - use stored handler reference
    options.destination.removeListener('drain', drainHandler);
  }
}

/**
 * Stream data to HTTP response with proper backpressure handling
 * 
 * This function creates a pipeline that ensures:
 * - Data generation pauses when HTTP client is slow
 * - Memory is bounded to prevent buffer overflow
 * - Connections are properly released on disconnect
 * - Metrics are collected for monitoring
 */
export async function streamToResponse<T>(
  dataSource: AsyncIterable<T>,
  destination: Writable,
  options: BackpressureStreamOptions,
  onProgress?: ExportProgressCallback
): Promise<{ metrics: BackpressureMetrics; rowsWritten: number }> {
  const writer = createBackpressureWriter<T>(options);
  let rowsWritten = 0;
  let bytesWritten = 0;
  const startTime = new Date();
  let bufferSize = 0;
  let aborted = false;

  // Handle client disconnect
  destination.on('close', () => {
    if (!aborted) {
      aborted = true;
      writer.abort();
      console.info(`[StreamToResponse] Client disconnected after ${rowsWritten} rows`);
    }
  });

  try {
    for await (const row of dataSource) {
      if (aborted) break;

      const chunk = Buffer.isBuffer(row) ? row : Buffer.from(String(row));
      bufferSize += chunk.length;
      bytesWritten += chunk.length;

      // Check buffer limit before writing
      if (writer.checkBufferLimit(bufferSize)) {
        await writer.waitForDrain();
        bufferSize = 0;
      }

      const canContinue = await writer.write(chunk);
      rowsWritten++;

      // Report progress periodically
      if (rowsWritten % DEFAULT_CHUNK_SIZE === 0) {
        onProgress?.({
          processedRows: rowsWritten,
          phase: 'streaming',
          bytesWritten,
          startTime,
        });
      }

      if (!canContinue) {
        await writer.waitForDrain();
        bufferSize = 0;
      }
    }
  } finally {
    // Report final metrics
    const finalMetrics = writer.getMetrics();
    options.onMetrics?.(finalMetrics);
  }

  return { metrics: writer.getMetrics(), rowsWritten };
}

/**
 * Create a pipeline-based export with backpressure handling
 * 
 * Uses node:stream/promises pipeline() for proper cleanup on errors
 */
export async function pipelineExport<T>(
  source: Readable,
  destination: Writable,
  options: BackpressureStreamOptions
): Promise<BackpressureMetrics> {
  let metrics: BackpressureMetrics = {
    backpressureEventsTotal: 0,
    backpressureDurationMs: 0,
    isBackpressured: false,
    rowsStreamed: 0,
    peakMemoryBytes: 0,
  };

  const writer = createBackpressureWriter<T>({
    ...options,
    onMetrics: (m) => { metrics = m; },
  });

  // Track bytes written through the pipeline
  let bytesWritten = 0;
  let rowsStreamed = 0;

  // Wrap source to track rows and handle backpressure
  const trackingSource = new Readable({
    objectMode: true,
    highWaterMark: options.highWaterMark ?? 16,
    async read() {
      // This is called when the source needs more data
      // The actual data flow is handled by the pipeline
    },
  });

  try {
    await pipeline(source, async function* (readable) {
      let bufferSize = 0;
      
      for await (const chunk of readable) {
        if (options.destination.destroyed) {
          writer.abort();
          break;
        }

        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        bufferSize += data.length;
        bytesWritten += data.length;
        rowsStreamed++;

        // Check backpressure before yielding
        if (writer.checkBufferLimit(bufferSize)) {
          await writer.waitForDrain();
          bufferSize = 0;
        }

        yield chunk;

        // Wait for drain if needed
        if (!writer.getMetrics().isBackpressured) {
          bufferSize = 0;
        }
      }
    }, destination);

    metrics = writer.getMetrics();
    metrics.rowsStreamed = rowsStreamed;
  } catch (error) {
    writer.abort();
    throw error;
  }

  return metrics;
}
export async function* streamExport<T>(
  dataSource: AsyncIterable<T>,
  columns: ExportColumn<T>[],
  format: ExportFormat,
  options: ExportOptions = {},
  onProgress?: ExportProgressCallback
): AsyncGenerator<Buffer> {
  const startTime = new Date();
  const columnMap = buildColumnMap(columns, options);
  let processedRows = 0;
  let totalBytesWritten = 0;
  let lastYieldTime = Date.now();

  // Report initial progress
  reportProgress(onProgress, {
    processedRows: 0,
    phase: 'preparing',
    bytesWritten: 0,
    startTime,
  });

  // For CSV, use streaming generator
  if (format === 'csv') {
    yield* generateCSVStream(dataSource, columns, options);
    
    // Note: We can't accurately track progress for async generators
    // since we don't know total rows ahead of time
    return;
  }

  // For Excel, process in chunks to limit memory usage
  // The xlsx library doesn't support true streaming, but we can
  // use chunked generation with multiple sheets for large datasets
  const maxRows = options.maxRows || 50000; // Limit Excel exports to 50k rows
  const allRows: T[] = [];
  let rowCount = 0;
  let warnedAboutSize = false;

  for await (const row of dataSource) {
    if (rowCount >= maxRows) {
      if (!warnedAboutSize) {
        console.warn(
          `Excel export limited to ${maxRows} rows. ` +
          'Use CSV format for larger exports or increase maxRows option.'
        );
        warnedAboutSize = true;
      }
      break;
    }

    allRows.push(row);
    rowCount++;

    // Report progress periodically
    if (rowCount % DEFAULT_CHUNK_SIZE === 0) {
      reportProgress(onProgress, {
        processedRows: rowCount,
        phase: 'streaming',
        bytesWritten: totalBytesWritten,
        startTime,
      });
    }
  }

  // Generate Excel file using chunked generation for large datasets
  reportProgress(onProgress, {
    processedRows: rowCount,
    phase: 'formatting',
    bytesWritten: totalBytesWritten,
    startTime,
  });

  // Use chunked generation for datasets > 10,000 rows
  const buffer = allRows.length > 10000
    ? generateExcelChunked(allRows, columns, options)
    : generateExcel(allRows, columns, options);
  
  totalBytesWritten += buffer.length;
  
  yield buffer;

  reportProgress(onProgress, {
    totalRows: rowCount,
    processedRows: rowCount,
    phase: 'complete',
    bytesWritten: totalBytesWritten,
    startTime,
  });
}

/**
 * Generate CSV stream with progress tracking
 */
async function* generateCSVStreamWithProgress<T>(
  dataSource: AsyncIterable<T>,
  columns: ExportColumn<T>[],
  options: ExportOptions = {},
  onProgress?: ExportProgressCallback
): AsyncGenerator<Buffer> {
  const startTime = new Date();
  const columnMap = buildColumnMap(columns, options);
  const maxRows = options.maxRows || Infinity;
  const includeHeaders = options.includeHeaders !== false;

  // Generate header row first
  if (includeHeaders) {
    const headers = columnMap.map((col) => escapeCSVValue(col.header));
    const headerLine = headers.join(',') + '\r\n';
    yield Buffer.from(headerLine, 'utf-8');
  }

  let processedRows = 0;
  let totalBytesWritten = 0;
  let chunk: string[] = [];

  for await (const row of dataSource) {
    if (processedRows >= maxRows) {
      break;
    }

    const rowValues = columnMap.map((col) => {
      const value = extractColumnValue(row, col);
      return escapeCSVValue(formatValueForCSV(value));
    });

    chunk.push(rowValues.join(','));

    // Yield in chunks
    if (chunk.length >= DEFAULT_CHUNK_SIZE) {
      const chunkBuffer = Buffer.from(chunk.join('\r\n') + '\r\n', 'utf-8');
      totalBytesWritten += chunkBuffer.length;
      yield chunkBuffer;
      chunk = [];

      reportProgress(onProgress, {
        processedRows,
        phase: 'streaming',
        bytesWritten: totalBytesWritten,
        startTime,
      });
    }

    processedRows++;
  }

  // Yield remaining rows
  if (chunk.length > 0) {
    const remainingBuffer = Buffer.from(chunk.join('\r\n'), 'utf-8');
    totalBytesWritten += remainingBuffer.length;
    yield remainingBuffer;
  }

  reportProgress(onProgress, {
    totalRows: processedRows,
    processedRows,
    phase: 'complete',
    bytesWritten: totalBytesWritten,
    startTime,
  });
}

/**
 * Format value for CSV export
 */
function formatValueForCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').split('.')[0];
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Escape value for CSV
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Report progress to callback
 */
function reportProgress(
  onProgress: ExportProgressCallback | undefined,
  progress: Partial<ExportProgress> & { processedRows: number; phase: ExportProgress['phase']; bytesWritten: number; startTime: Date }
): void {
  if (!onProgress) {
    return;
  }

  const fullProgress: ExportProgress = {
    totalRows: progress.totalRows,
    processedRows: progress.processedRows,
    phase: progress.phase,
    bytesWritten: progress.bytesWritten,
    startTime: progress.startTime,
  };

  // Estimate completion time if we have enough data
  if (progress.processedRows > 0 && progress.phase === 'streaming') {
    const elapsed = Date.now() - progress.startTime.getTime();
    const rowsPerMs = progress.processedRows / elapsed;
    if (progress.totalRows && rowsPerMs > 0) {
      const remainingRows = progress.totalRows - progress.processedRows;
      const remainingMs = remainingRows / rowsPerMs;
      fullProgress.estimatedCompletionTime = new Date(Date.now() + remainingMs);
    }
  }

  onProgress(fullProgress);
}

// ============================================================================
// Database Streaming Export
// ============================================================================

/**
 * Stream export from a database query
 * 
 * This function creates a streaming export from a database cursor/query result.
 * It handles the connection lifecycle and ensures proper cleanup.
 */
export async function streamExportFromDatabase<T>(
  queryFn: () => Promise<Readable>,
  columns: ExportColumn<T>[],
  format: ExportFormat,
  options: ExportOptions = {},
  onProgress?: ExportProgressCallback
): Promise<AsyncGenerator<Buffer>> {
  // This returns an async generator that can be used with streamExport
  // The actual database cursor handling is done by the caller
  
  const columnMap = buildColumnMap(columns, options);
  const maxRows = options.maxRows || Infinity;
  const includeHeaders = options.includeHeaders !== false;

  // Create a wrapper async generator around the readable stream
  async function* generate(): AsyncGenerator<Buffer> {
    const startTime = new Date();
    let processedRows = 0;
    let totalBytesWritten = 0;
    let chunk: string[] = [];

    // If CSV with headers, yield header first
    if (includeHeaders && format === 'csv') {
      const headers = columnMap.map((col) => escapeCSVValue(col.header));
      const headerLine = headers.join(',') + '\r\n';
      yield Buffer.from(headerLine, 'utf-8');
    }

    // Get the readable stream from the query function
    const readable = await queryFn();

    // Convert Node.js Readable to async iterable
    const iterator = readable[Symbol.asyncIterator]
      ? readable
      : (async function* () {
          // For Node.js Readable streams
          for await (const chunk of readable) {
            yield chunk;
          }
        })();

    for await (const row of iterator) {
      if (processedRows >= maxRows) {
        break;
      }

      if (format === 'csv') {
        const rowValues = columnMap.map((col) => {
          const value = extractColumnValue(row as T, col);
          return escapeCSVValue(formatValueForCSV(value));
        });
        chunk.push(rowValues.join(','));

        if (chunk.length >= DEFAULT_CHUNK_SIZE) {
          const chunkBuffer = Buffer.from(chunk.join('\r\n') + '\r\n', 'utf-8');
          totalBytesWritten += chunkBuffer.length;
          yield chunkBuffer;
          chunk = [];
        }
      }

      processedRows++;

      if (processedRows % DEFAULT_CHUNK_SIZE === 0) {
        reportProgress(onProgress, {
          processedRows,
          phase: 'streaming',
          bytesWritten: totalBytesWritten,
          startTime,
        });
      }
    }

    // Yield remaining CSV rows
    if (format === 'csv' && chunk.length > 0) {
      const remainingBuffer = Buffer.from(chunk.join('\r\n'), 'utf-8');
      totalBytesWritten += remainingBuffer.length;
      yield remainingBuffer;
    }

    reportProgress(onProgress, {
      totalRows: processedRows,
      processedRows,
      phase: 'complete',
      bytesWritten: totalBytesWritten,
      startTime,
    });
  }

  return generate();
}

// ============================================================================
// Export with Transaction Support
// ============================================================================

/**
 * Create a streaming export that handles its own transaction
 * 
 * This is useful when you need to export data within a transaction
 * and want the framework to handle the transaction lifecycle.
 */
export async function streamExportWithTransaction<T>(
  getConnection: () => Promise<{
    query: <R>(sql: string, params?: unknown[]) => Promise<Readable & { rows: R[] }>;
    release: () => void;
  }>,
  sql: string,
  params: unknown[],
  columns: ExportColumn<T>[],
  format: ExportFormat,
  options: ExportOptions = {},
  onProgress?: ExportProgressCallback
): Promise<ExportResult> {
  const startTime = new Date();
  const columnMap = buildColumnMap(columns, options);
  const maxRows = options.maxRows || Infinity;
  let connection: Awaited<ReturnType<typeof getConnection>> | null = null;
  let processedRows = 0;

  try {
    connection = await getConnection();

    // Execute query as stream
    const stream = await connection.query(sql, params);

    const rows: T[] = [];

    // For Excel, we need to collect all data
    if (format === 'xlsx') {
      // Read all rows (this is memory-intensive for Excel)
      // For true streaming Excel, we'd need a different approach
      for await (const row of stream as AsyncIterable<T>) {
        if (processedRows >= maxRows) break;
        rows.push(row);
        processedRows++;

        if (processedRows % DEFAULT_CHUNK_SIZE === 0) {
          reportProgress(onProgress, {
            processedRows,
            phase: 'streaming',
            bytesWritten: 0,
            startTime,
          });
        }
      }

      reportProgress(onProgress, {
        processedRows,
        phase: 'formatting',
        bytesWritten: 0,
        startTime,
      });

      const buffer = generateExcel(rows, columns, options);

      reportProgress(onProgress, {
        totalRows: processedRows,
        processedRows,
        phase: 'complete',
        bytesWritten: buffer.length,
        startTime,
      });

      return {
        buffer,
        format,
        rowCount: rows.length,
        fileSize: buffer.length,
        contentType: format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8',
        filename: `export-${Date.now()}${format === 'xlsx' ? '.xlsx' : '.csv'}`,
        durationMs: Date.now() - startTime.getTime(),
      };
    } else {
      // For CSV, we can stream directly
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      // Add header
      if (options.includeHeaders !== false) {
        const headers = columnMap.map((col) => escapeCSVValue(col.header));
        const headerLine = headers.join(',') + '\r\n';
        chunks.push(Buffer.from(headerLine, 'utf-8'));
        totalBytes += headerLine.length;
      }

      // Stream rows
      for await (const row of stream as AsyncIterable<T>) {
        if (processedRows >= maxRows) break;

        const rowValues = columnMap.map((col) => {
          const value = extractColumnValue(row as T, col);
          return escapeCSVValue(formatValueForCSV(value));
        });

        const rowLine = rowValues.join(',') + '\r\n';
        chunks.push(Buffer.from(rowLine, 'utf-8'));
        totalBytes += rowLine.length;
        processedRows++;

        if (processedRows % DEFAULT_CHUNK_SIZE === 0) {
          reportProgress(onProgress, {
            processedRows,
            phase: 'streaming',
            bytesWritten: totalBytes,
            startTime,
          });
        }
      }

      const buffer = Buffer.concat(chunks);

      reportProgress(onProgress, {
        totalRows: processedRows,
        processedRows,
        phase: 'complete',
        bytesWritten: totalBytes,
        startTime,
      });

      return {
        buffer,
        format,
        rowCount: processedRows,
        fileSize: buffer.length,
        contentType: 'text/csv; charset=utf-8',
        filename: `export-${Date.now()}.csv`,
        durationMs: Date.now() - startTime.getTime(),
      };
    }
  } catch (error) {
    const exportError: ExportError = {
      message: error instanceof Error ? error.message : 'Unknown export error',
      code: 'QUERY_ERROR',
      cause: error instanceof Error ? error : undefined,
    };

    reportProgress(onProgress, {
      processedRows,
      phase: 'error',
      bytesWritten: 0,
      startTime,
      error: exportError as unknown as Error,
    });

    throw exportError;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a progress tracker
 */
export function createProgressTracker(
  onProgress?: ExportProgressCallback
): ExportProgressCallback {
  return (progress) => {
    if (onProgress) {
      onProgress(progress);
    }
  };
}

/**
 * Estimate export duration based on sample data
 */
export function estimateExportDuration(
  sampleRowCount: number,
  sampleDurationMs: number,
  totalRowCount: number
): number {
  if (sampleRowCount === 0 || sampleDurationMs === 0) {
    return 0;
  }

  const rowsPerMs = sampleRowCount / sampleDurationMs;
  return Math.round(totalRowCount / rowsPerMs);
}

/**
 * Check if export should use streaming mode
 */
export function shouldUseStreaming(rowCount: number | undefined): boolean {
  // Use streaming for large datasets or unknown size
  const STREAMING_THRESHOLD = 10000;
  return rowCount === undefined || rowCount > STREAMING_THRESHOLD;
}

/**
 * Create export error with code
 */
export function createExportError(
  message: string,
  code: ExportErrorCode,
  cause?: Error
): ExportError {
  return {
    message,
    code,
    cause,
  };
}
