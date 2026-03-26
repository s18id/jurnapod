// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * CSV/Excel Generation Utilities
 * 
 * Provides generation functions for CSV and Excel exports.
 * Supports both synchronous (small datasets) and streaming (large datasets) approaches.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  ExportColumn,
  ExportOptions,
  ExportResult,
  ExportFormat,
  FieldType,
} from './types.js';
import {
  extractColumnValue,
  buildColumnMap,
  mergeFormatOptions,
  toExportString,
  formatValue,
} from './formatter.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_SHEET_NAME = 'Sheet1';

/**
 * Default column widths for Excel
 */
const DEFAULT_COLUMN_WIDTH = 20;

/**
 * Header row height for Excel
 */
const DEFAULT_HEADER_HEIGHT = 25;

// ============================================================================
// CSV Generation
// ============================================================================

/**
 * Generate CSV string from array of objects
 */
export function generateCSV<T>(
  data: T[],
  columns: ExportColumn<T>[],
  options: ExportOptions = {}
): string {
  if (data.length === 0) {
    return '';
  }

  const {
    includeHeaders = true,
    format: _format,
  } = options;

  // Build column map with ordering and selection
  const columnMap = buildColumnMap(columns, options);

  // Prepare rows
  const rows: string[][] = [];

  // Add headers if requested
  if (includeHeaders) {
    rows.push(columnMap.map((col) => col.header));
  }

  // Add data rows
  for (const row of data) {
    const rowValues = columnMap.map((col) => {
      const value = extractColumnValue(row, col);
      return toExportString(value, col.fieldType);
    });
    rows.push(rowValues);
  }

  // Generate CSV using papaparse unparse
  const csv = Papa.unparse(rows, {
    delimiter: ',',
    newline: '\r\n',
    header: false,
  });

  return csv;
}

/**
 * Generate CSV buffer from array of objects
 */
export function generateCSVBuffer<T>(
  data: T[],
  columns: ExportColumn<T>[],
  options: ExportOptions = {}
): Buffer {
  const csv = generateCSV(data, columns, options);
  return Buffer.from(csv, 'utf-8');
}

// ============================================================================
// Excel Generation
// ============================================================================

/**
 * Generate Excel buffer from array of objects
 */
export function generateExcel<T>(
  data: T[],
  columns: ExportColumn<T>[],
  options: ExportOptions = {}
): Buffer {
  if (data.length === 0) {
    // Return empty workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || DEFAULT_SHEET_NAME);
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  const {
    includeHeaders = true,
    sheetName = DEFAULT_SHEET_NAME,
    title,
  } = options;

  // Build column map
  const columnMap = buildColumnMap(columns, options);

  // Prepare worksheet data
  const aoa: unknown[][] = [];
  let startRow = 1;

  // Add title row if specified
  if (title) {
    aoa.push([title]);
    aoa.push([]); // Empty row after title
    startRow = 3;
  }

  // Add headers if requested
  if (includeHeaders) {
    aoa.push(columnMap.map((col) => col.header));
  }

  // Add data rows
  for (const row of data) {
    const rowValues = columnMap.map((col) => {
      const value = extractColumnValue(row, col);
      return formatCellValue(value, col.fieldType, options);
    });
    aoa.push(rowValues);
  }

  // Create worksheet from array
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths
  worksheet['!cols'] = columnMap.map((col) => ({
    wch: col.width || DEFAULT_COLUMN_WIDTH,
  }));

  // Set header row height if we have headers
  if (includeHeaders && aoa.length > 0) {
    const headerRowIndex = title ? startRow : (startRow === 3 ? 2 : 0);
    worksheet['!rows'] = worksheet['!rows'] || [];
    worksheet['!rows'][headerRowIndex] = { hpt: DEFAULT_HEADER_HEIGHT };
  }

  // Create workbook and append sheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Write to buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return buffer;
}

/**
 * Format a cell value for Excel
 */
function formatCellValue(
  value: unknown,
  fieldType?: FieldType,
  _options?: ExportOptions
): unknown {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  // Return numbers as-is for Excel to handle formatting
  if (fieldType === 'number' || fieldType === 'integer') {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(num) ? String(value) : num;
  }

  // Return money values as numbers
  if (fieldType === 'money') {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? String(value) : num;
  }

  // Return booleans as-is
  if (fieldType === 'boolean') {
    return value;
  }

  // For dates, return as string (Excel will parse if cell has date format)
  if (fieldType === 'date' || fieldType === 'datetime') {
    return formatValue(value, fieldType);
  }

  // Default: return as string
  return String(value);
}

// ============================================================================
// Generic Generation
// ============================================================================

/**
 * Generate export in specified format
 */
export function generateExport<T>(
  data: T[],
  columns: ExportColumn<T>[],
  options: ExportOptions = {}
): ExportResult {
  const format = options.format || 'csv';
  const startTime = Date.now();

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  if (format === 'xlsx') {
    buffer = generateExcel(data, columns, options);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `export-${Date.now()}.xlsx`;
  } else {
    buffer = generateCSVBuffer(data, columns, options);
    contentType = 'text/csv; charset=utf-8';
    filename = `export-${Date.now()}.csv`;
  }

  const durationMs = Date.now() - startTime;

  return {
    buffer,
    format,
    rowCount: data.length,
    fileSize: buffer.length,
    contentType,
    filename,
    durationMs,
  };
}

/**
 * Detect export format from filename extension
 */
export function detectFormatFromFilename(filename: string): ExportFormat | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return 'xlsx';
    case 'csv':
      return 'csv';
    default:
      return undefined;
  }
}

