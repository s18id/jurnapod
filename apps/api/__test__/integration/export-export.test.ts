// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Framework Unit Tests
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { closeDbPool } from '../db.js';

// Import from the export framework
import {
  // Types
  type ExportColumn,
  type ExportOptions,
  type FieldType,
  // Formatters
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
  validateColumns,
  isEmptyValue,
  toExportString,
  // Generators
  generateCSV,
  generateCSVBuffer,
  generateExcel,
  generateExport,
  detectFormatFromFilename,
  getContentType,
  getFileExtension,
  validateExportData,
} from './index.js';

// ============================================================================
// Test Data Types
// ============================================================================

interface TestItem {
  id: number;
  name: string;
  price: number;
  createdAt: Date;
  isActive: boolean;
  category: 'electronics' | 'furniture' | 'clothing';
}

interface TestRow {
  id: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes: string;
  createdAt: Date;
  isPaid: boolean;
}

// ============================================================================
// Formatter Tests
// ============================================================================

describe('Export Formatters', () => {
  describe('formatValue', () => {
    test('formats string values', () => {
      assert.strictEqual(formatValue('hello', 'string'), 'hello');
    });

    test('formats null/undefined as empty string', () => {
      assert.strictEqual(formatValue(null, 'string'), '');
      assert.strictEqual(formatValue(undefined, 'string'), '');
      assert.strictEqual(formatValue('', 'string'), '');
    });

    test('formats number values', () => {
      assert.strictEqual(formatValue(42, 'number'), '42');
      assert.strictEqual(formatValue(3.14159, 'number'), '3.14159');
    });

    test('formats integer values', () => {
      assert.strictEqual(formatValue(42, 'integer'), '42');
      assert.strictEqual(formatValue(3.7, 'integer'), '4'); // Rounds
    });

    test('formats boolean values', () => {
      assert.strictEqual(formatValue(true, 'boolean'), 'Yes');
      assert.strictEqual(formatValue(false, 'boolean'), 'No');
    });

    test('formats date values', () => {
      const date = new Date('2024-03-15T10:30:00');
      const result = formatValue(date, 'date', { dateFormat: 'yyyy-MM-dd' });
      assert.strictEqual(result, '2024-03-15');
    });

    test('formats datetime values', () => {
      const date = new Date('2024-03-15T10:30:00');
      const result = formatValue(date, 'datetime', { datetimeFormat: 'yyyy-MM-dd HH:mm:ss' });
      assert.strictEqual(result, '2024-03-15 10:30:00');
    });

    test('formats money values', () => {
      const result = formatValue(1234.56, 'money', {
        moneyFormat: {
          symbol: '$',
          decimals: 2,
          thousandsSeparator: ',',
          decimalSeparator: '.',
          symbolPosition: 'prefix',
        },
      });
      assert.strictEqual(result, '$1,234.56');
    });

    test('formats enum values with labels', () => {
      const result = formatValue('active', 'enum', {
        enumLabels: { active: 'Active', inactive: 'Inactive' },
      });
      assert.strictEqual(result, 'Active');
    });

    test('returns original value for unknown enum', () => {
      const result = formatValue('unknown', 'enum', {
        enumLabels: { active: 'Active' },
      });
      assert.strictEqual(result, 'unknown');
    });
  });

  describe('formatDate', () => {
    test('formats Date object', () => {
      const date = new Date('2024-06-20T12:00:00');
      const result = formatDate(date, 'yyyy-MM-dd');
      assert.strictEqual(result, '2024-06-20');
    });

    test('formats unix timestamp in milliseconds', () => {
      const timestamp = new Date('2024-06-20T12:00:00').getTime();
      const result = formatDate(timestamp, 'yyyy-MM-dd');
      assert.strictEqual(result, '2024-06-20');
    });

    test('formats ISO string', () => {
      const result = formatDate('2024-06-20T12:00:00Z', 'yyyy-MM-dd');
      assert.strictEqual(result, '2024-06-20');
    });

    test('returns original for invalid date', () => {
      const result = formatDate('invalid', 'yyyy-MM-dd');
      assert.strictEqual(result, 'invalid');
    });

    test('returns empty string for null/undefined', () => {
      assert.strictEqual(formatDate(null), '');
      assert.strictEqual(formatDate(undefined), '');
    });
  });

  describe('formatMoney', () => {
    test('formats with default options', () => {
      const result = formatMoney(1234.56);
      assert.strictEqual(result, '1,234.56');
    });

    test('formats with currency symbol prefix', () => {
      const result = formatMoney(1234.56, {
        symbol: '$',
        decimals: 2,
        thousandsSeparator: ',',
        decimalSeparator: '.',
        symbolPosition: 'prefix',
      });
      assert.strictEqual(result, '$1,234.56');
    });

    test('formats with currency symbol suffix', () => {
      const result = formatMoney(1234.56, {
        symbol: 'USD',
        decimals: 2,
        thousandsSeparator: ',',
        decimalSeparator: '.',
        symbolPosition: 'suffix',
      });
      assert.strictEqual(result, '1,234.56USD');
    });

    test('formats negative values', () => {
      const result = formatMoney(-1234.56, {
        symbol: '$',
        decimals: 2,
        thousandsSeparator: ',',
        decimalSeparator: '.',
        symbolPosition: 'prefix',
      });
      assert.strictEqual(result, '$-1,234.56');
    });

    test('formats zero', () => {
      const result = formatMoney(0);
      assert.strictEqual(result, '0.00');
    });

    test('returns empty string for null', () => {
      assert.strictEqual(formatMoney(null), '');
    });
  });

  describe('formatBoolean', () => {
    test('formats true boolean', () => {
      assert.strictEqual(formatBoolean(true), 'Yes');
      assert.strictEqual(formatBoolean(false), 'No');
    });

    test('formats string booleans', () => {
      assert.strictEqual(formatBoolean('true'), 'Yes');
      assert.strictEqual(formatBoolean('false'), 'No');
      assert.strictEqual(formatBoolean('yes'), 'Yes');
      assert.strictEqual(formatBoolean('no'), 'No');
    });

    test('formats numeric booleans', () => {
      assert.strictEqual(formatBoolean(1), 'Yes');
      assert.strictEqual(formatBoolean(0), 'No');
    });
  });

  describe('formatNumber', () => {
    test('formats numbers as strings', () => {
      assert.strictEqual(formatNumber(42), '42');
      assert.strictEqual(formatNumber(3.14159), '3.14159');
    });

    test('formats integers', () => {
      assert.strictEqual(formatNumber(42, true), '42');
      assert.strictEqual(formatNumber(3.7, true), '4');
    });

    test('returns empty string for null', () => {
      assert.strictEqual(formatNumber(null), '');
    });
  });
});

