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

/**
 * Check if a string looks like a raw SQL statement.
 * Uses SQL-shape regex to avoid false positives from plain English phrases.
 *
 * Flags actual SQL statements:
 *   SELECT ... FROM ...
 *   INSERT INTO ...
 *   UPDATE ... SET ...
 *   DELETE FROM ...
 *
 * Does NOT flag plain English containing SQL words:
 *   "Resuming from batch"  (not a FROM clause)
 *   "Item update failed"   (not an UPDATE statement)
 *   "Select from options"  (not a SELECT query)
 */
function isRawSqlLiteral(text) {
  // Guard against undefined/null input
  if (!text || typeof text !== 'string') {
    return false;
  }
  // Normalize: strip quotes/backticks, lowercase for keyword detection
  const normalized = text.toLowerCase();

  // Must contain SQL keyword near structural elements
  // SELECT ... FROM / WHERE
  if (/\bselect\b[\s\S]{1,200}\bfrom\b/.test(normalized) ||
      /\bselect\b[\s\S]{1,50}\bwhere\b/.test(normalized)) {
    return true;
  }

  // INSERT INTO ... VALUES / SELECT / ON DUPLICATE
  if (/\binsert\b[\s\S]{1,200}\binto\b/.test(normalized)) {
    return true;
  }

  // UPDATE ... SET ...
  if (/\bupdate\b[\s\S]{1,200}\bset\b/.test(normalized)) {
    return true;
  }

  // DELETE FROM ...
  if (/\bdelete\b[\s\S]{1,200}\bfrom\b/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * ESLint Rule: no-route-business-logic
 * 
 * Enforces that API routes remain thin (adapter-only, no business logic).
 * Routes should only:
 * - Handle HTTP concerns (request parsing, response formatting)
 * - Delegate to library/adapter functions for business logic
 * - Perform auth checks, validation, and error translation
 * 
 * Flagged patterns in routes:
 * - Direct getDb() / getDbPool() calls (DB access should be in lib/)
 * - Service instantiation (createXxxService) - should use adapter factories
 * - Raw SQL strings - should be in library modules
 */
const noRouteBusinessLogicRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow business logic in API routes - routes should be thin adapters only",
      category: "Route Quality",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noDirectDbAccess: "Direct database access detected in route. Delegate to library functions instead.",
      noServiceInstantiation: "Service instantiation detected in route ('{{ serviceName }}'). Routes should use adapter factories or delegate to library functions.",
      noRawSql: "Raw SQL detected in route. SQL queries should be in library modules.",
    },
  },
  create(context) {
    const filename = context.getFilename();
    
    // Only apply to route files
    const isRouteFile = filename.includes('/routes/') && filename.endsWith('.ts');
    if (!isRouteFile) {
      return {};
    }

    // Allowed imports for thin routes
    const allowedImportPatterns = [
      // Auth helpers
      /^@\/lib\/auth$/,
      /^@\/lib\/auth-guard$/,
      /^@\/lib\/auth-adapter$/,
      // Response helpers
      /^@\/lib\/response$/,
      /^@\/lib\/shared\/common-errors$/,
      /^@\/lib\/shared\/common-utils$/,
      // Company lookup
      /^@\/lib\/companies$/,
      // Adapter factories (createXxxDb patterns)
      /^@\/lib\/modules-/,
      // External packages
      /^@jurnapod\/shared$/,
      /^zod$/,
      /^hono$/,
    ];

    const isAllowedImport = (importPath) => {
      return allowedImportPatterns.some(pattern => pattern.test(importPath));
    };

    // Check if an identifier name looks like a service factory (creates business logic)
    const isServiceFactoryCall = (calleeName) => {
      return /^create[A-Z]\w+Service$/.test(calleeName);
    };

    return {
      // Flag direct getDb() or getDbPool() calls
      CallExpression(node) {
        const callee = node.callee;
        
        // Check for getDb() or getDbPool() calls
        if (callee.type === 'Identifier') {
          if (callee.name === 'getDb' || callee.name === 'getDbPool') {
            context.report({
              node,
              messageId: "noDirectDbAccess",
            });
          }
        }

        // Check for service instantiation like createInvoiceService({...})
        if (callee.type === 'Identifier' && isServiceFactoryCall(callee.name)) {
          context.report({
            node,
            messageId: "noServiceInstantiation",
            data: { serviceName: callee.name },
          });
        }
      },

      // Flag direct SQL strings
      TemplateLiteral(node) {
        const sourceCode = context.getSourceCode();
        const text = sourceCode.getText(node);

        if (isRawSqlLiteral(text)) {
          context.report({
            node,
            messageId: "noRawSql",
          });
        }
      },

      // Flag raw SQL in string literals
      Literal(node) {
        if (typeof node.value === 'string') {
          if (isRawSqlLiteral(node.value)) {
            context.report({
              node,
              messageId: "noRawSql",
            });
          }
        }
      },

      // Flag restricted imports
      ImportDeclaration(node) {
        const importPath = node.source.value;
        
        if (typeof importPath !== 'string') return;
        
        // Allow test files to have their own patterns
        if (filename.includes('.test.') || filename.includes('.spec.')) {
          return;
        }

        // Flag direct db imports in routes (but allow adapter factories)
        if (importPath === '@/lib/db' || importPath === '@/lib/kysely') {
          // Check if it's used for adapter creation only
          // If imported directly in a route, flag it
          context.report({
            node,
            messageId: "noDirectDbAccess",
          });
        }
      },
    };
  },
};

