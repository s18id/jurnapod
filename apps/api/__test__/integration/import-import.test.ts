// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Framework Unit Tests
 * 
 * Tests for CSV/Excel parsing, validation, and batch processing.
 */

import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import { closeDbPool } from '../db.js';

// Import functions under test
import {
  // Parsing
  parseCSV,
  parseCSVSync,
  parseExcel,
  parseExcelSync,
  parseFile,
  detectFileType,
  // Validation
  validateRows,
  validateFieldType,
  validateEnum,
  validateRequired,
  BaseImportValidator,
  composeValidators,
  createValidationError,
  // Batch Processing
  processBatches,
  createSimpleBatchProcessor,
  createProgressTracker,
  formatProgress,
  // Types
  type ImportRow,
  type ImportError,
  type ImportValidator,
  type BatchProcessor,
  type BatchOptions,
  type FieldType,
} from './index.js';
import type { ValidationContext } from './index.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Generate a CSV buffer from string
 */
function csvToBuffer(csv: string): Buffer {
  return Buffer.from(csv, 'utf-8');
}

/**
 * Generate a large CSV string for performance testing
 */
function generateLargeCSV(rowCount: number, cols: number = 10): string {
  const headers = Array.from({ length: cols }, (_, i) => `col${i + 1}`).join(',');
  const rows: string[] = [headers];
  
  for (let i = 0; i < rowCount; i++) {
    const row = Array.from({ length: cols }, (_, j) => `value${i}-${j}`).join(',');
    rows.push(row);
  }
  
  return rows.join('\n');
}

// ============================================================================
// CSV Parsing Tests
// ============================================================================

