// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Framework Types
 * 
 * Shared types and interfaces for the export framework supporting CSV/Excel generation,
 * streaming, and column mapping across all domain modules.
 */

import type { Readable } from 'node:stream';

// ============================================================================
// Field Types
// ============================================================================

/**
 * Supported field types for export formatting
 */
export type FieldType = 
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'money'
  | 'enum';

// ============================================================================
// Export Format Types
// ============================================================================

/**
 * Supported export formats
 */
export type ExportFormat = 'csv' | 'xlsx';

/**
 * Export options for generation
 */
export interface ExportOptions {
  /** Export format (default: csv) */
  format?: ExportFormat;
  /** Whether to include headers (default: true) */
  includeHeaders?: boolean;
  /** Custom column order (default: use column definition order) */
  columnOrder?: string[];
  /** Include only these columns */
  selectedColumns?: string[];
  /** Date format string for date fields (default: 'yyyy-MM-dd') */
  dateFormat?: string;
  /** Datetime format string (default: 'yyyy-MM-dd HH:mm:ss') */
  datetimeFormat?: string;
  /** Money format options */
  moneyFormat?: MoneyFormatOptions;
  /** Sheet name for Excel exports (default: 'Sheet1') */
  sheetName?: string;
  /** Title for the export (appears as first row or sheet title) */
  title?: string;
  /** Maximum rows to export (0 = unlimited) */
  maxRows?: number;
}

/**
 * Money formatting options
 */
export interface MoneyFormatOptions {
  /** Currency symbol (default: '') */
  symbol?: string;
  /** Decimal places (default: 2) */
  decimals?: number;
  /** Thousands separator (default: ',') */
  thousandsSeparator?: string;
  /** Decimal separator (default: '.') */
  decimalSeparator?: string;
  /** Position of symbol (default: 'prefix') */
  symbolPosition?: 'prefix' | 'suffix';
}

/**
 * Format options for individual fields
 */
export interface FormatOptions {
  /** Field type for formatting */
  fieldType?: FieldType;
  /** Date format string (for date/datetime fields) */
  dateFormat?: string;
  /** Datetime format string */
  datetimeFormat?: string;
  /** Money format options */
  moneyFormat?: MoneyFormatOptions;
  /** Custom formatter function */
  formatter?: (value: unknown) => string;
  /** Map of enum values to display names */
  enumLabels?: Record<string, string>;
}

// ============================================================================
// Column Definition Types
// ============================================================================

/**
 * Column definition for exports
 */
export interface ExportColumn<T = unknown> {
  /** Unique key for the column */
  key: string;
  /** Display header name */
  header: string;
  /** Optional field path accessor (supports nested paths like 'address.city') */
  field?: string | ((row: T) => unknown);
  /** Column width (for Excel) */
  width?: number;
  /** Custom formatter for this column */
  formatter?: (value: unknown, row: T) => string;
  /** Whether column is sortable (default: true) */
  sortable?: boolean;
  /** Whether column is filterable (default: true) */
  filterable?: boolean;
  /** Field type for formatting (default: 'string') */
  fieldType?: FieldType;
  /** Format options for this column */
  formatOptions?: FormatOptions;
}

/**
 * Column selector for configuring exports
 */
export interface ColumnSelector<T = unknown> {
  /** All available columns */
  availableColumns: ExportColumn<T>[];
  /** Columns to include in export (undefined = all) */
  selectedColumns?: string[];
  /** Custom column ordering */
  columnOrder?: string[];
  /** Computed columns to add */
  computedColumns?: ComputedColumn<T>[];
}

/**
 * Computed column that derives value from row data
 */
export interface ComputedColumn<T = unknown> {
  /** Column key */
  key: string;
  /** Display header */
  header: string;
  /** Computation function */
  compute: (row: T) => unknown;
  /** Field type for formatting */
  fieldType?: FieldType;
  /** Format options */
  formatOptions?: FormatOptions;
}

// ============================================================================
// Streaming Export Types
// ============================================================================

/**
 * Streaming export configuration
 */
export interface StreamingExport<T = unknown> {
  /** Async iterable data source */
  dataSource: AsyncIterable<T> | Readable;
  /** Column definitions */
  columns: ExportColumn<T>[];
  /** Export format */
  format: ExportFormat;
  /** Transform function before output */
  transform?: (row: T) => Record<string, unknown>;
  /** Options */
  options?: ExportOptions;
}

