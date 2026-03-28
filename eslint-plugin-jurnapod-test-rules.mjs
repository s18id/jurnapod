// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * ESLint Plugin: Jurnapod Test Rules
 * 
 * Custom ESLint rules for maintaining test code quality.
 */

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedIdsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hardcoded IDs (like company_id=1) in test files",
      category: "Test Quality",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noHardcodedIds: "Hardcoded ID '{{ value }}' detected. Use dynamic fixture creation with library functions like createCompanyBasic() instead.",
    },
  },
  create(context) {
    // Only apply to test files
    const filename = context.getFilename();
    if (!filename.includes('.test.') && !filename.includes('.spec.')) {
      return {};
    }

    const checkHardcodedId = (value, node) => {
      // Check for common hardcoded ID patterns
      const hardcodedPatterns = [
        { pattern: /^company_id\s*=\s*1$/, message: "company_id = 1" },
        { pattern: /^company_id:\s*1$/, message: "company_id: 1" },
        { pattern: /companyId:\s*BigInt\(1\)/, message: "companyId: BigInt(1)" },
        { pattern: /companyId:\s*1[^0-9]/, message: "companyId: 1" },
        { pattern: /company_id:\s*1[^0-9]/, message: "company_id: 1" },
        { pattern: /company_id\s*:\s*1\s*,/, message: "company_id: 1" },
        { pattern: /companyId\s*=\s*1[^0-9]/, message: "companyId = 1" },
      ];

      for (const { pattern, message } of hardcodedPatterns) {
        if (pattern.test(value)) {
          context.report({
            node,
            messageId: "noHardcodedIds",
            data: { value: message },
          });
          return;
        }
      }
    };

    return {
      // Check string literals in SQL queries
      Literal(node) {
        if (typeof node.value === 'string') {
          checkHardcodedId(node.value, node);
        }
      },
      // Check template literals
      TemplateLiteral(node) {
        const sourceCode = context.getSourceCode();
        const text = sourceCode.getText(node);
        checkHardcodedId(text, node);
      },
      // Check object properties
      Property(node) {
        if (node.key.name === 'company_id' || node.key.name === 'companyId') {
          const value = node.value;
          if (value.type === 'Literal' && (value.value === 1 || value.value === '1' || value.value === BigInt(1))) {
            context.report({
              node,
              messageId: "noHardcodedIds",
              data: { value: `${node.key.name}: ${value.value}` },
            });
          }
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noRawSqlInsertItemsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw INSERT INTO items statements in test files - use createItem() instead",
      category: "Test Quality",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noRawSqlInsert: "Raw INSERT INTO items detected. Use createItem() library function instead for consistent test data creation.",
    },
  },
  create(context) {
    // Only apply to test files
    const filename = context.getFilename();
    if (!filename.includes('.test.') && !filename.includes('.spec.')) {
      return {};
    }

    return {
      // Check template literals containing SQL
      TemplateLiteral(node) {
        const sourceCode = context.getSourceCode();
        const text = sourceCode.getText(node).toLowerCase();
        
        // Check for INSERT INTO items patterns
        if (text.includes('insert') && text.includes('into') && text.includes('items')) {
          context.report({
            node,
            messageId: "noRawSqlInsert",
          });
        }
      },
      // Check regular string literals
      Literal(node) {
        if (typeof node.value === 'string') {
          const text = node.value.toLowerCase();
          if (text.includes('insert') && text.includes('into') && text.includes('items')) {
            context.report({
              node,
              messageId: "noRawSqlInsert",
            });
          }
        }
      },
      // Check tagged template literals (sql`...`)
      TaggedTemplateExpression(node) {
        const sourceCode = context.getSourceCode();
        const text = sourceCode.getText(node).toLowerCase();
        
        if (text.includes('insert') && text.includes('into') && text.includes('items')) {
          context.report({
            node,
            messageId: "noRawSqlInsert",
          });
        }
      },
    };
  },
};

/** @type {import('eslint').Linter.Plugin} */
const plugin = {
  meta: {
    name: "jurnapod-test-rules",
    version: "1.0.0",
  },
  rules: {
    "no-hardcoded-ids": noHardcodedIdsRule,
    "no-raw-sql-insert-items": noRawSqlInsertItemsRule,
  },
  configs: {
    recommended: {
      plugins: ["jurnapod-test-rules"],
      rules: {
        "jurnapod-test-rules/no-hardcoded-ids": "error",
        "jurnapod-test-rules/no-raw-sql-insert-items": "error",
      },
    },
  },
};

export default plugin;
export { noHardcodedIdsRule, noRawSqlInsertItemsRule };