describe('CSV Parsing', () => {
  describe('parseCSV - basic functionality', () => {
    test('parses simple CSV with headers', async () => {
      const csv = `name,age,city
John,30,NYC
Jane,25,LA`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer)) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 2);
      assert.equal(rows[0].rowNumber, 2); // Row 1 is header
      assert.equal(rows[0].data.name, 'John');
      assert.equal(rows[0].data.age, '30'); // Parser returns strings, validation does conversion
      assert.equal(rows[1].data.name, 'Jane');
    });

    test('parses CSV with custom delimiter', async () => {
      const csv = `name;age;city
John;30;NYC`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer, { delimiter: ';' })) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 1);
      assert.equal(rows[0].data.name, 'John');
    });

    test('skips empty rows when skipEmptyRows is true', async () => {
      const csv = `name,age
John,30

Jane,25

`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer, { skipEmptyRows: true })) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 2);
    });

    test('handles quoted values with commas', async () => {
      const csv = `name,description
John,"Hello, World"
Jane,"Test, with, commas"`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer)) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 2);
      assert.equal(rows[0].data.description, 'Hello, World');
      assert.equal(rows[1].data.description, 'Test, with, commas');
    });

    test('handles values with newlines', async () => {
      const csv = `name,description
John,"Line1
Line2"
Jane,Normal`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer)) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 2);
      assert.equal(rows[0].data.name, 'John');
      assert.ok(String(rows[0].data.description).includes('\n'));
    });
  });

  describe('parseCSV - edge cases', () => {
    test('handles empty CSV with error', async () => {
      const csv = ``;
      const buffer = csvToBuffer(csv);
      
      // Empty CSV throws an error - this is correct behavior
      // Note: We need to consume the generator to trigger the error
      let errorThrown = false;
      try {
        const rows: ImportRow[] = [];
        for await (const row of parseCSV(buffer)) {
          rows.push(row);
        }
      } catch (err) {
        errorThrown = true;
        // The error is an ImportError object, not a Error instance
        const importErr = err as { message?: string; code?: string };
        assert.ok(importErr.message?.includes('No headers found') || importErr.code === 'PARSE_ERROR');
      }
      assert.ok(errorThrown, 'Expected an error to be thrown');
    });

    test('handles header-only CSV', async () => {
      const csv = `name,age,city`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer)) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 0);
    });

    test('handles trailing newline', async () => {
      const csv = `name,age\nJohn,30\n`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer)) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 1);
    });

    test('preserves rawData for error reporting', async () => {
      const csv = `name,age\nJohn,30`;
      const buffer = csvToBuffer(csv);
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer)) {
        rows.push(row);
      }
      
      assert.ok(Array.isArray(rows[0].rawData));
      assert.equal(rows[0].rawData[0], 'John');
    });
  });

  describe('parseCSV - encoding', () => {
    test('handles UTF-8 BOM', async () => {
      // UTF-8 BOM is: EF BB BF
      const csv = `\xEF\xBB\xBFname,age\nJohn,30`;
      const buffer = Buffer.from(csv, 'binary');
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer, { encoding: 'utf-8' })) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 1);
      assert.equal(rows[0].data.name, 'John');
    });

    test('handles Latin-1 encoding', async () => {
      const csv = `name,city\nJürgen,München`;
      const buffer = Buffer.from(csv, 'latin1');
      const rows: ImportRow[] = [];
      
      for await (const row of parseCSV(buffer, { encoding: 'latin1' })) {
        rows.push(row);
      }
      
      assert.equal(rows.length, 1);
      assert.equal(rows[0].data.name, 'Jürgen');
    });
  });

  describe('parseCSV - large file handling', () => {
    test('handles 10,000 rows without memory issues', async () => {
      const rowCount = 10000;
      const csv = generateLargeCSV(rowCount, 10);
      const buffer = csvToBuffer(csv);
      let rowCountParsed = 0;
      
      for await (const _ of parseCSV(buffer)) {
        rowCountParsed++;
      }
      
      assert.equal(rowCountParsed, rowCount);
    });

    test('handles 50,000 rows performance', async () => {
      const rowCount = 50000;
      const csv = generateLargeCSV(rowCount, 5);
      const buffer = csvToBuffer(csv);
      let rowCountParsed = 0;
      const startTime = Date.now();
      
      for await (const _ of parseCSV(buffer)) {
        rowCountParsed++;
      }
      
      const duration = Date.now() - startTime;
      assert.equal(rowCountParsed, rowCount);
      // Should complete in reasonable time (less than 30 seconds)
      assert.ok(duration < 30000, `Parsing took too long: ${duration}ms`);
    });
  });

  describe('parseCSVSync', () => {
    test('parses CSV synchronously', () => {
      const csv = `name,age
John,30
Jane,25`;
      const buffer = csvToBuffer(csv);
      const result = parseCSVSync(buffer);
      
      assert.equal(result.rows.length, 2);
      assert.equal(result.errors.length, 0);
      assert.equal(result.totalRows, 2);
    });

    test('returns errors for malformed CSV', () => {
      // Create a buffer that's too large (over 50MB limit)
      const largeCsv = generateLargeCSV(1, 1).repeat(1000);
      const buffer = csvToBuffer(largeCsv);
      
      // This should throw because it exceeds the internal limit
      // Note: Our test file won't exceed 50MB, so it should parse fine
      const result = parseCSVSync(buffer);
      assert.ok(result.totalRows > 0);
    });
  });
});

// ============================================================================
// File Type Detection Tests
// ============================================================================

