// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Framework Types
 * 
 * Shared types and interfaces for the import framework supporting CSV/Excel parsing,
 * validation, and batch processing across all domain modules.
 */

// ============================================================================
// Field Types
// ============================================================================

/**
 * Supported field types for import validation
 */
export type FieldType = 
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'uuid';

/**
 * Column mapping from spreadsheet column to field definition
 */
export interface ColumnMapping {
  /** Source column header name (from CSV/Excel) */
  sourceColumn: string;
  /** Target field name in the domain model */
  targetField: string;
  /** Field type for validation */
  fieldType: FieldType;
  /** Whether this field is required */
  required?: boolean;
  /** For enum types, list of valid values */
  enumValues?: string[];
  /** Optional default value if not provided */
  defaultValue?: unknown;
}

/**
 * Parse options for CSV/Excel parsing
 */
export interface ParseOptions {
  /** Column mappings to validate/transform headers */
  columnMappings?: ColumnMapping[];
  /** Sheet name for Excel files (default: first sheet) */
  sheetName?: string;
  /** Whether to skip empty rows (default: true) */
  skipEmptyRows?: boolean;
  /** Expected number of header columns (for validation) */
  expectedColumns?: number;
  /** Custom header row index (0-based, default: 0) */
  headerRowIndex?: number;
  /** CSV delimiter (default: auto-detect) */
  delimiter?: string;
  /** File encoding (default: utf8) */
  encoding?: BufferEncoding;
}

// ============================================================================
// Import Row & Result Types
// ============================================================================

/**
 * A single parsed row from an import file
 */
export interface ImportRow {
  /** 1-based row number in the source file */
  rowNumber: number;
  /** Parsed column values keyed by column header */
  data: Record<string, unknown>;
  /** Original raw data as array (for error reporting) */
  rawData: string[];
}

/**
 * Result of parsing a single row
 */
export interface ParseResult {
  /** Successfully parsed row */
  row?: ImportRow;
  /** Parse error if any */
  error?: ImportError;
}

/**
 * Overall result of parsing an import file
 */
export interface ImportParseResult {
  /** All successfully parsed rows */
  rows: ImportRow[];
  /** All parse errors encountered */
  errors: ImportError[];
  /** Total rows processed */
  totalRows: number;
  /** Whether parsing was aborted due to critical error */
  aborted?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error severity levels
 */
export type ErrorSeverity = 'error' | 'warning';

/**
 * Import error with row and column context
 */
export interface ImportError {
  /** 1-based row number where error occurred */
  rowNumber: number;
  /** Column name where error occurred (if applicable) */
  column?: string;
  /** Field name where error occurred (if applicable) */
  field?: string;
  /** Human-readable error message */
  message: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Error code for programmatic handling */
  code: ImportErrorCode;
  /** Original raw value that caused the error (if applicable) */
  rawValue?: unknown;
}

/**
 * Import error codes for programmatic handling
 */
export type ImportErrorCode =
  | 'PARSE_ERROR'           // Malformed row/format
  | 'MISSING_REQUIRED'      // Required field missing
  | 'INVALID_TYPE'          // Value doesn't match expected type
  | 'INVALID_FORMAT'        // Value doesn't match required format
  | 'INVALID_ENUM'          // Value not in enum options
  | 'DUPLICATE_ROW'         // Duplicate row detected
  | 'DUPLICATE_KEY'         // Duplicate key within batch
  | 'FK_REFERENCE_INVALID'  // Foreign key doesn't exist
  | 'ENCODING_ERROR'        // Encoding detection/conversion error
  | 'FILE_TOO_LARGE'        // File exceeds size limit
  | 'INVALID_FILE_TYPE'     // Unsupported file format
  | 'MISSING_HEADER'        // Required column header missing
  | 'ROW_TOO_SHORT'         // Row has fewer columns than expected
  | 'ROW_TOO_LONG'          // Row has more columns than expected
  | 'BATCH_PROCESSING_ERROR'; // Error during batch processing

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation context passed to validators
 */
export interface ValidationContext {
  /** Company ID for tenant isolation */
  companyId: number;
  /** Outlet ID if applicable */
  outletId?: number;
  /** Additional tenant-scoped data */
  tenantScope?: {
    companyId: number;
    outletId?: number;
  };
  /** All rows in current batch (for duplicate detection) */
  batchRows?: ImportRow[];
  /** Previously validated rows (for cross-batch duplicate detection) */
  existingRows?: Map<string, unknown>[];
}

/**
 * Result of validating a single row
 */
export interface ValidationResult<T = unknown> {
  /** Whether the row passed validation */
  valid: boolean;
  /** Parsed/transformed row data if valid */
  data?: T;
  /** All errors and warnings for this row */
  errors: ImportError[];
  /** Warnings (non-blocking issues) */
  warnings: ImportError[];
}

/**
 * Result of validating multiple rows
 */
export interface MultiRowValidationResult<T = unknown> {
  /** Rows that passed validation */
  validRows: Array<{ row: ImportRow; data: T }>;
  /** Rows that failed validation */
  invalidRows: Array<{ row: ImportRow; errors: ImportError[] }>;
  /** Total errors across all rows */
  totalErrors: number;
  /** Total warnings across all rows */
  totalWarnings: number;
  /** All errors collected */
  errors: ImportError[];
  /** Summary by error code */
  errorSummary: Record<ImportErrorCode, number>;
}

// ============================================================================
// Validator Interface
// ============================================================================

/**
 * Entity-specific validator interface
 * Implement this interface to create validators for different entity types
 */
export interface ImportValidator<T = unknown> {
  /**
   * Validate a single row
   * @param row - The raw import row
   * @param context - Validation context with tenant info
   * @returns Validation result with parsed data or errors
   */
  validate(row: ImportRow, context: ValidationContext): ValidationResult<T>;

