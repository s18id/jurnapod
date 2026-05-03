// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for eslint-plugin-jurnapod-test-rules
 *
 * Tests all 4 rules:
 *  1. no-hardcoded-ids          — flags company_id: 1, userId: 0, etc.
 *  2. no-raw-sql-insert-items   — flags raw INSERT INTO items
 *  3. no-route-business-logic  — flags business logic in routes
 *  4. no-datetime-reimplementation — flags deprecated datetime functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'espree';
import {
  noHardcodedIdsRule,
  noRawSqlInsertItemsRule,
  noRouteBusinessLogicRule,
  noDatetimeReimplementationRule,
} from './eslint-plugin-jurnapod-test-rules.mjs';

// ---------------------------------------------------------------------------
// Helper: runRule
// ---------------------------------------------------------------------------

function runRule(rule, code, filename = '/home/jurnapod/apps/api/src/routes/test.ts') {
  const errors = [];
  const context = {
    report: (opts) => errors.push(opts),
    getFilename: () => filename,
    getSourceCode: () => ({
      getText: (node) => {
        if (!node) return undefined;
        if (node.type === 'TemplateLiteral') {
          if (node.quasis && node.quasis.length > 0) {
            return node.quasis.map((q) => q.value.raw).join('');
          }
          return undefined;
        }
        if (node.type === 'TaggedTemplateExpression') {
          const tagText =
            node.tag.type === 'Identifier' ? node.tag.name : '(tag)';
          const quasiText =
            node.quasi?.quasis?.map((q) => q.value.raw).join('') || '';
          return `${tagText}\`${quasiText}\``;
        }
        return node.raw ?? (node.value ?? undefined);
      },
    }),
  };

  let ast;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    return errors;
  }

  const handlers = rule.create(context);
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    for (const [type, handler] of Object.entries(handlers)) {
      if (node.type === type) {
        handler(node);
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((c) => walk(c));
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }
  walk(ast);

  return errors;
}

// ---------------------------------------------------------------------------
// no-hardcoded-ids tests
// ---------------------------------------------------------------------------

describe('no-hardcoded-ids', () => {
  const RULE = noHardcodedIdsRule;
  const TEST_FILE = '/home/jurnapod/__test__/unit/example.test.ts';

  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags company_id: 1 in object property', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag company_id: 1');
    });

    it('flags companyId: 1 in object property', () => {
      const code = 'const x = { companyId: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag companyId: 1');
    });

    it('flags company_id = 1 in assignment', () => {
      const code = 'function create() { const company_id = 1; }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag company_id = 1');
    });

    it('flags companyId = 1 in assignment', () => {
      const code = 'function create() { companyId = 1; }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag companyId = 1');
    });

    it('flags companyId: BigInt(1)', () => {
      const code = 'const x = { companyId: BigInt(1) }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag BigInt(1)');
    });

    it('flags company_id: 1, in object with comma', () => {
      const code = 'const x = { company_id: 1, name: "test" }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag with comma');
    });

    it('flags hardcoded id in string literal', () => {
      const code = 'const sql = `company_id = 1`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should flag in template literal');
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag company_id from variable', () => {
      const code = 'const x = { company_id: company.id }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should not flag variable');
    });

    it('does NOT flag companyId from variable', () => {
      const code = 'const x = { companyId: ctx.companyId }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should not flag ctx.companyId');
    });

    it('does NOT flag dynamic id generation', () => {
      const code = 'const x = { companyId: generatedId() }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should not flag generatedId()');
    });

    it('does NOT flag other numeric values', () => {
      const code = 'const x = { count: 42, limit: 100 }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should not flag count: 42');
    });

    it('does NOT flag id: 1 in non-company contexts', () => {
      const code = 'const x = { priority: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should not flag priority: 1');
    });
  });

  describe('File type filter', () => {
    it('does NOT apply to non-test files', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(RULE, code, '/home/jurnapod/apps/api/src/routes/items.ts');
      assert.strictEqual(errors.length, 0, 'Should not flag in non-test file');
    });

    it('applies to .test.ts files', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should apply to .test.ts');
    });

    it('applies to .spec.ts files', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(RULE, code, '/home/jurnapod/__test__/unit/example.spec.ts');
      assert.ok(errors.some((e) => e.messageId === 'noHardcodedIds'), 'Should apply to .spec.ts');
    });
  });
});

