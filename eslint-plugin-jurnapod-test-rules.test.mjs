// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for eslint-plugin-jurnapod-test-rules
 *
 * Tests all 3 rules:
 *  1. no-hardcoded-ids     — flags company_id: 1, userId: 0, etc.
 *  2. no-raw-sql-insert-items — flags raw INSERT INTO items
 *  3. no-route-business-logic — flags business logic in routes
 */

import { describe, it, expect } from 'vitest';
import {
  noHardcodedIdsRule,
  noRawSqlInsertItemsRule,
  noRouteBusinessLogicRule,
} from './eslint-plugin-jurnapod-test-rules.mjs';
import { parse } from 'espree';

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
          // Reconstruct from tag + quasi
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
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('flags companyId: 1 in object property', () => {
      const code = 'const x = { companyId: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('flags company_id = 1 in assignment', () => {
      const code = 'function create() { const company_id = 1; }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('flags companyId = 1 in assignment', () => {
      const code = 'function create() { companyId = 1; }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('flags companyId: BigInt(1)', () => {
      const code = 'const x = { companyId: BigInt(1) }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('flags company_id: 1, in object with comma', () => {
      const code = 'const x = { company_id: 1, name: "test" }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('flags hardcoded id in string literal', () => {
      const code = 'const sql = `company_id = 1`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag company_id from variable', () => {
      const code = 'const x = { company_id: company.id }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(false);
    });

    it('does NOT flag companyId from variable', () => {
      const code = 'const x = { companyId: ctx.companyId }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(false);
    });

    it('does NOT flag company_id from fixture', () => {
      const code = 'const x = { company_id: company.id }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(false);
    });

    it('does NOT flag dynamic id generation', () => {
      const code = 'const x = { companyId: generatedId() }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(false);
    });

    it('does NOT flag other numeric values', () => {
      const code = 'const x = { count: 42, limit: 100 }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(false);
    });

    it('does NOT flag id: 1 in non-company contexts', () => {
      const code = 'const x = { priority: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(false);
    });
  });

  describe('File type filter', () => {
    it('does NOT apply to non-test files', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(
        RULE,
        code,
        '/home/jurnapod/apps/api/src/routes/items.ts'
      );
      expect(errors.length).toBe(0);
    });

    it('applies to .test.ts files', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
    });

    it('applies to .spec.ts files', () => {
      const code = 'const x = { company_id: 1 }';
      const errors = runRule(
        RULE,
        code,
        '/home/jurnapod/__test__/unit/example.spec.ts'
      );
      expect(errors.some((e) => e.messageId === 'noHardcodedIds')).toBe(true);
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
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(true);
    });

    it('flags INSERT INTO items in string literal', () => {
      const code = 'const q = "INSERT INTO items (name) VALUES (\'test\')"';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(true);
    });

    it('flags INSERT INTO items with backticks', () => {
      const code = 'const q = `INSERT INTO `items` (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(true);
    });

    it('flags tagged template sql`INSERT INTO items`', () => {
      const code = 'const q = sql`INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(true);
    });

    it('flags lowercase insert into items', () => {
      const code = 'const q = `insert into items (name) values ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(true);
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag SELECT FROM items', () => {
      const code = 'const q = `SELECT * FROM items`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(false);
    });

    it('does NOT flag UPDATE items', () => {
      const code = 'const q = `UPDATE items SET name = "x" WHERE id = 1`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(false);
    });

    it('does NOT flag DELETE FROM items', () => {
      const code = 'const q = `DELETE FROM items WHERE id = 1`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(false);
    });

    it('does NOT flag INSERT INTO other tables', () => {
      const code = 'const q = `INSERT INTO orders (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(false);
    });

    it('does NOT flag "Please insert a valid item" message', () => {
      const code = 'return errorResponse("BAD_REQUEST", "Please insert a valid item")';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(false);
    });

    it('does NOT flag INSERT INTO orders (not items)', () => {
      const code = 'const q = `INSERT INTO orders (id) VALUES (1)`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(false);
    });
  });

  describe('File type filter', () => {
    it('does NOT apply to non-test files', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(
        RULE,
        code,
        '/home/jurnapod/apps/api/src/routes/items.ts'
      );
      expect(errors.length).toBe(0);
    });

    it('applies to .test.ts files', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(RULE, code, TEST_FILE);
      expect(errors.some((e) => e.messageId === 'noRawSqlInsert')).toBe(true);
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
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags SELECT with WHERE clause', () => {
      const code = 'const q = `SELECT id FROM items WHERE company_id = 1`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags INSERT INTO', () => {
      const code = 'const q = `INSERT INTO items (name) VALUES ("test")`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags UPDATE ... SET', () => {
      const code = 'const q = `UPDATE items SET name = "new" WHERE id = 1`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags DELETE FROM', () => {
      const code = 'const q = `DELETE FROM items WHERE id = 1`';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags SELECT with backtick-quoted table', () => {
      const code = 'const q = "SELECT * FROM `items`"';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(true);
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag "Item update failed" error message', () => {
      const code = 'return errorResponse("INTERNAL_ERROR", "Item update failed", 500)';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "Delete item" error message', () => {
      const code = 'return errorResponse("INTERNAL_ERROR", "Item deletion failed", 500)';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "Resuming from batch" console message', () => {
      const code = 'console.info(`Resuming session ${id} from batch ${n}`)';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "Select from options" plain English', () => {
      const code = 'return successResponse({ message: "Select from options below" })';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "WHERE clause missing" error text', () => {
      const code = 'return errorResponse("VALIDATION", "WHERE clause is required")';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag normal log messages with SQL-like words', () => {
      const code = 'console.log("Update: item was updated from pending to active")';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag INSERT metaphor in non-SQL context', () => {
      const code = 'return successResponse({ message: "Please insert a valid item" })';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag DELETE in non-SQL context', () => {
      const code = 'return errorResponse("FORBIDDEN", "Cannot delete without permission")';
      const errors = runRule(noRouteBusinessLogicRule, code);
      expect(errors.some((e) => e.messageId === 'noRawSql')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Template for adding new rules
// ---------------------------------------------------------------------------

/**
 * Template for adding tests for new ESLint rules:
 *
 * describe('rule-name', () => {
 *   const RULE = ruleModule;
 *   const TEST_FILE = '/home/jurnapod/__test__/unit/example.test.ts';
 *
 *   describe('TRUE POSITIVES — should be flagged', () => {
 *     it('flags pattern X', () => {
 *       const errors = runRule(RULE, 'code with violation');
 *       expect(errors.some(e => e.messageId === 'expectedMessageId')).toBe(true);
 *     });
 *   });
 *
 *   describe('TRUE NEGATIVES — should NOT be flagged', () => {
 *     it('does NOT flag valid pattern Y', () => {
 *       const errors = runRule(RULE, 'valid code');
 *       expect(errors.some(e => e.messageId === 'expectedMessageId')).toBe(false);
 *     });
 *   });
 *
 *   describe('File type filter (if applicable)', () => {
 *     it('does NOT apply to non-test files', () => {
 *       const errors = runRule(RULE, 'code', '/path/to/non-test.ts');
 *       expect(errors.length).toBe(0);
 *     });
 *   });
 * });
 */