/**
 * Stream export progress info
 */
export interface ExportProgress {
  /** Total rows to process (if known) */
  totalRows?: number;
  /** Rows processed so far */
  processedRows: number;
  /** Current phase */
  phase: 'preparing' | 'streaming' | 'formatting' | 'complete' | 'error';
  /** Bytes written so far */
  bytesWritten: number;
  /** Error if any */
  error?: Error;
  /** Start time */
  startTime: Date;
  /** Estimated completion time */
  estimatedCompletionTime?: Date;
}

/**
 * Progress callback function
 */
export type ExportProgressCallback = (progress: ExportProgress) => void;

// ============================================================================
// Export Result Types
// ============================================================================

/**
 * Result of a synchronous export operation
 */
export interface ExportResult {
  /** Generated file buffer */
  buffer: Buffer;
  /** Export format used */
  format: ExportFormat;
  /** Number of rows exported */
  rowCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Content-Type for HTTP response */
  contentType: string;
  /** Suggested filename */
  filename: string;
  /** Generation duration in ms */
  durationMs: number;
}

/**
 * Export error details
 */
export interface ExportError {
  /** Error message */
  message: string;
  /** Error code */
  code: ExportErrorCode;
  /** Row number if applicable */
  rowNumber?: number;
  /** Column if applicable */
  column?: string;
  /** Original error */
  cause?: Error;
}

/**
 * Export error codes
 */
export type ExportErrorCode =
  | 'NO_DATA'           // No data to export
  | 'INVALID_FORMAT'    // Unsupported export format
  | 'INVALID_COLUMNS'  // Invalid column configuration
  | 'STREAM_ERROR'     // Error during streaming
  | 'MEMORY_LIMIT'     // Memory limit exceeded
  | 'WRITE_ERROR'      // Error writing output
  | 'QUERY_ERROR';     // Database query error

// ============================================================================
// Filter & Sort Types
// ============================================================================

/**
 * Export filter definition
 */
export interface ExportFilter {
  /** Field to filter on */
  field: string;
  /** Filter operator */
  operator: FilterOperator;
  /** Filter value(s) */
  value: unknown | unknown[];
}

/**
 * Filter operators
 */
export type FilterOperator = 
  | 'eq'      // equals
  | 'ne'      // not equals
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'in'      // in list
  | 'notIn'   // not in list
  | 'like'    // contains (string)
  | 'between' // between two values
  | 'isNull'  // is null
  | 'isNotNull'; // is not null

/**
 * Export sort definition
 */
export interface ExportSort {
  /** Field to sort by */
  field: string;
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Export query options (for database-backed exports)
 */
export interface ExportQueryOptions<T = unknown> {
  /** Tenant scope - company ID (required for security) */
  companyId: number;
  /** Outlet ID for outlet-scoped exports */
  outletId?: number;
  /** Filters to apply */
  filters?: ExportFilter[];
  /** Sort order */
  sort?: ExportSort[];
  /** Column selector */
  columns?: ColumnSelector<T>;
  /** Maximum rows to export (0 = unlimited) */
  maxRows?: number;
}

// ============================================================================
// Template Types
// ============================================================================

/**
 * Export template definition
 */
export interface ExportTemplate {
  /** Template name */
  name: string;
  /** Entity type */
  entityType: string;
  /** Template version */
  version: string;
  /** Column definitions */
  columns: ExportColumn[];
  /** Default options */
  defaultOptions?: ExportOptions;
  /** Description */
  description?: string;
}

/**
 * Predefined export templates per entity type
 */
export interface EntityExportTemplate {
  /** Entity type (e.g., 'items', 'customers') */
  entityType: string;
  /** Available templates */
  templates: ExportTemplate[];
}

// ============================================================================
// Export Metadata Types
// ============================================================================

/**
 * Export metadata for audit/追溯
 */
export interface ExportMetadata {
  /** Export ID */
  id: string;
  /** Company ID */
  companyId: number;
  /** User who initiated export */
  userId?: number;
  /** Entity type exported */
  entityType: string;
  /** Format used */
  format: ExportFormat;
  /** Number of rows */
  rowCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Columns included */
  columns: string[];
  /** Filters applied */
  filters?: ExportFilter[];
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt?: Date;
  /** Status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
