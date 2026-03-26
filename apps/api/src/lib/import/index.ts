// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Framework - Public API
 * 
 * This module exports all public types and functions for the import framework.
 * Use this module when implementing entity-specific imports.
 */

// Types
export {
  type FieldType,
  type ColumnMapping,
  type ParseOptions,
  type ImportRow,
  type ImportError,
  type ImportErrorCode,
  type ErrorSeverity,
  type ValidationContext,
  type ValidationResult,
  type MultiRowValidationResult,
  type ImportValidator,
  type BatchOptions,
  type BatchContext,
  type BatchResult,
  type BatchProcessingResult,
  type BatchProcessor,
  type ProgressCallback,
  type ProgressInfo,
  type ImportSession,
  type ImportSessionStatus,
  type TemplateColumn,
  type ImportTemplate,
} from './types.js';

// Parsing
export {
  parseCSV,
  parseCSVSync,
  parseExcel,
  parseExcelSync,
  parseFile,
  detectFileType,
} from './parsers.js';

// Validation
export {
  validateRows,
  validateFieldType,
  validateEnum,
  validateRequired,
  BaseImportValidator,
  composeValidators,
  createValidationError,
  groupErrorsByField,
  formatValidationErrors,
} from './validator.js';

// Batch Processing
export {
  processBatches,
  processBatchesWithTransaction,
  createSimpleBatchProcessor,
  createProgressTracker,
  formatProgress,
} from './batch-processor.js';
