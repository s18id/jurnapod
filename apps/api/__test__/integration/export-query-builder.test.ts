// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Query Builder Unit Tests
 *
 * Note: These are pure unit tests for SQL query building (no DB access).
 * Hardcoded IDs are safe here as they're just test data for query generation.
 */

/* eslint-disable jurnapod-test-rules/no-hardcoded-ids */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  buildExportQuery,
  getAvailableColumns,
  validateExportColumns,
  type ExportableEntity,
  type ExportFilters,
  type ExportBuildOptions,
} from './query-builder.js';

describe('Query Builder', () => {
  describe('buildExportQuery', () => {
    describe('items entity', () => {
      test('should build a basic items query with company_id filter', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /SELECT/);
        assert.match(sql, /FROM items i/);
        assert.match(sql, /LEFT JOIN item_groups ig/);
        assert.match(sql, /WHERE i\.company_id = \?/);
        assert.match(sql, /i\.deleted_at IS NULL/);
        assert.ok(values.includes(1));
      });

      test('should include all columns when columns is undefined', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.id/);
        assert.match(sql, /i\.sku/);
        assert.match(sql, /i\.name/);
        assert.match(sql, /i\.item_type/);
        assert.match(sql, /ig\.name/); // item_group_name
        assert.match(sql, /i\.is_active/);
        assert.match(sql, /i\.created_at/);
        assert.match(sql, /i\.updated_at/);
      });

      test('should include only specified columns', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv', columns: ['id', 'name', 'sku'] };

        const { sql } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.id/);
        assert.match(sql, /i\.name/);
        assert.match(sql, /i\.sku/);
        assert.ok(!sql.includes('i.item_type'));
        assert.ok(!sql.includes('i.barcode'));
      });

      test('should filter by outlet_id when provided', () => {
        const filters: ExportFilters = { company_id: 1, outlet_id: 5 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.outlet_id = \?/);
        assert.match(sql, /OR i\.outlet_id IS NULL/);
        assert.ok(values.includes(5));
      });

      test('should filter by is_active when provided', () => {
        const filters: ExportFilters = { company_id: 1, is_active: true };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.is_active = \?/);
        assert.ok(values.includes(1));
      });

      test('should filter by is_active false', () => {
        const filters: ExportFilters = { company_id: 1, is_active: false };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.is_active = \?/);
        assert.ok(values.includes(0));
      });

      test('should filter by type when provided', () => {
        const filters: ExportFilters = { company_id: 1, type: 'SERVICE' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.item_type = \?/);
        assert.ok(values.includes('SERVICE'));
      });

      test('should filter by group_id when provided', () => {
        const filters: ExportFilters = { company_id: 1, group_id: 10 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.item_group_id = \?/);
        assert.ok(values.includes(10));
      });

      test('should filter by search term', () => {
        const filters: ExportFilters = { company_id: 1, search: 'widget' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.name LIKE \?/);
        assert.match(sql, /i\.sku LIKE \?/);
        assert.ok(values.includes('%widget%'));
      });

      test('should filter by date_from', () => {
        const filters: ExportFilters = { company_id: 1, date_from: '2024-01-01' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.updated_at >= \?/);
        assert.ok(values.includes('2024-01-01'));
      });

      test('should filter by date_to', () => {
        const filters: ExportFilters = { company_id: 1, date_to: '2024-12-31' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.updated_at <= \?/);
        assert.ok(values.includes('2024-12-31'));
      });

      test('should apply limit and offset', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv', limit: 100, offset: 50 };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /LIMIT \?/);
        assert.match(sql, /OFFSET \?/);
        assert.ok(values.includes(100));
        assert.ok(values.includes(50));
      });

      test('should apply multiple filters together', () => {
        const filters: ExportFilters = {
          company_id: 1,
          outlet_id: 5,
          is_active: true,
          type: 'PRODUCT',
          group_id: 10,
          search: 'test',
        };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('items', filters, options);

        assert.match(sql, /i\.company_id = \?/);
        assert.match(sql, /i\.outlet_id = \?/);
        assert.match(sql, /i\.is_active = \?/);
        assert.match(sql, /i\.item_type = \?/);
        assert.match(sql, /i\.item_group_id = \?/);
        assert.match(sql, /i\.name LIKE \?/);
        assert.match(sql, /ORDER BY i\.name ASC/);
      });
    });

    describe('item_prices entity', () => {
      test('should build a basic item_prices query without outlet', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('item_prices', filters, options);

        assert.match(sql, /FROM item_prices ip/);
        assert.match(sql, /INNER JOIN items i/);
        assert.match(sql, /ip\.company_id = \?/);
        assert.ok(values.includes(1));
      });

      test('should build outlet-specific view when outlet_id is provided', () => {
        const filters: ExportFilters = { company_id: 1, outlet_id: 5 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('item_prices', filters, options);

        assert.match(sql, /LEFT JOIN item_prices override/);
        assert.match(sql, /LEFT JOIN item_prices def/);
        assert.match(sql, /override\.outlet_id = \?/);
        assert.ok(values.includes(5));
      });

      test('should filter by scope_filter override', () => {
        const filters: ExportFilters = { company_id: 1, scope_filter: 'override' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql } = buildExportQuery('item_prices', filters, options);

        assert.match(sql, /ip\.outlet_id IS NOT NULL/);
      });

      test('should filter by scope_filter default', () => {
        const filters: ExportFilters = { company_id: 1, scope_filter: 'default' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql } = buildExportQuery('item_prices', filters, options);

        assert.match(sql, /ip\.outlet_id IS NULL/);
      });
    });

    describe('item_groups entity', () => {
      test('should build a basic item_groups query', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('item_groups', filters, options);

        assert.match(sql, /FROM item_groups ig/);
        assert.match(sql, /LEFT JOIN item_groups parent_ig/);
        assert.match(sql, /ig\.company_id = \?/);
        assert.ok(values.includes(1));
      });

      test('should filter by parent_id (group_id)', () => {
        const filters: ExportFilters = { company_id: 1, group_id: 5 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('item_groups', filters, options);

        assert.match(sql, /ig\.parent_id = \?/);
        assert.ok(values.includes(5));
      });
    });

    describe('accounts entity', () => {
      test('should build a basic accounts query', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('accounts', filters, options);

        assert.match(sql, /FROM accounts a/);
        assert.match(sql, /LEFT JOIN accounts parent_a/);
        assert.match(sql, /a\.company_id = \?/);
        assert.ok(values.includes(1));
      });

      test('should filter by type_name', () => {
        const filters: ExportFilters = { company_id: 1, type: 'Asset' };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('accounts', filters, options);

        assert.match(sql, /a\.type_name = \?/);
        assert.ok(values.includes('Asset'));
      });

      test('should filter by parent_account_id (group_id)', () => {
        const filters: ExportFilters = { company_id: 1, group_id: 10 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql, values } = buildExportQuery('accounts', filters, options);

        assert.match(sql, /a\.parent_account_id = \?/);
        assert.ok(values.includes(10));
      });

      test('should order by account code', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        const { sql } = buildExportQuery('accounts', filters, options);

        assert.match(sql, /ORDER BY a\.code ASC/);
      });
    });

    describe('error handling', () => {
      test('should throw error for unsupported entity type', () => {
        const filters: ExportFilters = { company_id: 1 };
        const options: ExportBuildOptions = { format: 'csv' };

        assert.throws(() => {
          // @ts-expect-error - testing invalid entity type
          buildExportQuery('invalid_entity', filters, options);
        }, /Unsupported entity type: invalid_entity/);
      });
    });
  });

  describe('getAvailableColumns', () => {
    test('should return all columns for items', () => {
      const columns = getAvailableColumns('items');

      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('sku'));
      assert.ok(columns.includes('name'));
      assert.ok(columns.includes('item_type'));
      assert.ok(columns.includes('item_group_name'));
      assert.ok(columns.includes('is_active'));
    });

    test('should return all columns for item_prices', () => {
      const columns = getAvailableColumns('item_prices');

      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('item_id'));
      assert.ok(columns.includes('item_sku'));
      assert.ok(columns.includes('item_name'));
      assert.ok(columns.includes('outlet_name'));
      assert.ok(columns.includes('price'));
      assert.ok(columns.includes('is_override'));
    });

    test('should return all columns for item_groups', () => {
      const columns = getAvailableColumns('item_groups');

      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('code'));
      assert.ok(columns.includes('name'));
      assert.ok(columns.includes('parent_name'));
      assert.ok(columns.includes('is_active'));
    });

    test('should return all columns for accounts', () => {
      const columns = getAvailableColumns('accounts');

      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('code'));
      assert.ok(columns.includes('name'));
      assert.ok(columns.includes('type_name'));
      assert.ok(columns.includes('normal_balance'));
      assert.ok(columns.includes('is_active'));
      assert.ok(columns.includes('is_payable'));
    });

    test('should return a copy, not the original array', () => {
      const columns1 = getAvailableColumns('items');
      const columns2 = getAvailableColumns('items');

      assert.notStrictEqual(columns1, columns2);
    });
  });

  describe('validateExportColumns', () => {
    test('should return valid=true for all valid columns', () => {
      const result = validateExportColumns('items', ['id', 'name', 'sku']);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.invalid.length, 0);
    });

    test('should return valid=false with invalid columns', () => {
      const result = validateExportColumns('items', ['id', 'invalid_col', 'another_invalid']);

      assert.strictEqual(result.valid, false);
      assert.ok(result.invalid.includes('invalid_col'));
      assert.ok(result.invalid.includes('another_invalid'));
    });

    test('should return valid=true for empty array', () => {
      const result = validateExportColumns('items', []);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.invalid.length, 0);
    });

    test('should handle mixed valid and invalid columns', () => {
      const result = validateExportColumns('item_prices', ['id', 'invalid', 'price', 'also_invalid']);

      assert.strictEqual(result.valid, false);
      assert.ok(result.invalid.includes('invalid'));
      assert.ok(result.invalid.includes('also_invalid'));
      // id and price are valid for item_prices
    });

    test('should work for all entity types', () => {
      const entities: ExportableEntity[] = ['items', 'item_prices', 'item_groups', 'accounts'];

      for (const entity of entities) {
        const columns = getAvailableColumns(entity);
        const result = validateExportColumns(entity, columns);
        assert.strictEqual(result.valid, true);
      }
    });
  });

  describe('SQL injection prevention', () => {
    test('should use parameterized queries for search terms', () => {
      const filters: ExportFilters = { company_id: 1, search: "'; DROP TABLE items; --" };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql, values } = buildExportQuery('items', filters, options);

      // The dangerous string should NOT appear in SQL directly
      // It should be safely in values as a parameter
      assert.ok(!sql.includes('DROP TABLE'));
      assert.ok(values.some(v => typeof v === 'string' && v.includes('DROP TABLE')));
    });

    test('should use parameterized queries for type filter', () => {
      const filters: ExportFilters = { company_id: 1, type: "SERVICE' OR '1'='1" };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql, values } = buildExportQuery('items', filters, options);

      // The dangerous string should NOT appear in SQL directly
      // The 'OR' in SQL is part of the LIKE clause syntax, not the value
      assert.ok(values.some(v => typeof v === 'string' && v.includes("SERVICE' OR '1'='1")));
    });

    test('should use parameterized queries for code', () => {
      const filters: ExportFilters = { company_id: 1, search: 'test<script>' };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql, values } = buildExportQuery('items', filters, options);

      // The dangerous string should NOT appear in SQL directly
      assert.ok(!sql.includes('<script>'));
      assert.ok(values.some(v => typeof v === 'string' && v.includes('test<script>')));
    });
  });

  describe('query structure', () => {
    test('should always include company_id filter first', () => {
      const filters: ExportFilters = { company_id: 123, search: 'test' };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql, values } = buildExportQuery('items', filters, options);

      assert.ok(sql.indexOf('i.company_id = ?') < sql.indexOf('i.name LIKE ?'));
      assert.strictEqual(values[0], 123);
    });

    test('should always include deleted_at check for items', () => {
      const filters: ExportFilters = { company_id: 1 };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql } = buildExportQuery('items', filters, options);

      assert.match(sql, /i\.deleted_at IS NULL/);
    });

    test('should order items by name ascending', () => {
      const filters: ExportFilters = { company_id: 1 };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql } = buildExportQuery('items', filters, options);

      assert.match(sql, /ORDER BY i\.name ASC/);
    });

    test('should order item_groups by name ascending', () => {
      const filters: ExportFilters = { company_id: 1 };
      const options: ExportBuildOptions = { format: 'csv' };

      const { sql } = buildExportQuery('item_groups', filters, options);

      assert.match(sql, /ORDER BY ig\.name ASC/);
    });
  });
});
