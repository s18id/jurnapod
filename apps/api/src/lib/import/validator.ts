// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Validation Framework for Import
 * 
 * Provides row-level validation with specific column references,
 * type checking, format validation, and duplicate detection.
 */

import { sql } from "kysely";
import { getDb } from "../db.js";
import type {
  ImportRow,
  ImportError,
  ImportValidator,
  ValidationResult,
  ValidationContext,
  MultiRowValidationResult,
  FieldType,
  ImportErrorCode,
  FkLookupRequest,
  FkLookupResults,
} from './types.js';

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate rows using an entity-specific validator
 * 
 * @param rows - Rows to validate
 * @param validator - Entity-specific validator
 * @param context - Validation context
 * @returns Validation result with valid/invalid rows
 */
export function validateRows<T>(
  rows: ImportRow[],
  validator: ImportValidator<T>,
  context: ValidationContext
): MultiRowValidationResult<T> {
  const validRows: Array<{ row: ImportRow; data: T }> = [];
  const invalidRows: Array<{ row: ImportRow; errors: ImportError[] }> = [];
  const allErrors: ImportError[] = [];
  const errorSummary: Record<ImportErrorCode, number> = {} as Record<ImportErrorCode, number>;
  let totalWarnings = 0;

  // Track duplicates within batch
  const seenKeys = new Map<string, number>(); // key -> rowNumber

  for (const row of rows) {
    const result = validator.validate(row, context);

    if (result.valid && result.data) {
      // Check for duplicates within batch
      if (validator.getDuplicateKey) {
        const key = validator.getDuplicateKey(result.data);
        if (key !== undefined) {
          const existingRow = seenKeys.get(key);
          if (existingRow !== undefined) {
            // Duplicate found - mark only the current row as invalid
            const dupError: ImportError = {
              rowNumber: row.rowNumber,
              message: `Duplicate key "${key}" - already exists in row ${existingRow}`,
              severity: 'error',
              code: 'DUPLICATE_KEY',
              field: 'id',
            };
            
            result.errors.push(dupError);
            result.valid = false;
          } else {
            seenKeys.set(key, row.rowNumber);
          }
        }
      }

      if (result.valid) {
        validRows.push({ row, data: result.data });
        totalWarnings += result.warnings.length;
      } else {
        invalidRows.push({ row, errors: result.errors });
        allErrors.push(...result.errors);
      }
    } else {
      invalidRows.push({ row, errors: result.errors });
      allErrors.push(...result.errors);
    }

    // Track error summary
    for (const error of result.errors) {
      errorSummary[error.code] = (errorSummary[error.code] || 0) + 1;
    }
  }

  return {
    validRows,
    invalidRows,
    totalErrors: allErrors.length,
    totalWarnings,
    errors: allErrors,
    errorSummary,
  };
}

/**
 * Validate a single value against a field type
 */