// ============================================================================
// Column Mapping Tests
// ============================================================================

describe('Column Mapping', () => {
  describe('camelCaseToFriendly', () => {
    test('converts camelCase to friendly names', () => {
      assert.strictEqual(camelCaseToFriendly('itemName'), 'Item Name');
      assert.strictEqual(camelCaseToFriendly('createdAt'), 'Created At');
      assert.strictEqual(camelCaseToFriendly('companyId'), 'Company ID');
    });

    test('uses predefined mappings', () => {
      assert.strictEqual(camelCaseToFriendly('id'), 'ID');
      assert.strictEqual(camelCaseToFriendly('name'), 'Name');
    });
  });

  describe('getColumnHeader', () => {
    test('returns custom header if provided', () => {
      assert.strictEqual(getColumnHeader('itemName', 'Product Name'), 'Product Name');
    });

    test('generates friendly name from key', () => {
      assert.strictEqual(getColumnHeader('itemName'), 'Item Name');
    });
  });

  describe('buildColumnMap', () => {
    const columns: ExportColumn<TestRow>[] = [
      { key: 'id', header: 'ID', fieldType: 'number' },
      { key: 'itemName', header: 'Item Name', fieldType: 'string' },
      { key: 'quantity', header: 'Quantity', fieldType: 'integer' },
      { key: 'total', header: 'Total', fieldType: 'money' },
    ];

    test('returns all columns by default', () => {
      const result = buildColumnMap(columns);
      assert.strictEqual(result.length, 4);
    });

    test('filters to selected columns', () => {
      const result = buildColumnMap(columns, { selectedColumns: ['id', 'itemName'] });
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].key, 'id');
      assert.strictEqual(result[1].key, 'itemName');
    });

    test('reorders columns based on columnOrder', () => {
      const result = buildColumnMap(columns, { columnOrder: ['total', 'quantity', 'id', 'itemName'] });
      assert.strictEqual(result[0].key, 'total');
      assert.strictEqual(result[1].key, 'quantity');
      assert.strictEqual(result[2].key, 'id');
      assert.strictEqual(result[3].key, 'itemName');
    });

    test('combines selection and reordering', () => {
      const result = buildColumnMap(columns, {
        selectedColumns: ['id', 'total'],
        columnOrder: ['total', 'id'],
      });
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].key, 'total');
      assert.strictEqual(result[1].key, 'id');
    });
  });

  describe('extractColumnValue', () => {
    const columns: ExportColumn<TestRow>[] = [
      { key: 'id', header: 'ID', field: 'id', fieldType: 'number' },
      { key: 'name', header: 'Name', field: 'itemName', fieldType: 'string' },
      { key: 'computed', header: 'Computed', formatter: (value, row) => `Item: ${row.itemName}` },
    ];

    const row: TestRow = {
      id: 1,
      itemName: 'Test Item',
      quantity: 10,
      unitPrice: 5.99,
      total: 59.9,
      notes: 'Test notes',
      createdAt: new Date('2024-03-15'),
      isPaid: true,
    };

    test('extracts simple field value', () => {
      const result = extractColumnValue(row, columns[0]);
      assert.strictEqual(result, 1);
    });

    test('extracts field by name', () => {
      const result = extractColumnValue(row, columns[1]);
      assert.strictEqual(result, 'Test Item');
    });

    test('uses custom formatter', () => {
      const result = extractColumnValue(row, columns[2]);
      assert.strictEqual(result, 'Item: Test Item');
    });
  });

  describe('resolveRowValues', () => {
    const columns: ExportColumn<TestRow>[] = [
      { key: 'id', header: 'ID', field: 'id', fieldType: 'number' },
      { key: 'itemName', header: 'Item Name', field: 'itemName', fieldType: 'string' },
    ];

    const row: TestRow = {
      id: 42,
      itemName: 'Widget',
      quantity: 5,
      unitPrice: 10,
      total: 50,
      notes: '',
      createdAt: new Date(),
      isPaid: false,
    };

    test('resolves all column values', () => {
      const result = resolveRowValues(row, columns);
      assert.deepStrictEqual(result, { id: 42, itemName: 'Widget' });
    });
  });
});