  /**
   * Get list of required field names
   */
  getRequiredFields(): string[];

  /**
   * Get field type definitions for all supported fields
   */
  getFieldTypes(): Record<string, FieldType>;

  /**
   * Get column mappings for this entity type
   */
  getColumnMappings(): ColumnMapping[];

  /**
   * Optional: Validate foreign key references
   * Called after row-level validation for async FK checks
   */
  validateForeignKeys?(rows: T[], context: ValidationContext): Promise<ImportError[]>;

  /**
   * Optional: Get duplicate key extractor function
   * Used for detecting duplicates within batch
   */
  getDuplicateKey?(row: T): string | undefined;
}

// ============================================================================
// Batch Processing Types
// ============================================================================

/**
 * Options for batch processing
 */
export interface BatchOptions {
  /** Company ID for tenant isolation (required) */
  companyId: number;
  /** Outlet ID if applicable */
  outletId?: number;
  /** User performing the import */
  userId?: number;
  /** Import session ID for audit tracking */
  importSessionId?: string;
  /** Number of rows per batch (default: 100) */
  batchSize?: number;
  /** Maximum number of errors before aborting (default: unlimited) */
  maxErrors?: number;
  /** Whether to continue processing after errors (default: true) */
  continueOnError?: boolean;
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** Row that started the batch (for logging) */
  startRowNumber?: number;
}

/**
 * Progress callback function
 */
export type ProgressCallback = (progress: ProgressInfo) => void;

/**
 * Progress information passed to callbacks
 */
export interface ProgressInfo {
  /** Total rows to process */
  totalRows: number;
  /** Rows successfully processed */
  processedRows: number;
  /** Current batch number (1-based) */
  currentBatch: number;
  /** Total batches */
  totalBatches: number;
  /** Rows processed in current batch */
  batchRowsProcessed: number;
  /** Errors encountered so far */
  errorsEncountered: number;
  /** Current phase */
  phase: 'parsing' | 'validating' | 'processing' | 'complete';
}

/**
 * Context for batch processing
 */
export interface BatchContext {
  /** Company ID for tenant isolation */
  companyId: number;
  /** Outlet ID if applicable */
  outletId?: number;
  /** User performing the import */
  userId?: number;
  /** Import session ID for audit tracking */
  importSessionId?: string;
  /** Start time for timing */
  startTime: Date;
  /** Database connection for transaction-scoped operations */
  connection?: import("mysql2/promise").PoolConnection;
}

/**
 * Result of processing a single batch
 */
export interface BatchResult<T = unknown> {
  /** Successfully processed items */
  processed: T[];
  /** Items that failed in this batch */
  failed: Array<{ item: T; error: ImportError }>;
  /** Whether this batch committed (all succeeded) */
  committed: boolean;
  /** Batch number (1-based) */
  batchNumber: number;
  /** Processing duration in ms */
  durationMs: number;
}

/**
 * Result of processing all batches
 */
export interface BatchProcessingResult<T = unknown> {
  /** All successfully processed items */
  processed: T[];
  /** All failed items with errors */
  failed: Array<{ item: T; error: ImportError }>;
  /** Total batches processed */
  totalBatches: number;
  /** Batches that committed successfully */
  batchesCompleted: number;
  /** Batches that failed and were rolled back */
  batchesFailed: number;
  /** Total rows processed */
  totalRows: number;
  /** Total rows that failed */
  totalErrors: number;
  /** Total processing duration in ms */
  totalDurationMs: number;
  /** Whether processing was aborted due to max errors */
  aborted?: boolean;
}

/**
 * Batch processor interface
 * Implement this to define how each batch is processed
 */
export interface BatchProcessor<T = unknown> {
  /**
   * Process a batch of items
   * @param items - Items to process in this batch
   * @param context - Batch processing context
   * @returns Result of processing
   */
  processBatch(items: T[], context: BatchContext): Promise<BatchResult<T>>;