// ---------------------------------------------------------------------------
// no-raw-sql-insert-items tests
// ---------------------------------------------------------------------------

describe('no-raw-sql-insert-items', () => {
  const RULE = noRawSqlInsertItemsRule;
  const TEST_FILE = '/home/jurnapod/__test__/integration/example.test.ts';

  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags INSERT INTO items in template literal', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should flag INSERT INTO items');
    });

    it('flags INSERT INTO items in string literal', () => {
      const code = 'const q = "INSERT INTO items (name) VALUES (\'test\')"';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should flag in string literal');
    });

    it('flags INSERT INTO items with backticks', () => {
      const code = 'const q = `INSERT INTO `items` (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should flag backtick table name');
    });

    it('flags tagged template sql`INSERT INTO items`', () => {
      const code = 'const q = sql`INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should flag tagged template');
    });

    it('flags lowercase insert into items', () => {
      const code = 'const q = `insert into items (name) values ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should flag lowercase');
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag SELECT FROM items', () => {
      const code = 'const q = `SELECT * FROM items`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should not flag SELECT');
    });

    it('does NOT flag UPDATE items', () => {
      const code = 'const q = `UPDATE items SET name = "x" WHERE id = 1`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should not flag UPDATE');
    });

    it('does NOT flag DELETE FROM items', () => {
      const code = 'const q = `DELETE FROM items WHERE id = 1`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should not flag DELETE');
    });

    it('does NOT flag INSERT INTO other tables', () => {
      const code = 'const q = `INSERT INTO orders (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should not flag orders table');
    });

    it('does NOT flag "Please insert a valid item" message', () => {
      const code = 'return errorResponse("BAD_REQUEST", "Please insert a valid item")';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should not flag plain English');
    });

    it('does NOT flag INSERT INTO orders (not items)', () => {
      const code = 'const q = `INSERT INTO orders (id) VALUES (1)`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should not flag orders');
    });
  });

  describe('File type filter', () => {
    it('does NOT apply to non-test files', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(RULE, code, '/home/jurnapod/apps/api/src/routes/items.ts');
      assert.strictEqual(errors.length, 0, 'Should not apply to routes');
    });

    it('applies to .test.ts files', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      assert.ok(errors.some((e) => e.messageId === 'noRawSqlInsert'), 'Should apply to .test.ts');
    });
  });
});

// ---------------------------------------------------------------------------
// no-route-business-logic tests
// ---------------------------------------------------------------------------

describe('no-route-business-logic: SQL detection', () => {
  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags SELECT ... FROM', () => {
      const code = 'const q = `SELECT * FROM items`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(errors.some((e) => e.messageId === 'noRawSql'), 'Should flag SELECT');
    });

    it('flags SELECT with WHERE clause', () => {
      const code = 'const q = `SELECT id FROM items WHERE company_id = 1`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(errors.some((e) => e.messageId === 'noRawSql'), 'Should flag WHERE');
    });

    it('flags INSERT INTO', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(errors.some((e) => e.messageId === 'noRawSql'), 'Should flag INSERT');
    });

    it('flags UPDATE ... SET', () => {
      const code = 'const q = `UPDATE items SET name = "new" WHERE id = 1`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(errors.some((e) => e.messageId === 'noRawSql'), 'Should flag UPDATE');
    });

    it('flags DELETE FROM', () => {
      const code = 'const q = `DELETE FROM items WHERE id = 1`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(errors.some((e) => e.messageId === 'noRawSql'), 'Should flag DELETE');
    });

    it('flags SELECT with backtick-quoted table', () => {
      const code = 'const q = "SELECT * FROM `items`"';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(errors.some((e) => e.messageId === 'noRawSql'), 'Should flag backtick quote');
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag "Item update failed" error message', () => {
      const code = 'return errorResponse("INTERNAL_ERROR", "Item update failed", 500)';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSql'), 'Should not flag plain English');
    });

    it('does NOT flag "Delete item" error message', () => {
      const code = 'return errorResponse("INTERNAL_ERROR", "Item deletion failed", 500)';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSql'), 'Should not flag deletion message');
    });

    it('does NOT flag "WHERE clause missing" error text', () => {
      const code = 'return errorResponse("VALIDATION", "WHERE clause is required")';
      const errors = runRule(noRouteBusinessLogicRule, code);
      assert.ok(!errors.some((e) => e.messageId === 'noRawSql'), 'Should not flag WHERE in error');
    });
  });
});