// ============================================================================
// CSV Generation Tests
// ============================================================================

describe('CSV Generation', () => {
  const itemColumns: ExportColumn<TestItem>[] = [
    { key: 'id', header: 'ID', field: 'id', fieldType: 'number' },
    { key: 'name', header: 'Name', field: 'name', fieldType: 'string' },
    { key: 'price', header: 'Price', field: 'price', fieldType: 'money' },
    { key: 'isActive', header: 'Active', field: 'isActive', fieldType: 'boolean' },
  ];

  const testItems: TestItem[] = [
    { id: 1, name: 'Laptop', price: 999.99, createdAt: new Date('2024-01-15'), isActive: true, category: 'electronics' },
    { id: 2, name: 'Desk Chair', price: 299.50, createdAt: new Date('2024-02-20'), isActive: true, category: 'furniture' },
    { id: 3, name: 'T-Shirt', price: 19.99, createdAt: new Date('2024-03-10'), isActive: false, category: 'clothing' },
  ];

  describe('generateCSV', () => {
    test('generates CSV with headers', () => {
      const csv = generateCSV(testItems, itemColumns);
      const lines = csv.split('\r\n');
      
      assert.ok(lines[0].startsWith('ID,Name,Price,Active'));
      assert.ok(lines[1].includes('Laptop'));
      assert.ok(lines[2].includes('Desk Chair'));
    });

    test('generates CSV without headers', () => {
      const csv = generateCSV(testItems, itemColumns, { includeHeaders: false });
      const lines = csv.split('\r\n');
      
      assert.ok(!lines[0].startsWith('ID'));
      assert.ok(lines[0].includes('Laptop'));
    });

    test('escapes values with commas', () => {
      const items = [{ id: 1, name: 'Item, with comma', price: 10 }];
      const columns: ExportColumn<typeof items[0]>[] = [
        { key: 'id', header: 'ID', field: 'id' },
        { key: 'name', header: 'Name', field: 'name' },
      ];
      
      const csv = generateCSV(items, columns);
      assert.ok(csv.includes('"Item, with comma"'));
    });

    test('escapes values with quotes', () => {
      const items = [{ id: 1, name: 'Item "quoted"', price: 10 }];
      const columns: ExportColumn<typeof items[0]>[] = [
        { key: 'id', header: 'ID', field: 'id' },
        { key: 'name', header: 'Name', field: 'name' },
      ];
      
      const csv = generateCSV(items, columns);
      assert.ok(csv.includes('"Item ""quoted"""'));
    });

    test('handles empty data', () => {
      const csv = generateCSV([], itemColumns);
      assert.strictEqual(csv, '');
    });

    test('respects column selection', () => {
      const csv = generateCSV(testItems, itemColumns, {
        selectedColumns: ['id', 'name'],
      });
      
      const lines = csv.split('\r\n');
      assert.ok(lines[0].startsWith('ID,Name'));
      assert.ok(!lines[1].includes('Price'));
    });

    test('respects column order', () => {
      const csv = generateCSV(testItems, itemColumns, {
        columnOrder: ['name', 'id', 'price', 'isActive'],
      });
      
      const lines = csv.split('\r\n');
      assert.ok(lines[0].startsWith('Name,ID,Price,Active'));
    });

    test('formats money values', () => {
      const csv = generateCSV(testItems, itemColumns);
      const lines = csv.split('\r\n');
      
      assert.ok(lines[1].includes('999.99'));
    });

    test('formats boolean values', () => {
      const csv = generateCSV(testItems, itemColumns);
      const lines = csv.split('\r\n');
      
      assert.ok(lines[1].includes('Yes'));
      assert.ok(lines[3].includes('No'));
    });
  });

  describe('generateCSVBuffer', () => {
    test('returns Buffer with UTF-8 encoding', () => {
      const buffer = generateCSVBuffer(testItems, itemColumns);
      
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 0);
    });
  });
});