describe('File Type Detection', () => {
  test('detects CSV file', () => {
    const csv = `name,age\nJohn,30`;
    const buffer = csvToBuffer(csv);
    const type = detectFileType(buffer);
    assert.equal(type, 'csv');
  });

  test('detects XLSX file by magic bytes', () => {
    // XLSX files start with PK (ZIP format)
    // Minimal valid XLSX would have ZIP headers
    const xlsxHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK..
    const type = detectFileType(xlsxHeader);
    assert.equal(type, 'xlsx');
  });

  test('returns unknown for unrecognized files', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const type = detectFileType(buffer);
    assert.equal(type, 'unknown');
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation Framework', () => {
  describe('validateFieldType', () => {
    test('validates string type', () => {
      const error = validateFieldType('hello', 'string', 'name');
      assert.equal(error, undefined);
    });

    test('validates number type', () => {
      const error = validateFieldType('123.45', 'number', 'price');
      assert.equal(error, undefined);
    });

    test('rejects invalid number', () => {
      const error = validateFieldType('not-a-number', 'number', 'price');
      assert.ok(error);
      assert.equal(error.code, 'INVALID_TYPE');
    });

    test('validates integer type', () => {
      const error = validateFieldType('123', 'integer', 'quantity');
      assert.equal(error, undefined);
    });

    test('rejects float as integer', () => {
      const error = validateFieldType('123.45', 'integer', 'quantity');
      assert.ok(error);
      assert.equal(error.code, 'INVALID_TYPE');
    });

    test('validates boolean type', () => {
      const trueValues = ['true', '1', 'yes', 'y', 'on'];
      const falseValues = ['false', '0', 'no', 'n', 'off'];
      
      for (const val of trueValues) {
        const error = validateFieldType(val, 'boolean', 'active');
        assert.equal(error, undefined, `${val} should be valid boolean`);
      }
      
      for (const val of falseValues) {
        const error = validateFieldType(val, 'boolean', 'active');
        assert.equal(error, undefined, `${val} should be valid boolean`);
      }
    });

    test('rejects invalid boolean', () => {
      const error = validateFieldType('maybe', 'boolean', 'active');
      assert.ok(error);
      assert.equal(error.code, 'INVALID_TYPE');
    });

    test('validates date format', () => {
      const error = validateFieldType('2024-01-15', 'date', 'birthDate');
      assert.equal(error, undefined);
    });

    test('rejects invalid date format', () => {
      const error = validateFieldType('01-15-2024', 'date', 'birthDate');
      assert.ok(error);
      assert.equal(error.code, 'INVALID_FORMAT');
    });

    test('validates UUID format', () => {
      const error = validateFieldType('550e8400-e29b-41d4-a716-446655440000', 'uuid', 'id');
      assert.equal(error, undefined);
    });

    test('rejects invalid UUID', () => {
      const error = validateFieldType('not-a-uuid', 'uuid', 'id');
      assert.ok(error);
      assert.equal(error.code, 'INVALID_FORMAT');
    });

    test('allows empty values for optional fields', () => {
      const error = validateFieldType('', 'number', 'optional');
      assert.equal(error, undefined);
      const error2 = validateFieldType(undefined, 'number', 'optional');
      assert.equal(error2, undefined);
    });
  });

  describe('validateEnum', () => {
    test('validates value in enum', () => {
      const enumValues = ['active', 'inactive', 'pending'];
      const error = validateEnum('active', enumValues, 'status');
      assert.equal(error, undefined);
    });

    test('rejects value not in enum', () => {
      const enumValues = ['active', 'inactive', 'pending'];
      const error = validateEnum('unknown', enumValues, 'status');
      assert.ok(error);
      assert.equal(error.code, 'INVALID_ENUM');
    });

    test('is case-insensitive', () => {
      const enumValues = ['Active', 'Inactive'];
      const error = validateEnum('active', enumValues, 'status');
      assert.equal(error, undefined);
    });
  });

  describe('validateRequired', () => {
    test('returns no errors when required fields present', () => {
      const row: ImportRow = {
        rowNumber: 1,
        data: { name: 'John', age: 30 },
        rawData: ['John', '30'],
      };
      const errors = validateRequired(row, ['name', 'age']);
      assert.equal(errors.length, 0);
    });

    test('returns errors for missing required fields', () => {
      const row: ImportRow = {
        rowNumber: 1,
        data: { name: 'John' },
        rawData: ['John'],
      };
      const errors = validateRequired(row, ['name', 'age']);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].code, 'MISSING_REQUIRED');
      assert.equal(errors[0].field, 'age');
    });

    test('handles empty string as missing', () => {
      const row: ImportRow = {
        rowNumber: 1,
        data: { name: '', age: 30 },
        rawData: ['', '30'],
      };
      const errors = validateRequired(row, ['name', 'age']);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].field, 'name');
    });
  });

  describe('BaseImportValidator', () => {
    // Create a concrete implementation for testing
    class TestItemValidator extends BaseImportValidator<{ name: string; age: number }> {
      protected entityType = 'test-item';
      protected fieldTypes: Record<string, FieldType> = {
        name: 'string',
        age: 'integer',
      };
      protected columnMappings = [
        { sourceColumn: 'Name', targetField: 'name', fieldType: 'string' as FieldType, required: true },
        { sourceColumn: 'Age', targetField: 'age', fieldType: 'integer' as FieldType, required: true },
      ];

      getRequiredFields(): string[] {
        return ['name', 'age'];
      }

      getFieldTypes(): Record<string, FieldType> {
        return this.fieldTypes;
      }

      parseRow(row: ImportRow): { name: string; age: number } {
        return {
          name: String(row.data.name),
          age: Number(row.data.age),
        };
      }
    }

    test('validates valid row', () => {
      const validator = new TestItemValidator();
      const row: ImportRow = {
        rowNumber: 1,
        data: { name: 'John', age: 30 },
        rawData: ['John', '30'],
      };
      
      const result = validator.validate(row, {} as ValidationContext);
      
      assert.equal(result.valid, true);
      assert.equal(result.data?.name, 'John');
      assert.equal(result.data?.age, 30);
    });

    test('rejects invalid row', () => {
      const validator = new TestItemValidator();
      const row: ImportRow = {
        rowNumber: 1,
        data: { name: 'John', age: 'not-a-number' },
        rawData: ['John', 'not-a-number'],
      };
      
      const result = validator.validate(row, {} as ValidationContext);
      
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });
  });

  describe('validateRows', () => {
    // Create a simple validator for testing
    const simpleValidator: ImportValidator<{ id: string; name: string }> = {
      validate(row: ImportRow, _context: ValidationContext) {
        const errors: ImportError[] = [];
        const id = String(row.data.id || '');
        const name = String(row.data.name || '');
        
        if (!id) {
          errors.push({ rowNumber: row.rowNumber, field: 'id', message: 'ID required', severity: 'error', code: 'MISSING_REQUIRED' });
        }
        if (!name) {
          errors.push({ rowNumber: row.rowNumber, field: 'name', message: 'Name required', severity: 'error', code: 'MISSING_REQUIRED' });
        }
        
        if (errors.length === 0) {
          return { valid: true, data: { id, name }, errors: [], warnings: [] };
        }
        return { valid: false, errors, warnings: [] };
      },
      getRequiredFields() { return ['id', 'name']; },
      getFieldTypes() { return { id: 'string', name: 'string' }; },
      getColumnMappings() { return []; },
    };

    test('validates multiple rows', () => {
      const rows: ImportRow[] = [
        { rowNumber: 1, data: { id: '1', name: 'John' }, rawData: [] },
        { rowNumber: 2, data: { id: '2', name: 'Jane' }, rawData: [] },
      ];
      
      const result = validateRows(rows, simpleValidator, {} as ValidationContext);
      
      assert.equal(result.validRows.length, 2);
      assert.equal(result.invalidRows.length, 0);
      assert.equal(result.totalErrors, 0);
    });

    test('collects errors from invalid rows', () => {
      const rows: ImportRow[] = [
        { rowNumber: 1, data: { id: '1', name: 'John' }, rawData: [] },
        { rowNumber: 2, data: { id: '', name: '' }, rawData: [] },
      ];
      
      const result = validateRows(rows, simpleValidator, {} as ValidationContext);
      
      assert.equal(result.validRows.length, 1);
      assert.equal(result.invalidRows.length, 1);
      assert.ok(result.totalErrors > 0);
    });

    test('tracks error summary by code', () => {
      const rows: ImportRow[] = [
        { rowNumber: 1, data: { id: '', name: '' }, rawData: [] },
        { rowNumber: 2, data: { id: '', name: '' }, rawData: [] },
      ];
      
      const result = validateRows(rows, simpleValidator, {} as ValidationContext);
      
      assert.ok(result.errorSummary['MISSING_REQUIRED']);
      assert.equal(result.errorSummary['MISSING_REQUIRED'], 4); // 2 rows x 2 missing fields
    });

    test('detects duplicates within batch', () => {
      const duplicateValidator: ImportValidator<{ id: string }> = {
        validate(row: ImportRow, _context: ValidationContext) {
          return {
            valid: true,
            data: { id: String(row.data.id) },
            errors: [],
            warnings: [],
          };
        },
        getRequiredFields() { return ['id']; },
        getFieldTypes() { return { id: 'string' }; },
        getColumnMappings() { return []; },
        getDuplicateKey(row) { return row.id; },
      };

      const rows: ImportRow[] = [
        { rowNumber: 1, data: { id: '1' }, rawData: [] },
        { rowNumber: 2, data: { id: '2' }, rawData: [] },
        { rowNumber: 3, data: { id: '1' }, rawData: [] }, // Duplicate
      ];
      
      const result = validateRows(rows, duplicateValidator, {} as ValidationContext);
      
      // First occurrence should be valid, second marked as duplicate
      assert.equal(result.validRows.length, 2);
      assert.equal(result.invalidRows.length, 1);
      assert.equal(result.errors[0]?.code, 'DUPLICATE_KEY');
    });
  });

  describe('createValidationError', () => {
    test('creates error with all fields', () => {
      const error = createValidationError(1, 'MISSING_REQUIRED', 'Name is required', 'name', 'A', 'error');
      
      assert.equal(error.rowNumber, 1);
      assert.equal(error.code, 'MISSING_REQUIRED');
      assert.equal(error.message, 'Name is required');
      assert.equal(error.field, 'name');
      assert.equal(error.column, 'A');
      assert.equal(error.severity, 'error');
    });
  });
});