  /**
   * Called after a batch succeeds
   * @param results - Items that were processed
   */
  onBatchSuccess?(results: T[]): Promise<void>;

  /**
   * Called after a batch fails
   * @param error - Error that caused the failure
   * @param items - Items that were attempted
   */
  onBatchError?(error: Error, items: T[]): Promise<void>;
}

// ============================================================================
// Import Session Types
// ============================================================================

/**
 * Import session for tracking import operations
 */
export interface ImportSession {
  /** Unique session identifier */
  id: string;
  /** Company ID */
  companyId: number;
  /** User who initiated the import */
  userId: number;
  /** Entity type being imported */
  entityType: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  fileSize: number;
  /** Total rows in file */
  totalRows: number;
  /** Rows successfully imported */
  importedRows: number;
  /** Rows that failed */
  failedRows: number;
  /** Session status */
  status: ImportSessionStatus;
  /** Errors encountered */
  errors: ImportError[];
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt?: Date;
}

/**
 * Import session status
 */
export type ImportSessionStatus = 
  | 'pending'
  | 'parsing'
  | 'validating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ============================================================================
// Template Types
// ============================================================================

/**
 * Template column definition
 */
export interface TemplateColumn {
  /** Column header name */
  header: string;
  /** Field name */
  field: string;
  /** Field type */
  fieldType: FieldType;
  /** Whether required */
  required: boolean;
  /** Description for tooltips */
  description?: string;
  /** For enum fields, valid values */
  enumValues?: string[];
  /** Example value */
  example?: string;
}

/**
 * Import template definition
 */
export interface ImportTemplate {
  /** Template name */
  name: string;
  /** Entity type */
  entityType: string;
  /** Template version */
  version: string;
  /** Column definitions */
  columns: TemplateColumn[];
  /** Sample rows (optional) */
  sampleRows?: Record<string, unknown>[];
}

// ============================================================================
// Batch FK Validation Types (TD-012)
// ============================================================================

/**
 * Request for a single foreign key lookup batch.
 * Groups IDs by table to enable single-query IN-clause lookups.
 */
export interface FkLookupRequest {
  /** Target table name (e.g., 'item_groups', 'outlets') */
  table: string;
  /** Unique IDs to validate (deduplicated Set) */
  ids: Set<number>;
  /** Company ID for tenant isolation */
  companyId: number;
}

/**
 * Result of batch FK validation.
 * Map structure: tableName -> id -> exists (boolean)
 * 
 * @example
 * const exists = fkResults.get('item_groups')?.get(123);
 * if (!exists) {
 *   // FK validation failed
 * }
 */
export type FkLookupResults = Map<string, Map<number, boolean>>;