/**
 * ESLint Rule: no-transaction-scope-escape
 * 
 * Detects transaction scope escape anti-patterns:
 * - Using outer `db` instead of `trx` inside transaction callbacks
 * - Using `this.db` instead of `trx` inside transaction callbacks
 * - Passing outer `db` to helper functions inside transaction callbacks
 * 
 * The anti-pattern looks like:
 *   withTransactionRetry(db, async (trx) => {
 *     // BUG: using `db` instead of `trx` escapes the transaction!
 *     await db.selectFrom('items').execute();
 *   });
 * 
 * It should be:
 *   withTransactionRetry(db, async (trx) => {
 *     await trx.selectFrom('items').execute();
 *   });
 */
const noTransactionScopeEscapeRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow outer-scope database references inside transaction callbacks",
      category: "Database Quality",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      outerDbAccess: "Outer-scope 'db' reference detected inside transaction callback. Use 'trx' instead to keep operations within the transaction.",
      thisDbAccess: "Instance 'this.db' reference detected inside transaction callback. Create services with 'trx' instead to keep operations within the transaction.",
      outerDbPassed: "Outer-scope 'db' passed to function '{{ functionName }}' inside transaction callback. Pass 'trx' instead to keep operations within the transaction.",
    },
  },
  create(context) {
    // Stack to track transaction callback scopes
    // Each entry has: { depth: number, trxVarNames: string[] }
    const scopeStack = [];
    let currentDepth = 0;
    
    // Transaction callback parameter names to look for
    const TRX_PARAM_NAMES = ['trx', 'tx', 'innerTrx', 'executor', 'executionCtx'];
    
    // Helper to check if we're inside a transaction callback
    const isInsideTransactionCallback = () => {
      return scopeStack.length > 0;
    };
    
    // Helper to check if a node matches db access pattern
    const isDbAccess = (node) => {
      if (node.type === 'MemberExpression') {
        // this.db pattern
        if (node.object.type === 'ThisExpression' && 
            node.property.type === 'Identifier' && 
            node.property.name === 'db') {
          return true;
        }
      }
      return false;
    };
    
    // Helper to check if it's a db identifier (but not trx)
    const isDbIdentifier = (name) => {
      return name === 'db' || name === 'database';
    };
    
    return {
      // Track entering a function that looks like a transaction callback
      'ArrowFunctionExpression, FunctionExpression': function(node) {
        const params = node.params || [];
        const paramNames = params
          .filter(p => p.type === 'Identifier')
          .map(p => p.name);
        
        // Check if this function has a transaction parameter
        const hasTrxParam = paramNames.some(name => TRX_PARAM_NAMES.includes(name));
        
        if (hasTrxParam) {
          currentDepth++;
          scopeStack.push({
            depth: currentDepth,
            trxVarNames: paramNames.filter(name => TRX_PARAM_NAMES.includes(name)),
          });
        }
      },
      
      // Track exiting a function
      'ArrowFunctionExpression, FunctionExpression': function(node) {
        const params = node.params || [];
        const paramNames = params
          .filter(p => p.type === 'Identifier')
          .map(p => p.name);
        
        const hasTrxParam = paramNames.some(name => TRX_PARAM_NAMES.includes(name));
        
        if (hasTrxParam && scopeStack.length > 0) {
          scopeStack.pop();
          currentDepth--;
        }
      },
      
      // Flag this.db access inside transaction callbacks
      MemberExpression: function(node) {
        if (!isInsideTransactionCallback()) return;
        
        // Check for this.db pattern
        if (node.object.type === 'ThisExpression' && 
            node.property.type === 'Identifier' && 
            node.property.name === 'db') {
          context.report({
            node,
            messageId: "thisDbAccess",
          });
          return;
        }
        
        // Check for db.something pattern (outer db, not trx)
        if (node.object.type === 'Identifier') {
          const name = node.object.name;
          // Only flag if it's 'db' or 'database' but NOT one of the trx names
          if (isDbIdentifier(name) && !TRX_PARAM_NAMES.includes(name)) {
            context.report({
              node,
              messageId: "outerDbAccess",
            });
          }
        }
      },
      
      // Flag passing db to functions inside transaction callbacks
      CallExpression: function(node) {
        if (!isInsideTransactionCallback()) return;
        
        // Check if db or this.db is being passed as an argument
        const hasDbArg = node.arguments && node.arguments.some(arg => {
          if (arg.type === 'Identifier' && isDbIdentifier(arg.name)) {
            return true;
          }
          if (arg.type === 'MemberExpression' &&
              arg.object.type === 'ThisExpression' &&
              arg.property.type === 'Identifier' &&
              arg.property.name === 'db') {
            return true;
          }
          return false;
        });
        
        if (hasDbArg && node.callee.type === 'Identifier') {
          context.report({
            node,
            messageId: "outerDbPassed",
            data: { functionName: node.callee.name },
          });
        }
      },
    };
  },
};