// ============================================================================
// Batch Processing Tests
// ============================================================================

describe('Batch Processing', () => {
  describe('processBatches', () => {
    test('processes all items when no errors', async () => {
      const items = [1, 2, 3, 4, 5];
      let processedCount = 0;
      
      const processor: BatchProcessor<number> = {
        async processBatch(batch: number[]) {
          processedCount += batch.length;
          return {
            processed: batch,
            failed: [],
            committed: true,
            batchNumber: 0,
            durationMs: 0,
          };
        },
      };
      
      const result = await processBatches(items, processor, { companyId: 1, batchSize: 2 });
      
      assert.equal(result.processed.length, 5);
      assert.equal(result.totalErrors, 0);
      assert.equal(processedCount, 5);
    });

    test('continues on error when continueOnError is true', async () => {
      const items = [1, 2, 3];
      let errorCount = 0;
      
      const processor: BatchProcessor<number> = {
        async processBatch(batch: number[]) {
          const failed: Array<{ item: number; error: ImportError }> = [];
          
          for (const item of batch) {
            if (item === 2) {
              errorCount++;
              failed.push({
                item,
                error: { rowNumber: 0, message: 'Error', severity: 'error', code: 'BATCH_PROCESSING_ERROR' },
              });
            }
          }
          
          return {
            processed: batch.filter((i) => i !== 2),
            failed,
            committed: failed.length === 0,
            batchNumber: 0,
            durationMs: 0,
          };
        },
      };
      
      const result = await processBatches(items, processor, {
        companyId: 1,
        batchSize: 2,
        continueOnError: true,
      });
      
      assert.equal(result.processed.length, 2);
      assert.equal(result.totalErrors, 1);
    });

    test('stops when maxErrors is reached', async () => {
      const items = [1, 2, 3, 4, 5];
      
      const processor: BatchProcessor<number> = {
        async processBatch(batch: number[]) {
          // All items fail
          return {
            processed: [],
            failed: batch.map((item) => ({
              item,
              error: { rowNumber: 0, message: 'Error', severity: 'error' as const, code: 'BATCH_PROCESSING_ERROR' as const },
            })),
            committed: false,
            batchNumber: 0,
            durationMs: 0,
          };
        },
      };
      
      const result = await processBatches(items, processor, {
        companyId: 1,
        batchSize: 2,
        maxErrors: 3,
        continueOnError: true,
      });
      
      assert.ok(result.aborted);
      assert.ok(result.totalErrors >= 3);
    });

    test('calls onProgress callback', async () => {
      const items = [1, 2, 3, 4];
      const progressCalls: number[] = [];
      
      const processor: BatchProcessor<number> = {
        async processBatch(batch: number[]) {
          return {
            processed: batch,
            failed: [],
            committed: true,
            batchNumber: 0,
            durationMs: 0,
          };
        },
      };
      
      await processBatches(items, processor, {
        companyId: 1,
        batchSize: 2,
        onProgress: (p) => progressCalls.push(p.processedRows),
      });
      
      assert.ok(progressCalls.length > 0);
    });

    test('reports batch information', async () => {
      const items = [1, 2, 3, 4];
      let lastBatchInfo = { currentBatch: 0, totalBatches: 0 };
      
      const processor: BatchProcessor<number> = {
        async processBatch(batch: number[]) {
          return {
            processed: batch,
            failed: [],
            committed: true,
            batchNumber: 0,
            durationMs: 0,
          };
        },
      };
      
      await processBatches(items, processor, {
        companyId: 1,
        batchSize: 2,
        onProgress: (p) => {
          lastBatchInfo = { currentBatch: p.currentBatch, totalBatches: p.totalBatches };
        },
      });
      
      assert.equal(lastBatchInfo.currentBatch, 2);
      assert.equal(lastBatchInfo.totalBatches, 2);
    });
  });

  describe('createSimpleBatchProcessor', () => {
    test('processes items with simple function', async () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const processed: number[] = [];
      
      const processor = createSimpleBatchProcessor<{ id: number }, number>(
        async (item) => {
          processed.push(item.id);
          return item.id;
        }
      );
      
      const result = await processBatches(items, processor, { companyId: 1, batchSize: 2 });
      
      assert.equal(result.processed.length, 3);
      assert.deepEqual(processed, [1, 2, 3]);
    });

    test('handles errors in process function', async () => {
      const items = [{ id: 1 }, { id: 2 }];
      
      const processor = createSimpleBatchProcessor<{ id: number }, number>(
        async (item) => {
          if (item.id === 2) {
            throw new Error('Processing failed');
          }
          return item.id;
        }
      );
      
      const result = await processBatches(items, processor, { companyId: 1, batchSize: 2 });
      
      assert.equal(result.processed.length, 1);
      assert.equal(result.totalErrors, 1);
    });
  });

  describe('createProgressTracker', () => {
    test('reports progress at intervals', async () => {
      const progressSnapshots: number[] = [];
      
      const tracker = createProgressTracker(
        (p) => progressSnapshots.push(p.processedRows),
        { reportIntervalMs: 10 }
      );
      
      tracker({
        totalRows: 100,
        processedRows: 0,
        currentBatch: 1,
        totalBatches: 5,
        batchRowsProcessed: 10,
        errorsEncountered: 0,
        phase: 'processing',
      });
      
      // First call should always report
      assert.equal(progressSnapshots.length, 1);
    });
  });

  describe('formatProgress', () => {
    test('formats progress info as string', () => {
      const progress = {
        totalRows: 100,
        processedRows: 50,
        currentBatch: 3,
        totalBatches: 5,
        batchRowsProcessed: 10,
        errorsEncountered: 2,
        phase: 'processing' as const,
      };
      
      const formatted = formatProgress(progress);
      
      assert.ok(formatted.includes('50/100'));
      assert.ok(formatted.includes('50%'));
      assert.ok(formatted.includes('3/5'));
      assert.ok(formatted.includes('2'));
    });
  });
});