// ---------------------------------------------------------------------------
// no-datetime-reimplementation tests
// ---------------------------------------------------------------------------

describe('no-datetime-reimplementation', () => {
  const RULE = noDatetimeReimplementationRule;
  const ROUTE_FILE = '/home/jurnapod/apps/api/src/routes/test.ts';
  const CANONICAL_FILE = '/home/jurnapod/packages/shared/src/schemas/datetime.ts';

  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags toEpochMs() call', () => {
      const code = 'const ts = toEpochMs(isoString)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should flag toEpochMs');
    });

    it('flags fromEpochMs() call', () => {
      const code = 'const iso = fromEpochMs(1234567890)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should flag fromEpochMs');
    });

    it('flags toUtcInstant() call', () => {
      const code = 'const instant = toUtcInstant(date)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should flag toUtcInstant');
    });

    it('flags fromUtcInstant() call', () => {
      const code = 'const date = fromUtcInstant(instant)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should flag fromUtcInstant');
    });

    it('flags resolveEventTime() call', () => {
      const code = 'const time = resolveEventTime(event)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should flag resolveEventTime');
    });

    it('flags member expression call datetime.toEpochMs()', () => {
      const code = 'const ts = datetime.toEpochMs(isoString)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should flag datetime.toEpochMs');
    });

    it('flags multiple deprecated calls in same file', () => {
      const code = 'const a = toEpochMs(x); const b = fromEpochMs(y)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.strictEqual(errors.filter((e) => e.messageId === 'datetimeReimplementation').length, 2, 'Should find 2 errors');
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag toEpochMs in canonical datetime.ts file', () => {
      const code = 'const ts = toEpochMs(isoString)';
      const errors = runRule(RULE, code, CANONICAL_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag in canonical');
    });

    it('does NOT flag fromEpochMs in canonical datetime.ts file', () => {
      const code = 'const iso = fromEpochMs(1234567890)';
      const errors = runRule(RULE, code, CANONICAL_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag in canonical');
    });

    it('does NOT flag other datetime functions like toUtcIso.dateLike', () => {
      const code = 'const result = toUtcIso.dateLike(value)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag toUtcIso');
    });

    it('does NOT flag fromUtcIso.epochMs', () => {
      const code = 'const ms = fromUtcIso.epochMs(iso)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag fromUtcIso.epochMs');
    });

    it('does NOT flag unrelated function calls', () => {
      const code = 'const x = getCurrentTime(); const y = formatDate(d)';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag unrelated');
    });

    it('does NOT flag nowUTC', () => {
      const code = 'const now = nowUTC()';
      const errors = runRule(RULE, code, ROUTE_FILE);
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag nowUTC');
    });
  });

  describe('File path edge cases', () => {
    it('does NOT flag files outside the project', () => {
      const code = 'const ts = toEpochMs(x)';
      const errors = runRule(RULE, code, '/other/project/src/datetime.ts');
      assert.ok(!errors.some((e) => e.messageId === 'datetimeReimplementation'), 'Should not flag external files');
    });
  });
});