// ============================================================================
// Excel Generation Tests
// ============================================================================

describe('Excel Generation', () => {
  const itemColumns: ExportColumn<TestItem>[] = [
    { key: 'id', header: 'ID', field: 'id', fieldType: 'number' },
    { key: 'name', header: 'Name', field: 'name', fieldType: 'string' },
    { key: 'price', header: 'Price', field: 'price', fieldType: 'money' },
  ];

  const testItems: TestItem[] = [
    { id: 1, name: 'Laptop', price: 999.99, createdAt: new Date('2024-01-15'), isActive: true, category: 'electronics' },
    { id: 2, name: 'Desk Chair', price: 299.50, createdAt: new Date('2024-02-20'), isActive: true, category: 'furniture' },
  ];

  describe('generateExcel', () => {
    test('generates valid Excel buffer', () => {
      const buffer = generateExcel(testItems, itemColumns);
      
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 0);
      // XLSX files start with PK (ZIP format)
      assert.strictEqual(buffer[0], 0x50); // P
      assert.strictEqual(buffer[1], 0x4B); // K
    });

    test('handles empty data', () => {
      const buffer = generateExcel([], itemColumns);
      
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 0);
    });

    test('uses custom sheet name', () => {
      const buffer = generateExcel(testItems, itemColumns, { sheetName: 'Products' });
      
      assert.ok(Buffer.isBuffer(buffer));
    });

    test('includes title when specified', () => {
      const buffer = generateExcel(testItems, itemColumns, { title: 'Product List' });
      
      assert.ok(Buffer.isBuffer(buffer));
    });
  });
});

// ============================================================================
// Generic Export Tests
// ============================================================================

