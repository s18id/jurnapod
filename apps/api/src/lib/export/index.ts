// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Framework - Public API
 * 
 * This module exports all public types and functions for the export framework.
 * Use this module when implementing entity-specific exports.
 */

// Types
export {
  type FieldType,
  type ExportFormat,
  type ExportOptions,
  type MoneyFormatOptions,
  type FormatOptions,
  type ExportColumn,
  type ColumnSelector,
  type ComputedColumn,
  type StreamingExport,
  type ExportProgress,
  type ExportProgressCallback,
  type ExportResult,
  type ExportError,
  type ExportErrorCode,
  type ExportFilter,
  type FilterOperator,
  type ExportSort,
  type ExportQueryOptions,
  type ExportTemplate,
  type EntityExportTemplate,
  type ExportMetadata,
} from './types.js';

// Formatters
export {
  formatValue,
  formatDate,
  formatDateTime,
  formatMoney,
  formatBoolean,
  formatNumber,
  camelCaseToFriendly,
  getColumnHeader,
  buildColumnMap,
  extractColumnValue,
  resolveRowValues,
  mergeFormatOptions,
  createFormatOptions,
  validateColumns,
  validateExportOptions,
  escapeCSVValue,
  isEmptyValue,
  toExportString,
} from './formatter.js';

// Generators
export {
  generateCSV,
  generateCSVBuffer,
  generateExcel,
  generateExport,
  detectFormatFromFilename,
  getContentType,
  getFileExtension,
  generateCSVStream,
  processInChunks,
  createReadableStream,
  createDefaultOptions,
  validateExportData,
} from './generators.js';

// Streaming
export {
  streamExport,
  streamExportFromDatabase,
  streamExportWithTransaction,
  createProgressTracker,
  estimateExportDuration,
  shouldUseStreaming,
  createExportError,
} from './streaming.js';