export function validateFieldType(
  value: unknown,
  fieldType: FieldType,
  fieldName: string
): ImportError | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined; // Empty values handled by required field check
  }

  const strValue = String(value).trim();

  switch (fieldType) {
    case 'string':
      // All values are valid strings
      return undefined;

    case 'number': {
      const num = parseFloat(strValue);
      if (isNaN(num)) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid number: "${value}"`,
          severity: 'error',
          code: 'INVALID_TYPE',
          rawValue: value,
        };
      }
      return undefined;
    }

    case 'integer': {
      // Check if the string represents a valid integer (no decimal point)
      const intRegex = /^-?\d+$/;
      if (!intRegex.test(strValue)) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid integer: "${value}"`,
          severity: 'error',
          code: 'INVALID_TYPE',
          rawValue: value,
        };
      }
      const int = parseInt(strValue, 10);
      if (isNaN(int)) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid integer: "${value}"`,
          severity: 'error',
          code: 'INVALID_TYPE',
          rawValue: value,
        };
      }
      return undefined;
    }

    case 'boolean': {
      const lower = strValue.toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(lower)) {
        return undefined;
      }
      if (['false', '0', 'no', 'n', 'off', ''].includes(lower)) {
        return undefined;
      }
      return {
        rowNumber: 0,
        field: fieldName,
        message: `Invalid boolean: "${value}". Use true/false, 1/0, yes/no, on/off`,
        severity: 'error',
        code: 'INVALID_TYPE',
        rawValue: value,
      };
    }

    case 'date': {
      // Validate YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(strValue)) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid date format: "${value}". Expected YYYY-MM-DD`,
          severity: 'error',
          code: 'INVALID_FORMAT',
          rawValue: value,
        };
      }
      // Validate it's a real date
      const date = new Date(strValue);
      if (isNaN(date.getTime())) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid date: "${value}" is not a real date`,
          severity: 'error',
          code: 'INVALID_FORMAT',
          rawValue: value,
        };
      }
      return undefined;
    }

    case 'datetime': {
      // Validate RFC 3339 or ISO format
      const dtRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
      if (!dtRegex.test(strValue)) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid datetime format: "${value}". Expected ISO 8601 format`,
          severity: 'error',
          code: 'INVALID_FORMAT',
          rawValue: value,
        };
      }
      const dt = new Date(strValue);
      if (isNaN(dt.getTime())) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid datetime: "${value}" is not a real datetime`,
          severity: 'error',
          code: 'INVALID_FORMAT',
          rawValue: value,
        };
      }
      return undefined;
    }

    case 'enum':
      // Enums are validated separately with enumValues
      return undefined;

    case 'uuid': {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(strValue)) {
        return {
          rowNumber: 0,
          field: fieldName,
          message: `Invalid UUID: "${value}"`,
          severity: 'error',
          code: 'INVALID_FORMAT',
          rawValue: value,
        };
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Validate enum value
 */
export function validateEnum(
  value: unknown,
  enumValues: string[],
  fieldName: string
): ImportError | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const strValue = String(value).trim();
  if (!enumValues.map((v) => v.toLowerCase()).includes(strValue.toLowerCase())) {
    return {
      rowNumber: 0,
      field: fieldName,
      message: `Invalid value: "${value}". Must be one of: ${enumValues.join(', ')}`,
      severity: 'error',
      code: 'INVALID_ENUM',
      rawValue: value,
    };
  }
  return undefined;
}

/**
 * Validate required fields
 */
export function validateRequired(
  row: ImportRow,
  requiredFields: string[]
): ImportError[] {
  const errors: ImportError[] = [];

  for (const field of requiredFields) {
    const value = row.data[field];
    if (value === undefined || value === null || value === '') {
      errors.push({
        rowNumber: row.rowNumber,
        field,
        message: `Required field "${field}" is missing or empty`,
        severity: 'error',
        code: 'MISSING_REQUIRED',
      });
    }
  }

  return errors;
}

// ============================================================================
// Base Validator Helper
// ============================================================================

/**
 * Base validator class with common validation logic
 * Extend this to create entity-specific validators
 */
export abstract class BaseImportValidator<T> implements ImportValidator<T> {
  protected abstract readonly entityType: string;
  protected abstract readonly fieldTypes: Record<string, FieldType>;
  protected abstract readonly columnMappings: Array<{
    sourceColumn: string;
    targetField: string;
    fieldType: FieldType;
    required?: boolean;
    enumValues?: string[];
    defaultValue?: unknown;
  }>;

  validate(row: ImportRow, _context: ValidationContext): ValidationResult<T> {
    const errors: ImportError[] = [];
    const warnings: ImportError[] = [];

    // Validate required fields
    const requiredFields = this.getRequiredFields();
    errors.push(...validateRequired(row, requiredFields));

    // Validate field types and formats
    const fieldTypes = this.getFieldTypes();
    for (const [field, fieldType] of Object.entries(fieldTypes)) {
      const value = row.data[field];
      
      // Skip validation for empty optional fields
      if ((value === undefined || value === null || value === '') && !requiredFields.includes(field)) {
        continue;
      }

      // Validate type
      const typeError = validateFieldType(value, fieldType, field);
      if (typeError) {
        typeError.rowNumber = row.rowNumber;
        errors.push(typeError);
      }

      // Validate enum if applicable
      const mapping = this.columnMappings.find((m) => m.targetField === field);
      if (mapping?.enumValues) {
        const enumError = validateEnum(value, mapping.enumValues, field);
        if (enumError) {
          enumError.rowNumber = row.rowNumber;
          errors.push(enumError);
        }
      }
    }

    // Parse and return data if no errors
    if (errors.length === 0) {
      return {
        valid: true,
        data: this.parseRow(row),
        errors: [],
        warnings: [],
      };
    }

    return {
      valid: false,
      errors,
      warnings,
    };
  }

  abstract getRequiredFields(): string[];
  
  abstract getFieldTypes(): Record<string, FieldType>;
  
  getColumnMappings() {
    return this.columnMappings.map((m) => ({
      sourceColumn: m.sourceColumn,
      targetField: m.targetField,
      fieldType: m.fieldType,
      required: m.required,
      enumValues: m.enumValues,
      defaultValue: m.defaultValue,
    }));
  }

  abstract parseRow(row: ImportRow): T;

  getDuplicateKey?(row: T): string | undefined;
}

// ============================================================================
// Composite Validator (for cross-field validation)
// ============================================================================

/**
 * Create a composite validator that combines multiple validators
 */
export function composeValidators<T>(
  baseValidator: ImportValidator<T>,
  additionalChecks: Array<{
    name: string;
    validate: (row: ImportRow, data: T) => ImportError | undefined;
  }>
): ImportValidator<T> {
  return {
  validate(row: ImportRow, _context: ValidationContext): ValidationResult<T> {
      // First run base validation
      const baseResult = baseValidator.validate(row, _context);
      
      if (!baseResult.valid || !baseResult.data) {
        return baseResult;
      }

      // Run additional checks
      for (const check of additionalChecks) {
        const error = check.validate(row, baseResult.data);
        if (error) {
          error.rowNumber = row.rowNumber;
          baseResult.errors.push(error);
          baseResult.valid = false;
        }
      }

      return baseResult;
    },

    getRequiredFields(): string[] {
      return baseValidator.getRequiredFields();
    },

    getFieldTypes(): Record<string, FieldType> {
      return baseValidator.getFieldTypes();
    },

    getColumnMappings() {
      return baseValidator.getColumnMappings();
    },

    validateForeignKeys: baseValidator.validateForeignKeys,
    getDuplicateKey: baseValidator.getDuplicateKey,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Create an import error with context
 */
export function createValidationError(
  rowNumber: number,
  code: ImportErrorCode,
  message: string,
  field?: string,
  column?: string,
  severity: 'error' | 'warning' = 'error'
): ImportError {
  return {
    rowNumber,
    code,
    message,
    field,
    column,
    severity,
  };
}

/**
 * Group errors by field for better error reporting
 */
export function groupErrorsByField(
  errors: ImportError[]
): Map<string, ImportError[]> {
  const grouped = new Map<string, ImportError[]>();
  
  for (const error of errors) {
    const field = error.field || 'general';
    const existing = grouped.get(field) || [];
    existing.push(error);
    grouped.set(field, existing);
  }
  
  return grouped;
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(
  result: MultiRowValidationResult<unknown>
): string {
  const lines: string[] = [];
  
  lines.push(`Validation completed:`);
  lines.push(`  Valid rows: ${result.validRows.length}`);
  lines.push(`  Invalid rows: ${result.invalidRows.length}`);
  lines.push(`  Total errors: ${result.totalErrors}`);
  lines.push(`  Total warnings: ${result.totalWarnings}`);
  
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Error summary:');
    for (const [code, count] of Object.entries(result.errorSummary)) {
      lines.push(`  ${code}: ${count}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Batch FK Validation (TD-012 - Anti-N+1 Pattern)