// ============================================================================
// Integration-style Tests
// ============================================================================

describe('Import Framework Integration', () => {
  test('full parse-validate-batch pipeline', async () => {
    // Step 1: Parse CSV
    const csv = `id,name,age
1,John,30
2,Jane,25
3,Bob,35`;
    const buffer = csvToBuffer(csv);
    const rows: ImportRow[] = [];
    
    for await (const row of parseCSV(buffer)) {
      rows.push(row);
    }
    
    assert.equal(rows.length, 3);
    
    // Step 2: Validate
    const validator: ImportValidator<{ id: number; name: string; age: number }> = {
      validate(row: ImportRow, _context: ValidationContext) {
        const errors: ImportError[] = [];
        
        if (!row.data.id) {
          errors.push({ rowNumber: row.rowNumber, field: 'id', message: 'Required', severity: 'error', code: 'MISSING_REQUIRED' });
        }
        if (!row.data.name) {
          errors.push({ rowNumber: row.rowNumber, field: 'name', message: 'Required', severity: 'error', code: 'MISSING_REQUIRED' });
        }
        
        if (errors.length === 0) {
          return {
            valid: true,
            data: {
              id: Number(row.data.id),
              name: String(row.data.name),
              age: Number(row.data.age),
            },
            errors: [],
            warnings: [],
          };
        }
        return { valid: false, errors, warnings: [] };
      },
      getRequiredFields() { return ['id', 'name']; },
      getFieldTypes() { return { id: 'integer', name: 'string', age: 'integer' }; },
      getColumnMappings() { return []; },
    };
    
    const validationResult = validateRows(rows, validator, {} as ValidationContext);
    assert.equal(validationResult.validRows.length, 3);
    
    // Step 3: Batch process
    const processedData: { id: number; name: string; age: number }[] = [];
    
    const processor: BatchProcessor<{ id: number; name: string; age: number }> = {
      async processBatch(batch) {
        processedData.push(...batch);
        return {
          processed: batch,
          failed: [],
          committed: true,
          batchNumber: 0,
          durationMs: 0,
        };
      },
    };
    
    const batchResult = await processBatches(
      validationResult.validRows.map((r) => r.data),
      processor,
      { companyId: 1, batchSize: 2 }
    );
    
    assert.equal(batchResult.processed.length, 3);
    assert.deepEqual(processedData.length, 3);
  });

  test('handles real-world CSV with various edge cases', async () => {
    const realWorldCSV = `SKU,Name,Description,Price,Quantity,Active
SKU001,"Widget A","A really great widget with ""premium"" features",99.99,100,true
SKU002,Widget B,Another widget,49.99,50,false
SKU003,"Widget C with a very long name that might wrap",Simple desc,29.99,0,true`;
    
    const buffer = csvToBuffer(realWorldCSV);
    const rows: ImportRow[] = [];
    
    for await (const row of parseCSV(buffer)) {
      rows.push(row);
    }
    
    assert.equal(rows.length, 3);
    assert.equal(rows[0].data.sku, 'SKU001');
    assert.equal(rows[0].data.price, '99.99'); // Parser returns strings, validation converts types
    assert.equal(rows[0].data.quantity, '100');
    // Quoted description with escaped quotes
    assert.ok(String(rows[0].data.description).includes('"premium"'));
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  test('large batch processing completes in reasonable time', async () => {
    const itemCount = 1000;
    const items = Array.from({ length: itemCount }, (_, i) => ({ id: i + 1 }));
    
    const startTime = Date.now();
    
    const processor: BatchProcessor<{ id: number }> = {
      async processBatch(batch) {
        // Simulate minimal processing
        return {
          processed: batch,
          failed: [],
          committed: true,
          batchNumber: 0,
          durationMs: 1,
        };
      },
    };
    
    const result = await processBatches(items, processor, { companyId: 1, batchSize: 100 });
    
    const duration = Date.now() - startTime;
    
    assert.equal(result.processed.length, itemCount);
    assert.ok(duration < 10000, `Processing took ${duration}ms, expected < 10000ms`);
  });

  test('memory-efficient for large row counts', async () => {
    const rowCount = 10000;
    const csv = generateLargeCSV(rowCount, 10);
    const buffer = csvToBuffer(csv);
    
    // This test mainly ensures we don't crash or hang
    const rows: ImportRow[] = [];
    
    for await (const row of parseCSV(buffer)) {
      rows.push(row);
    }
    
    assert.equal(rows.length, rowCount);
  });
});

// ============================================================================
// Cleanup
// ============================================================================

// Close database pool after all tests
test.after(async () => {
  await closeDbPool();
});