/**
 * Get content type for export format
 */
export function getContentType(format: ExportFormat): string {
  switch (format) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Get file extension for export format
 */
export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'xlsx':
      return '.xlsx';
    case 'csv':
      return '.csv';
    default:
      return '.txt';
  }
}

// ============================================================================
// Streaming Generation (for large datasets)
// ============================================================================

/**
 * Generate CSV in streaming fashion (yields chunks)
 */
export async function* generateCSVStream<T>(
  dataSource: AsyncIterable<T> | Iterable<T>,
  columns: ExportColumn<T>[],
  options: ExportOptions = {}
): AsyncGenerator<Buffer> {
  const {
    includeHeaders = true,
  } = options;

  // Build column map
  const columnMap = buildColumnMap(columns, options);

  // Generate header row first
  if (includeHeaders) {
    const headerRow = columnMap.map((col) => escapeCSVValue(col.header));
    const headerCSV = Papa.unparse([headerRow], { header: false });
    yield Buffer.from(headerCSV, 'utf-8');
  }

  // Process data rows in chunks
  let chunk: string[] = [];
  let rowCount = 0;
  const maxRows = options.maxRows || Infinity;

  for await (const row of dataSource) {
    if (rowCount >= maxRows) {
      break;
    }

    const rowValues = columnMap.map((col) => {
      const value = extractColumnValue(row, col);
      return escapeCSVValue(toExportString(value, col.fieldType));
    });

    chunk.push(rowValues.join(','));

    if (chunk.length >= DEFAULT_CHUNK_SIZE) {
      // Yield chunk as buffer with newlines
      yield Buffer.from(chunk.join('\r\n') + '\r\n', 'utf-8');
      chunk = [];
    }

    rowCount++;
  }

  // Yield remaining rows
  if (chunk.length > 0) {
    yield Buffer.from(chunk.join('\r\n'), 'utf-8');
  }
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

// ============================================================================
// Chunk Processing
// ============================================================================

/**
 * Process data in chunks for memory efficiency
 */
export async function processInChunks<T, R>(
  data: T[],
  processor: (chunk: T[]) => Promise<R[]>,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const chunkResults = await processor(chunk);
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Create a readable stream from an async generator
 */
export function createReadableStream(
  generator: AsyncGenerator<Buffer>
): ReadableStream<Buffer> {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await generator.next();
      
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create default export options
 */
export function createDefaultOptions(format: ExportFormat = 'csv'): ExportOptions {
  return {
    format,
    includeHeaders: true,
    dateFormat: 'yyyy-MM-dd',
    datetimeFormat: 'yyyy-MM-dd HH:mm:ss',
  };
}

/**
 * Validate export data
 */
export function validateExportData<T>(
  data: T[],
  columns: ExportColumn<T>[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Data must be an array');
  }

  if (!columns || columns.length === 0) {
    errors.push('At least one column must be specified');
  }

  // Check for duplicate column keys
  const keys = new Set<string>();
  for (const col of columns) {
    if (!col.key) {
      errors.push('All columns must have a key');
    } else if (keys.has(col.key)) {
      errors.push(`Duplicate column key: ${col.key}`);
    } else {
      keys.add(col.key);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
