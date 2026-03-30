/**
 * SQL Parser Utility
 *
 * Transitional utility for parsing raw SQL during migration from raw SQL strings
 * to Kysely query builder. Once all queries use Kysely directly, this utility
 * will be deprecated.
 *
 * @module sql-parser
 */

/**
 * Represents a parsed WHERE condition from a SQL query.
 */
export interface WhereCondition {
  /** The column name being filtered */
  column: string;
  /** The value to compare against */
  value: unknown;
  /** Whether the condition checks for NULL */
  isNull?: boolean;
  /** Operator type - 'in' for IN clauses, 'like' for LIKE patterns */
  operator?: 'in' | 'like';
}

/**
 * Extracts the table name from a SQL statement.
 *
 * Handles:
 * - SELECT FROM table_name
 * - INSERT INTO table_name
 * - UPDATE table_name
 * - DELETE FROM table_name
 *
 * @param sql - The raw SQL string to parse
 * @returns The table name in lowercase
 *
 * @example
 * parseTableName("SELECT * FROM users WHERE id = ?") // "users"
 * parseTableName("INSERT INTO auth_tokens VALUES (?, ?)") // "auth_tokens"
 * parseTableName("UPDATE companies SET name = ? WHERE id = ?") // "companies"
 * parseTableName("DELETE FROM sessions WHERE expires_at < ?") // "sessions"
 */