/**
 * ESLint Rule: no-datetime-reimplementation
 * 
 * Detects deprecated datetime function calls (toEpochMs, fromEpochMs,
 * toUtcInstant, fromUtcInstant, resolveEventTime) outside the canonical
 * datetime module location.
 * 
 * These functions have been replaced by the namespaced API in:
 *   packages/shared/src/schemas/datetime.ts
 * 
 * The canonical file itself is allowed to define/re-export these functions.
 */
const noDatetimeReimplementationRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow deprecated datetime function calls outside canonical location",
      category: "Migration",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      datetimeReimplementation: "Deprecated datetime function '{{name}}' reimplemented outside canonical location. Use the namespaced API from packages/shared/src/schemas/datetime.ts instead.",
    },
  },
  create(context) {
    // Deprecated function names to detect
    const DEPRECATED_FUNCTIONS = [
      'toEpochMs',
      'fromEpochMs',
      'toUtcInstant',
      'fromUtcInstant',
      'resolveEventTime',
    ];

    // Canonical file where these functions are legitimately defined
    const CANONICAL_PATH = 'packages/shared/src/schemas/datetime.ts';

    const filename = context.getFilename();

    // Skip the canonical file itself (it's the source of truth)
    if (filename.includes(CANONICAL_PATH)) {
      return {};
    }

    return {
      // Check for function calls to deprecated datetime functions
      CallExpression(node) {
        const callee = node.callee;

        // Check for direct identifier calls: toEpochMs(...)
        if (callee.type === 'Identifier' && DEPRECATED_FUNCTIONS.includes(callee.name)) {
          context.report({
            node,
            messageId: "datetimeReimplementation",
            data: { name: callee.name },
          });
          return;
        }

        // Check for member expression calls: datetime.toEpochMs(...)
        if (callee.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            callee.property.type === 'Identifier' &&
            DEPRECATED_FUNCTIONS.includes(callee.property.name)) {
          context.report({
            node,
            messageId: "datetimeReimplementation",
            data: { name: callee.property.name },
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
    "no-route-business-logic": noRouteBusinessLogicRule,
    "no-transaction-scope-escape": noTransactionScopeEscapeRule,
    "no-datetime-reimplementation": noDatetimeReimplementationRule,
  },
  configs: {
    recommended: {
      plugins: ["jurnapod-test-rules"],
      rules: {
        "jurnapod-test-rules/no-hardcoded-ids": "error",
        "jurnapod-test-rules/no-raw-sql-insert-items": "error",
        "jurnapod-test-rules/no-route-business-logic": "error",
        "jurnapod-test-rules/no-transaction-scope-escape": "error",
        "jurnapod-test-rules/no-datetime-reimplementation": "error",
      },
    },
  },
};

export default plugin;
export { noHardcodedIdsRule, noRawSqlInsertItemsRule, noRouteBusinessLogicRule, noTransactionScopeEscapeRule, noDatetimeReimplementationRule };