// ============================================================================

/**
 * ⚠️ ANTI-PATTERN WARNING ⚠️
 * 
 * The N+1 query problem occurs when FK validation loops over rows and makes
 * a database query per row:
 * 
 *   for (const row of rows) {
 *     const exists = await db.execute("SELECT id FROM item_groups WHERE id = ?", [row.id]);
 *   }
 * 
 * This causes N database round-trips for N rows, causing severe performance
 * degradation with large imports (1000+ rows = 1000+ queries).
 * 
 * The SOLUTION is batch validation: collect all IDs upfront, execute ONE query
 * with an IN clause, then lookup results in O(1) time per row.
 * 
 *   const allIds = [...new Set(rows.map(r => r.id))];
 *   const results = await db.execute("SELECT id FROM table WHERE id IN (?)", [allIds]);
 *   const existingIds = new Set(results.map(r => r.id));
 *   for (const row of rows) {
 *     if (!existingIds.has(row.id)) { /* error *\/ }
 *   }
 */

/**
 * Batch-validates foreign key references using a single query per table.
 * 
 * This function solves the N+1 query problem by:
 * 1. Grouping FK lookups by table
 * 2. Executing one `SELECT ... IN (?)` query per table
 * 3. Returning a Map for O(1) per-row lookup after batch query
 * 
 * **Pattern:**
 * ```typescript
 * // BEFORE (N queries - ANTI-PATTERN):
 * for (const row of rows) {
 *   const exists = await db.selectFrom('item_groups')
 *     .where('id', '=', row.item_group_id)
 *     .executeTakeFirst();
 * }
 * 
 * // AFTER (1 query per table - OPTIMAL):
 * const fkResults = await batchValidateForeignKeys([{
 *   table: 'item_groups',
 *   ids: new Set(rows.map(r => r.item_group_id)),
 *   companyId
 * }], db);
 * 
 * for (const row of rows) {
 *   const exists = fkResults.get('item_groups')?.get(row.item_group_id);
 *   // ...
 * }
 * ```
 * 
 * @param requests - Array of FK lookup requests grouped by table
 * @param pool - MySQL connection pool
 * @returns Map structure: tableName -> id -> exists (boolean)
 * 
 * @example
 * ```typescript
 * // Collect all FK IDs from rows
 * const itemGroupIds = new Set<number>();
 * const outletIds = new Set<number>();
 * 
 * for (const row of rows) {
 *   if (row.item_group_id) itemGroupIds.add(row.item_group_id);
 *   if (row.outlet_id) outletIds.add(row.outlet_id);
 * }
 * 
 * // Batch validate all FKs with 1-2 queries total
 * const fkResults = await batchValidateForeignKeys([
 *   { table: 'item_groups', ids: itemGroupIds, companyId },
 *   { table: 'outlets', ids: outletIds, companyId },
 * ], pool);
 * 
 * // O(1) lookup per row
 * for (const row of rows) {
 *   const groupExists = fkResults.get('item_groups')?.get(row.item_group_id);
 *   if (!groupExists) {
 *     errors.push({ field: 'item_group_id', message: '...' });
 *   }
 * }
 * ```
 */
