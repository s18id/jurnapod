// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for eslint-plugin-jurnapod-test-rules
 * Tests the no-route-business-logic rule's SQL detection logic.
 */

import { describe, it, expect } from 'vitest';
import { noRouteBusinessLogicRule } from './eslint-plugin-jurnapod-test-rules.mjs';
import { parse } from 'espree';

function runRule(code) {
  const errors = [];
  const context = {
    report: (opts) => errors.push(opts),
    getFilename: () => '/home/jurnapod/apps/api/src/routes/test.ts',
    getSourceCode: () => ({
      getText: (node) => {
        if (node.type === 'TemplateLiteral') {
          // TemplateLiteral: reconstruct from quasis
          if (node.quasis && node.quasis.length > 0) {
            return node.quasis.map(q => q.value.raw).join('');
          }
          return undefined;
        }
        return node.raw ?? node.value;
      },
    }),
  };

  let ast;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    return errors;
  }

  const handlers = noRouteBusinessLogicRule.create(context);
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
        child.forEach(c => walk(c));
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }
  walk(ast);

  return errors;
}

describe('no-route-business-logic: SQL detection', () => {
  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags SELECT ... FROM', async () => {
      const errors = runRule('const q = `SELECT * FROM items`');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags SELECT with WHERE clause', async () => {
      const errors = runRule('const q = `SELECT id FROM items WHERE company_id = 1`');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags INSERT INTO', async () => {
      const errors = runRule('const q = `INSERT INTO items (name) VALUES ("test")`');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags UPDATE ... SET', async () => {
      const errors = runRule('const q = `UPDATE items SET name = "new" WHERE id = 1`');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags DELETE FROM', async () => {
      const errors = runRule('const q = `DELETE FROM items WHERE id = 1`');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(true);
    });

    it('flags SELECT with backtick-quoted table', async () => {
      const errors = runRule('const q = "SELECT * FROM `items`"');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(true);
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag "Item update failed" error message', async () => {
      const errors = runRule('return errorResponse("INTERNAL_ERROR", "Item update failed", 500)');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "Delete item" error message', async () => {
      const errors = runRule('return errorResponse("INTERNAL_ERROR", "Item deletion failed", 500)');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "Resuming from batch" console message', async () => {
      const errors = runRule('console.info(`Resuming session ${id} from batch ${n}`)');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "Select from options" plain English', async () => {
      const errors = runRule('return successResponse({ message: "Select from options below" })');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag "WHERE clause missing" error text', async () => {
      const errors = runRule('return errorResponse("VALIDATION", "WHERE clause is required")');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag normal log messages with SQL-like words', async () => {
      const errors = runRule('console.log("Update: item was updated from pending to active")');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag INSERT metaphor in non-SQL context', async () => {
      const errors = runRule('return successResponse({ message: "Please insert a valid item" })');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });

    it('does NOT flag DELETE in non-SQL context', async () => {
      const errors = runRule('return errorResponse("FORBIDDEN", "Cannot delete without permission")');
      expect(errors.some(e => e.messageId === 'noRawSql')).toBe(false);
    });
  });
});