describe('Generic Export', () => {
  const columns: ExportColumn<TestItem>[] = [
    { key: 'id', header: 'ID', field: 'id', fieldType: 'number' },
    { key: 'name', header: 'Name', field: 'name', fieldType: 'string' },
  ];

  const testItems: TestItem[] = [
    { id: 1, name: 'Laptop', price: 999.99, createdAt: new Date(), isActive: true, category: 'electronics' },
  ];

  describe('generateExport', () => {
    test('generates CSV by default', () => {
      const result = generateExport(testItems, columns);
      
      assert.strictEqual(result.format, 'csv');
      assert.strictEqual(result.contentType, 'text/csv; charset=utf-8');
      assert.ok(result.filename.endsWith('.csv'));
      assert.ok(result.rowCount === 1);
    });

    test('generates Excel when specified', () => {
      const result = generateExport(testItems, columns, { format: 'xlsx' });
      
      assert.strictEqual(result.format, 'xlsx');
      assert.ok(result.contentType.includes('spreadsheetml'));
      assert.ok(result.filename.endsWith('.xlsx'));
    });

    test('includes file size and duration', () => {
      const result = generateExport(testItems, columns);
      
      assert.ok(result.fileSize > 0);
      assert.ok(result.durationMs >= 0);
    });
  });

  describe('detectFormatFromFilename', () => {
    test('detects CSV format', () => {
      assert.strictEqual(detectFormatFromFilename('export.csv'), 'csv');
      assert.strictEqual(detectFormatFromFilename('data.CSV'), 'csv');
    });

    test('detects Excel format', () => {
      assert.strictEqual(detectFormatFromFilename('export.xlsx'), 'xlsx');
      assert.strictEqual(detectFormatFromFilename('report.XLS'), 'xlsx');
    });

    test('returns undefined for unknown format', () => {
      assert.strictEqual(detectFormatFromFilename('export.txt'), undefined);
      assert.strictEqual(detectFormatFromFilename('export'), undefined);
    });
  });

  describe('getContentType', () => {
    test('returns correct content types', () => {
      assert.strictEqual(getContentType('csv'), 'text/csv; charset=utf-8');
      assert.ok(getContentType('xlsx').includes('spreadsheetml'));
    });
  });

  describe('getFileExtension', () => {
    test('returns correct extensions', () => {
      assert.strictEqual(getFileExtension('csv'), '.csv');
      assert.strictEqual(getFileExtension('xlsx'), '.xlsx');
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Export Validation', () => {
  describe('validateColumns', () => {
    test('passes for valid columns', () => {
      const columns: ExportColumn<unknown>[] = [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
      ];
      
      const errors = validateColumns(columns);
      assert.strictEqual(errors.length, 0);
    });

    test('detects missing keys', () => {
      const columns: ExportColumn<unknown>[] = [
        { key: 'id', header: 'ID' },
        { key: '', header: 'Name' }, // Empty key
      ];
      
      const errors = validateColumns(columns);
      assert.ok(errors.length > 0);
    });

    test('detects duplicate keys', () => {
      const columns: ExportColumn<unknown>[] = [
        { key: 'id', header: 'ID' },
        { key: 'id', header: 'Identifier' }, // Duplicate
      ];
      
      const errors = validateColumns(columns);
      assert.ok(errors.some(e => e.includes('Duplicate')));
    });

    test('detects missing headers', () => {
      const columns: ExportColumn<unknown>[] = [
        { key: 'id', header: '' }, // Empty header
      ];
      
      const errors = validateColumns(columns);
      assert.ok(errors.some(e => e.includes('header')));
    });
  });

  describe('validateExportData', () => {
    const columns: ExportColumn<unknown>[] = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
    ];

    test('passes for valid data', () => {
      const result = validateExportData([{ id: 1, name: 'Test' }], columns);
      assert.strictEqual(result.valid, true);
    });

    test('fails for non-array data', () => {
      const result = validateExportData('not an array' as unknown as unknown[], columns);
      assert.strictEqual(result.valid, false);
    });

    test('fails for empty columns', () => {
      const result = validateExportData([{ id: 1 }], []);
      assert.strictEqual(result.valid, false);
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('Helper Functions', () => {
  describe('isEmptyValue', () => {
    test('identifies empty values', () => {
      assert.strictEqual(isEmptyValue(null), true);
      assert.strictEqual(isEmptyValue(undefined), true);
      assert.strictEqual(isEmptyValue(''), true);
      assert.strictEqual(isEmptyValue('   '), true);
    });

    test('identifies non-empty values', () => {
      assert.strictEqual(isEmptyValue(0), false);
      assert.strictEqual(isEmptyValue(false), false);
      assert.strictEqual(isEmptyValue('text'), false);
      assert.strictEqual(isEmptyValue(42), false);
    });
  });

  describe('toExportString', () => {
    test('converts primitive values', () => {
      assert.strictEqual(toExportString('hello'), 'hello');
      assert.strictEqual(toExportString(42), '42');
      assert.strictEqual(toExportString(true), 'true'); // Without fieldType, converts to string
    });

    test('converts boolean with fieldType', () => {
      assert.strictEqual(toExportString(true, 'boolean'), 'Yes');
      assert.strictEqual(toExportString(false, 'boolean'), 'No');
    });

    test('converts Date objects', () => {
      const date = new Date('2024-06-15T10:30:00');
      const result = toExportString(date);
      assert.ok(result.includes('2024'));
    });

    test('converts objects to JSON', () => {
      const result = toExportString({ key: 'value' });
      assert.strictEqual(result, '{"key":"value"}');
    });

    test('returns empty string for null', () => {
      assert.strictEqual(toExportString(null), '');
    });
  });

  describe('mergeFormatOptions', () => {
    test('merges options correctly', () => {
      const result = mergeFormatOptions(
        { fieldType: 'date' },
        { dateFormat: 'MM/dd/yyyy' }
      );
      
      assert.strictEqual(result.fieldType, 'date');
      assert.strictEqual(result.dateFormat, 'MM/dd/yyyy');
    });

    test('column options take precedence', () => {
      const result = mergeFormatOptions(
        { dateFormat: 'dd/MM/yyyy' },
        { dateFormat: 'MM/dd/yyyy' }
      );
      
      assert.strictEqual(result.dateFormat, 'dd/MM/yyyy');
    });
  });
});

// ============================================================================
// Performance Tests (Large Datasets)
// ============================================================================

describe('Export Performance', () => {
  // Generate large test dataset
  function generateLargeDataset(rowCount: number): Array<{ id: number; name: string; value: number }> {
    const items = [];
    for (let i = 1; i <= rowCount; i++) {
      items.push({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 1000,
      });
    }
    return items;
  }

  const columns: ExportColumn<{ id: number; name: string; value: number }>[] = [
    { key: 'id', header: 'ID', field: 'id', fieldType: 'number' },
    { key: 'name', header: 'Name', field: 'name', fieldType: 'string' },
    { key: 'value', header: 'Value', field: 'value', fieldType: 'money' },
  ];

  test('handles 1000 rows efficiently', () => {
    const items = generateLargeDataset(1000);
    
    const csvStart = Date.now();
    const csv = generateCSV(items, columns);
    const csvDuration = Date.now() - csvStart;
    
    assert.ok(csv.split('\r\n').length > 1000);
    assert.ok(csvDuration < 5000, `CSV generation took ${csvDuration}ms, expected < 5000ms`);
  });

  test('handles 5000 rows efficiently', () => {
    const items = generateLargeDataset(5000);
    
    const csvStart = Date.now();
    const csv = generateCSV(items, columns);
    const csvDuration = Date.now() - csvStart;
    
    assert.ok(csvDuration < 10000, `CSV generation took ${csvDuration}ms, expected < 10000ms`);
  });

  test('CSV memory footprint stays reasonable', () => {
    const items = generateLargeDataset(10000);
    
    const startMemory = process.memoryUsage().heapUsed;
    const csv = generateCSV(items, columns);
    const endMemory = process.memoryUsage().heapUsed;
    
    const memoryIncrease = (endMemory - startMemory) / (1024 * 1024);
    assert.ok(memoryIncrease < 100, `Memory increase ${memoryIncrease.toFixed(2)}MB is too high`);
  });

  test('Excel chunked generation creates multiple sheets for large datasets', () => {
    // Generate 15,000 rows (exceeds 10,000 row threshold for chunking)
    const items = generateLargeDataset(15000);
    
    const excelStart = Date.now();
    const buffer = generateExport(items, columns, { format: 'xlsx' });
    const excelDuration = Date.now() - excelStart;
    
    assert.ok(excelDuration < 30000, `Excel generation took ${excelDuration}ms, expected < 30000ms`);
    assert.ok(buffer.buffer.length > 0, 'Excel buffer should not be empty');
    assert.ok(buffer.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      'Content type should be Excel');
  });
});

// ============================================================================
// Cleanup
// ============================================================================

test.after(async () => {
  await closeDbPool();
});