export async function batchValidateForeignKeys(
  requests: FkLookupRequest[]
): Promise<FkLookupResults> {
  const db = getDb();
  const results: FkLookupResults = new Map();
  const allowedFkTables = new Set([
    "item_groups",
    "outlets",
    "items",
    "tax_rates",
    "accounts",
    "users",
    "suppliers",
    "customers",
    "tables"
  ]);
  
  // Filter out empty ID sets and group by table
  const requestsByTable = new Map<string, FkLookupRequest[]>();
  for (const request of requests) {
    if (!allowedFkTables.has(request.table)) {
      throw new Error(`INVALID_FK_TABLE:${request.table}`);
    }

    if (request.ids.size === 0) {
      // Empty set - no lookup needed, all IDs are "not found" but valid case
      // Only add to results if we want to track this table
      continue;
    }
    
    const existing = requestsByTable.get(request.table) || [];
    existing.push(request);
    requestsByTable.set(request.table, existing);
  }
  
  // Execute one query per table
  for (const [table, tableRequests] of requestsByTable.entries()) {
    // Merge all IDs and companyIds for this table
    // Since we expect same companyId across requests, use first one
    const companyId = tableRequests[0].companyId;
    const allIds = new Set<number>();
    
    for (const request of tableRequests) {
      for (const id of request.ids) {
        allIds.add(id);
      }
    }
    
    if (allIds.size === 0) {
      continue;
    }
    
    // Execute single query with IN clause using Kysely
    // WARNING: MySQL IN clause has limits - for very large sets (>10k), consider batching
    if (allIds.size <= 100) {
      // Single query for smaller sets
      const rows = await sql`SELECT id FROM ${sql.table(table)} WHERE company_id = ${companyId} AND id IN (${sql.join([...allIds].map(id => sql`${id}`))})`.execute(db);
      
      // Build existence map for O(1) lookup
      const existingIds = new Set<number>();
      for (const row of rows.rows) {
        existingIds.add(Number((row as { id: number }).id));
      }
      
      // Mark all requested IDs - found or not found
      const tableResult = new Map<number, boolean>();
      for (const id of allIds) {
        tableResult.set(id, existingIds.has(id));
      }
      results.set(table, tableResult);
    } else {
      // Handle very large ID sets (>100) by batching the IN clause
      const BATCH_SIZE = 100;
      const idArray = [...allIds];
      const existingIds = new Set<number>();
      
      for (let i = 0; i < idArray.length; i += BATCH_SIZE) {
        const batch = idArray.slice(i, i + BATCH_SIZE);
        const rows = await sql`SELECT id FROM ${sql.table(table)} WHERE company_id = ${companyId} AND id IN (${sql.join(batch.map(id => sql`${id}`))})`.execute(db);
        
        for (const row of rows.rows) {
          existingIds.add(Number((row as { id: number }).id));
        }
      }
      
      // Build existence map for O(1) lookup
      const tableResult = new Map<number, boolean>();
      for (const id of allIds) {
        tableResult.set(id, existingIds.has(id));
      }
      results.set(table, tableResult);
    }
  }
  
  return results;
}
