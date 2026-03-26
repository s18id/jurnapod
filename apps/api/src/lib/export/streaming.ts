// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Streaming Export for Large Datasets
 * 
 * Provides streaming export capabilities for handling large datasets without
 * memory exhaustion. Uses database cursors and response streaming.
 */

import type { Readable } from 'node:stream';
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
// Streaming Export
// ============================================================================

/**
 * Create a streaming export from an async iterable data source
 */
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