export function parseTableName(sql: string): string {
  const normalized = sql.trim().toUpperCase();

  // SELECT ... FROM table_name
  const selectMatch = normalized.match(/^\s*SELECT\s+.+\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (selectMatch) {
    return selectMatch[1].toLowerCase();
  }

  // INSERT INTO table_name
  const insertMatch = normalized.match(/^\s*INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (insertMatch) {
    return insertMatch[1].toLowerCase();
  }

  // UPDATE table_name
  const updateMatch = normalized.match(/^\s*UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (updateMatch) {
    return updateMatch[1].toLowerCase();
  }

  // DELETE FROM table_name
  const deleteMatch = normalized.match(/^\s*DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (deleteMatch) {
    return deleteMatch[1].toLowerCase();
  }

  // Fallback: look for table name after any of the keywords at the start
  const genericMatch = sql.trim().match(/^(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (genericMatch) {
    return genericMatch[1].toLowerCase();
  }

  throw new Error(`Unable to parse table name from SQL: ${sql.substring(0, 100)}`);
}

/**
 * Extracts the list of column names from a SELECT query.
 *
 * Only handles simple SELECT queries. Complex cases like:
 * - JOINs with table aliases (SELECT u.name FROM users u)
 * - Function calls (SELECT COUNT(*))
 * - Subqueries
 * may not parse correctly.
 *
 * @param sql - The raw SQL string to parse
 * @returns Array of column names (lowercase), or ['*'] if no specific columns found
 *
 * @example
 * parseColumns("SELECT id, email, name FROM users") // ["id", "email", "name"]
 * parseColumns("SELECT u.id, u.name FROM users u") // ["u.id", "u.name"]
 * parseColumns("SELECT * FROM users") // ["*"]
 */
export function parseColumns(sql: string): string[] {
  const normalized = sql.trim().toUpperCase();

  // Must start with SELECT
  if (!normalized.startsWith('SELECT')) {
    return ['*'];
  }

  // Extract content between SELECT and FROM
  const fromIndex = normalized.indexOf('FROM');
  if (fromIndex === -1) {
    // No FROM clause - invalid SQL for our purposes, return *
    return ['*'];
  }

  const columnsStr = sql.substring(7, fromIndex).trim();

  // Handle SELECT *
  if (columnsStr === '*') {
    return ['*'];
  }

  // Split by comma and clean up each column
  const columns = columnsStr
    .split(',')
    .map(col => col.trim())
    .filter(col => col.length > 0)
    .map(col => {
      // Remove AS alias if present (e.g., "c.timezone AS company_timezone")
      const asIndex = col.toLowerCase().indexOf(' as ');
      if (asIndex !== -1) {
        col = col.substring(0, asIndex);
      }
      // Remove table prefix if present (e.g., "u.id" -> "id")
      // But preserve if it's a function or expression
      const dotIndex = col.indexOf('.');
      if (dotIndex !== -1) {
        const afterDot = col.substring(dotIndex + 1).trim();
        // If it looks like a column name (not a function), take just the part after dot
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(afterDot)) {
          return afterDot.toLowerCase();
        }
      }
      return col.toLowerCase();
    });

  return columns.length > 0 ? columns : ['*'];
}

/**
 * Parses WHERE conditions from a SQL query and maps them to parameter values.
 *
 * Supports:
 * - Simple equality: WHERE column = ?
 * - IN clauses: WHERE column IN (?, ?, ?)
 * - LIKE patterns: WHERE column LIKE ?
 * - NULL checks: WHERE column IS NULL / column IS NOT NULL
 * - AND combinations
 *
 * Note: This is a simplified parser. Complex WHERE clauses with OR conditions,
 * nested subqueries, or functions may not parse correctly.
 *
 * @param sql - The raw SQL string to parse
 * @param params - The parameter values to map into conditions
 * @returns Array of WhereCondition objects
 *
 * @example
 * const conditions = parseWhereConditions(
 *   "SELECT * FROM users WHERE email = ? AND is_active = ?",
 *   ["test@example.com", 1]
 * );
 * // [{ column: "email", value: "test@example.com" }, { column: "is_active", value: 1 }]
 */
export function parseWhereConditions(sql: string, params: unknown[]): WhereCondition[] {
  const conditions: WhereCondition[] = [];

  // Find WHERE clause
  const whereIndex = sql.toUpperCase().indexOf('WHERE');
  if (whereIndex === -1) {
    return conditions;
  }

  // Extract WHERE clause content (everything after WHERE keyword)
  let whereClause = sql.substring(whereIndex + 5).trim();

  // Handle multiple conditions - extract up to ORDER BY, GROUP BY, LIMIT, or end
  const stopKeywords = ['ORDER BY', 'GROUP BY', 'LIMIT'];
  let endIndex = whereClause.length;

  for (const stop of stopKeywords) {
    const idx = whereClause.toUpperCase().indexOf(stop);
    if (idx !== -1 && idx < endIndex) {
      endIndex = idx;
    }
  }

  whereClause = whereClause.substring(0, endIndex).trim();

  if (!whereClause) {
    return conditions;
  }

  // Split by AND (being careful not to split on AND inside parentheses)
  const conditionParts = splitByAnd(whereClause);
  let paramIndex = 0;

  for (const part of conditionParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const condition = parseCondition(trimmed, params, conditions.length);
    if (condition) {
      conditions.push(condition);
    }
  }

  return conditions;
}

/**
 * Internal helper to split WHERE clause by AND, respecting parentheses.
 */
function splitByAnd(clause: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < clause.length; i++) {
    const char = clause[i];

    // Handle string literals
    if ((char === "'" || char === '"') && (i === 0 || clause[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (char === '\'' && i + 1 < clause.length && clause[i + 1] === '\'') {
        // Handle escaped quotes
      } else if (depth === 0 && char === ' ') {
        // Check for AND at word boundary
        const remaining = clause.substring(i).toUpperCase();
        if (remaining.startsWith('AND ')) {
          if (current.trim()) {
            parts.push(current.trim());
          }
          current = '';
          i += 3; // Skip "AND "
          continue;
        }
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Internal helper to parse a single condition.
 */
function parseCondition(
  part: string,
  params: unknown[],
  conditionIndex: number
): WhereCondition | null {
  const normalized = part.toUpperCase().trim();

  // IS NULL / IS NOT NULL
  const nullMatch = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s+IS\s+(NOT\s+)?NULL$/i);
  if (nullMatch) {
    return {
      column: extractColumnName(nullMatch[1]),
      value: null,
      isNull: true
    };
  }

  // IN clause: column IN (?, ?, ?) or column NOT IN (?, ?, ?)
  const inMatch = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s+(NOT\s+)?IN\s*\((.*)\)$/i);
  if (inMatch) {
    const values = extractInValues(inMatch[3], params);
    return {
      column: extractColumnName(inMatch[1]),
      value: values,
      operator: 'in'
    };
  }

  // LIKE clause: column LIKE ?
  const likeMatch = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s+LIKE\s+\?$/i);
  if (likeMatch) {
    const paramIndex = findParamIndex(params, conditionIndex);
    return {
      column: extractColumnName(likeMatch[1]),
      value: params[paramIndex] ?? null,
      operator: 'like'
    };
  }

  // Simple comparison: column = ? (and variations)
  const eqMatch = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*=\s*\?$/i);
  if (eqMatch) {
    const paramIndex = findParamIndex(params, conditionIndex);
    return {
      column: extractColumnName(eqMatch[1]),
      value: params[paramIndex] ?? null
    };
  }

  // Other comparisons: column > ?, column < ?, etc.
  const comparisonMatch = normalized.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(<|>|<=|>=|!=|<>)\s*\?$/i);
  if (comparisonMatch) {
    const paramIndex = findParamIndex(params, conditionIndex);
    return {
      column: extractColumnName(comparisonMatch[1]),
      value: params[paramIndex] ?? null
    };
  }

  return null;
}

/**
 * Extracts clean column name, handling table aliases like "u.id" -> "u.id"
 */
function extractColumnName(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Extracts values from IN clause parentheses.
 */
function extractInValues(inContent: string, params: unknown[]): unknown[] {
  const values: unknown[] = [];
  let current = '';
  let paramCount = 0;

  for (let i = 0; i < inContent.length; i++) {
    const char = inContent[i];

    if (char === '?') {
      if (paramCount < params.length) {
        values.push(params[paramCount]);
        paramCount++;
      }
    } else if (char.trim() === '') {
      // Skip whitespace
      if (current.trim()) {
        // Could be a literal value, but we only support ? placeholders
        current = '';
      }
    } else if (char === ',' || char === ')') {
      current = current.trim();
      if (current) {
        // This would be a literal value - for now we only support ? placeholders
        current = '';
      }
      if (char === ')') break;
    } else {
      current += char;
    }
  }

  return values;
}

/**
 * Finds the next available parameter index, attempting to match position.
 * This is a heuristic since SQL parameter ordering can be complex.
 */
function findParamIndex(params: unknown[], conditionIndex: number): number {
  // Use modulo to wrap around if there are fewer params than conditions
  return conditionIndex % params.length;
}