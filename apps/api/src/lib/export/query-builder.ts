// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Query Builder
 * 
 * Provides query building and execution functions for exporting data.
 * Supports multiple entity types with dynamic column selection and filtering.
 */

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "../db.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported entity types for export
 */
export type ExportableEntity = "items" | "item_prices" | "item_groups" | "accounts";

/**
 * Export filter options
 */
export interface ExportFilters {
  /** Company ID (required for security) */
  company_id: number;
  /** Optional outlet ID for outlet-scoped exports */
  outlet_id?: number;
  /** Search term (matches against name and code fields) */
  search?: string;
  /** Filter by active status */
  is_active?: boolean;
  /** Filter by entity type (e.g., item_type for items) */
  type?: string;
  /** Filter by group ID */
  group_id?: number;
  /** Start date for date range filter */
  date_from?: Date | string;
  /** End date for date range filter */
  date_to?: Date | string;
  /** View mode for item_prices: 'defaults' or 'outlet' */
  view_mode?: "defaults" | "outlet";
  /** Scope filter for item_prices: 'override' or 'default' */
  scope_filter?: "override" | "default";
}

/**
 * Export build options - options for building export queries
 */
export interface ExportBuildOptions {
  /** Specific columns to include (undefined = all columns) */
  columns?: string[];
  /** Export format (required) */
  format: "csv" | "xlsx" | "json";
  /** Maximum rows to export (for preview/sample exports) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Built query result
 */
export interface BuiltQuery {
  /** SQL query string */
  sql: string;
  /** Query parameter values */
  values: unknown[];
}

// ============================================================================
// Column Definitions
// ============================================================================

/**
 * Column mappings for items entity
 */
const ITEM_COLUMNS = {
  id: "i.id",
  sku: "i.sku",
  name: "i.name",
  item_type: "i.item_type",
  barcode: "i.barcode",
  item_group_id: "i.item_group_id",
  item_group_name: "ig.name",
  is_active: "i.is_active",
  track_stock: "i.track_stock",
  low_stock_threshold: "i.low_stock_threshold",
  created_at: "i.created_at",
  updated_at: "i.updated_at",
} as const;

/**
 * Column mappings for item_prices entity
 */
const ITEM_PRICE_COLUMNS = {
  id: "ip.id",
  item_id: "ip.item_id",
  item_sku: "i.sku",
  item_name: "i.name",
  outlet_id: "ip.outlet_id",
  outlet_name: "o.name",
  price: "ip.price",
  is_active: "ip.is_active",
  is_override: "CASE WHEN ip.outlet_id IS NOT NULL THEN 1 ELSE 0 END",
  created_at: "ip.created_at",
  updated_at: "ip.updated_at",
} as const;

/**
 * Column mappings for item_groups entity
 */
const ITEM_GROUP_COLUMNS = {
  id: "ig.id",
  code: "ig.code",
  name: "ig.name",
  parent_id: "ig.parent_id",
  parent_name: "parent_ig.name",
  is_active: "ig.is_active",
  created_at: "ig.created_at",
  updated_at: "ig.updated_at",
} as const;

/**
 * Column mappings for accounts entity
 */
const ACCOUNT_COLUMNS = {
  id: "a.id",
  code: "a.code",
  name: "a.name",
  account_type_id: "a.account_type_id",
  type_name: "a.type_name",
  normal_balance: "a.normal_balance",
  report_group: "a.report_group",
  parent_account_id: "a.parent_account_id",
  parent_name: "parent_a.name",
  is_active: "a.is_active",
  is_payable: "a.is_payable",
  is_group: "a.is_group",
  created_at: "a.created_at",
  updated_at: "a.updated_at",
} as const;

/**
 * All column definitions by entity
 */
const COLUMN_DEFINITIONS: Record<ExportableEntity, Readonly<Record<string, string>>> = {
  items: ITEM_COLUMNS,
  item_prices: ITEM_PRICE_COLUMNS,
  item_groups: ITEM_GROUP_COLUMNS,
  accounts: ACCOUNT_COLUMNS,
};

/**
 * Valid columns per entity
 */
const VALID_COLUMNS: Record<ExportableEntity, readonly string[]> = {
  items: Object.keys(ITEM_COLUMNS),
  item_prices: Object.keys(ITEM_PRICE_COLUMNS),
  item_groups: Object.keys(ITEM_GROUP_COLUMNS),
  accounts: Object.keys(ACCOUNT_COLUMNS),
};

// ============================================================================
// Query Building
// ============================================================================

/**
 * Build an export query for the specified entity type
 * 
 * @param entityType - The entity type to query
 * @param filters - Filter options
 * @param options - Export options including column selection
 * @returns Object containing SQL query and parameter values
 */
export function buildExportQuery(
  entityType: ExportableEntity,
  filters: ExportFilters,
  options: ExportBuildOptions
): BuiltQuery {
  switch (entityType) {
    case "items":
      return buildItemsQuery(filters, options);
    case "item_prices":
      return buildItemPricesQuery(filters, options);
    case "item_groups":
      return buildItemGroupsQuery(filters, options);
    case "accounts":
      return buildAccountsQuery(filters, options);
    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

/**
 * Build query for items entity
 */
function buildItemsQuery(filters: ExportFilters, options: ExportBuildOptions): BuiltQuery {
  const columns = resolveColumns("items", options.columns);
  const selectedColumns = columns.map((c) => ITEM_COLUMNS[c as keyof typeof ITEM_COLUMNS]).join(", ");

  let sql = `
    SELECT ${selectedColumns}
    FROM items i
    LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = i.company_id
    WHERE i.company_id = ?
      AND i.deleted_at IS NULL
  `;
  const values: unknown[] = [filters.company_id];

  // Outlet filter
  if (filters.outlet_id !== undefined) {
    sql += " AND (i.outlet_id = ? OR i.outlet_id IS NULL)";
    values.push(filters.outlet_id);
  }

  // Active status filter
  if (filters.is_active !== undefined) {
    sql += " AND i.is_active = ?";
    values.push(filters.is_active ? 1 : 0);
  }

  // Type filter
  if (filters.type) {
    sql += " AND i.item_type = ?";
    values.push(filters.type);
  }

  // Group ID filter
  if (filters.group_id) {
    sql += " AND i.item_group_id = ?";
    values.push(filters.group_id);
  }

  // Search filter
  if (filters.search) {
    sql += " AND (i.name LIKE ? OR i.sku LIKE ?)";
    const searchPattern = `%${filters.search}%`;
    values.push(searchPattern, searchPattern);
  }

  // Date range filters
  if (filters.date_from) {
    sql += " AND i.updated_at >= ?";
    values.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += " AND i.updated_at <= ?";
    values.push(filters.date_to);
  }

  // Ordering
  sql += " ORDER BY i.name ASC";

  // Limit and offset
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    values.push(options.limit);
  }

  if (options.offset !== undefined) {
    sql += " OFFSET ?";
    values.push(options.offset);
  }

  return { sql: sql.trim(), values };
}

/**
 * Build query for item_prices entity
 */
function buildItemPricesQuery(filters: ExportFilters, options: ExportBuildOptions): BuiltQuery {
  const columns = resolveColumns("item_prices", options.columns);
  const selectedColumns = columns.map((c) => ITEM_PRICE_COLUMNS[c as keyof typeof ITEM_PRICE_COLUMNS]).join(", ");

  let sql: string;
  const values: unknown[] = [];

  if (filters.outlet_id) {
    // Outlet-specific view with override information
    sql = `
      SELECT 
        ${selectedColumns}
        -- Reconstruct the select with COALESCE for outlet view
      FROM items i
      LEFT JOIN item_prices override ON override.item_id = i.id 
        AND override.company_id = i.company_id 
        AND override.outlet_id = ?
      LEFT JOIN item_prices def ON def.item_id = i.id 
        AND def.company_id = i.company_id 
        AND def.outlet_id IS NULL
      LEFT JOIN outlets o ON o.id = ? AND o.company_id = i.company_id
      WHERE i.company_id = ?
        AND (override.id IS NOT NULL OR def.id IS NOT NULL)
    `;
    values.unshift(filters.outlet_id); // For override join
    values.unshift(filters.outlet_id); // For outlet_name join
    values.push(filters.outlet_id); // For WHERE clause on outlet
    values.push(filters.company_id);
  } else {
    // Company-wide view (all prices)
    sql = `
      SELECT ${selectedColumns}
      FROM item_prices ip
      INNER JOIN items i ON i.id = ip.item_id AND i.company_id = ip.company_id
      LEFT JOIN outlets o ON o.id = ip.outlet_id AND o.company_id = ip.company_id
      WHERE ip.company_id = ?
    `;
    values.push(filters.company_id);
  }

  // Active status filter
  if (filters.is_active !== undefined) {
    if (filters.outlet_id) {
      sql += " AND COALESCE(override.is_active, def.is_active) = ?";
    } else {
      sql += " AND ip.is_active = ?";
    }
    values.push(filters.is_active ? 1 : 0);
  }

  // Search filter
  if (filters.search) {
    sql += " AND (i.name LIKE ? OR i.sku LIKE ?)";
    const searchPattern = `%${filters.search}%`;
    values.push(searchPattern, searchPattern);
  }

  // Scope filter
  if (filters.scope_filter === "override" && !filters.outlet_id) {
    sql += " AND ip.outlet_id IS NOT NULL";
  } else if (filters.scope_filter === "default" && !filters.outlet_id) {
    sql += " AND ip.outlet_id IS NULL";
  }

  // Date range filters
  if (filters.date_from) {
    if (filters.outlet_id) {
      sql += " AND COALESCE(override.updated_at, def.updated_at) >= ?";
    } else {
      sql += " AND ip.updated_at >= ?";
    }
    values.push(filters.date_from);
  }

  if (filters.date_to) {
    if (filters.outlet_id) {
      sql += " AND COALESCE(override.updated_at, def.updated_at) <= ?";
    } else {
      sql += " AND ip.updated_at <= ?";
    }
    values.push(filters.date_to);
  }

  // Ordering
  if (filters.outlet_id) {
    sql += " ORDER BY i.id ASC, ip.outlet_id IS NULL DESC, ip.outlet_id ASC";
  } else {
    sql += " ORDER BY i.id ASC, ip.outlet_id IS NULL DESC, ip.outlet_id ASC";
  }

  // Limit and offset
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    values.push(options.limit);
  }

  if (options.offset !== undefined) {
    sql += " OFFSET ?";
    values.push(options.offset);
  }

  return { sql: sql.trim().replace(/-- Reconstruct.*$/gm, "").replace(/\s+/g, " ").trim(), values };
}

/**
 * Build query for item_groups entity
 */
function buildItemGroupsQuery(filters: ExportFilters, options: ExportBuildOptions): BuiltQuery {
  const columns = resolveColumns("item_groups", options.columns);
  const selectedColumns = columns.map((c) => ITEM_GROUP_COLUMNS[c as keyof typeof ITEM_GROUP_COLUMNS]).join(", ");

  let sql = `
    SELECT ${selectedColumns}
    FROM item_groups ig
    LEFT JOIN item_groups parent_ig ON parent_ig.id = ig.parent_id AND parent_ig.company_id = ig.company_id
    WHERE ig.company_id = ?
  `;
  const values: unknown[] = [filters.company_id];

  // Active status filter
  if (filters.is_active !== undefined) {
    sql += " AND ig.is_active = ?";
    values.push(filters.is_active ? 1 : 0);
  }

  // Parent group filter
  if (filters.group_id !== undefined) {
    sql += " AND ig.parent_id = ?";
    values.push(filters.group_id);
  }

  // Search filter
  if (filters.search) {
    sql += " AND (ig.name LIKE ? OR ig.code LIKE ?)";
    const searchPattern = `%${filters.search}%`;
    values.push(searchPattern, searchPattern);
  }

  // Date range filters
  if (filters.date_from) {
    sql += " AND ig.updated_at >= ?";
    values.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += " AND ig.updated_at <= ?";
    values.push(filters.date_to);
  }

  // Ordering
  sql += " ORDER BY ig.name ASC";

  // Limit and offset
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    values.push(options.limit);
  }

  if (options.offset !== undefined) {
    sql += " OFFSET ?";
    values.push(options.offset);
  }

  return { sql: sql.trim(), values };
}

/**
 * Build query for accounts entity
 */
function buildAccountsQuery(filters: ExportFilters, options: ExportBuildOptions): BuiltQuery {
  const columns = resolveColumns("accounts", options.columns);
  const selectedColumns = columns.map((c) => ACCOUNT_COLUMNS[c as keyof typeof ACCOUNT_COLUMNS]).join(", ");

  let sql = `
    SELECT ${selectedColumns}
    FROM accounts a
    LEFT JOIN accounts parent_a ON parent_a.id = a.parent_account_id AND parent_a.company_id = a.company_id
    WHERE a.company_id = ?
  `;
  const values: unknown[] = [filters.company_id];

  // Active status filter
  if (filters.is_active !== undefined) {
    sql += " AND a.is_active = ?";
    values.push(filters.is_active ? 1 : 0);
  }

  // Type filter
  if (filters.type) {
    sql += " AND a.type_name = ?";
    values.push(filters.type);
  }

  // Parent account filter
  if (filters.group_id !== undefined) {
    sql += " AND a.parent_account_id = ?";
    values.push(filters.group_id);
  }

  // Search filter
  if (filters.search) {
    sql += " AND (a.name LIKE ? OR a.code LIKE ?)";
    const searchPattern = `%${filters.search}%`;
    values.push(searchPattern, searchPattern);
  }

  // Date range filters
  if (filters.date_from) {
    sql += " AND a.updated_at >= ?";
    values.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += " AND a.updated_at <= ?";
    values.push(filters.date_to);
  }

  // Ordering
  sql += " ORDER BY a.code ASC";

  // Limit and offset
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    values.push(options.limit);
  }

  if (options.offset !== undefined) {
    sql += " OFFSET ?";
    values.push(options.offset);
  }

  return { sql: sql.trim(), values };
}

/**
 * Resolve columns to export based on options
 * 
 * @param entityType - The entity type
 * @param requestedColumns - Columns requested in options (undefined = all)
 * @returns Array of column keys to include
 */
function resolveColumns(entityType: ExportableEntity, requestedColumns?: string[]): string[] {
  if (!requestedColumns || requestedColumns.length === 0) {
    return [...VALID_COLUMNS[entityType]];
  }

  // Validate and filter requested columns
  const validColSet = new Set(VALID_COLUMNS[entityType]);
  return requestedColumns.filter((col) => validColSet.has(col));
}

// ============================================================================
// Query Execution
// ============================================================================

/**
 * Execute an export query and return results
 * 
 * @param sql - SQL query string (should use ? placeholders)
 * @param values - Query parameter values
 * @param connection - Optional database connection (uses pool if not provided)
 * @returns Array of row data
 */
export async function executeExportQuery(
  sql: string,
  values: unknown[],
  connection?: PoolConnection
): Promise<RowDataPacket[]> {
  const pool = connection ?? getDbPool();
  
  const [rows] = await pool.execute<RowDataPacket[]>(sql, values as (string | number | boolean | null)[]);
  
  return rows;
}

/**
 * Execute an export query with a transform function
 * 
 * @param sql - SQL query string
 * @param values - Query parameter values
 * @param transform - Transform function for each row
 * @param connection - Optional database connection
 * @returns Array of transformed rows
 */
export async function executeExportQueryWithTransform<T>(
  sql: string,
  values: unknown[],
  transform: (row: RowDataPacket) => T,
  connection?: PoolConnection
): Promise<T[]> {
  const rows = await executeExportQuery(sql, values, connection);
  return rows.map(transform);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get available columns for an entity type
 */
export function getAvailableColumns(entityType: ExportableEntity): string[] {
  return [...VALID_COLUMNS[entityType]];
}

/**
 * Validate that all requested columns are valid for the entity type
 */
export function validateExportColumns(entityType: ExportableEntity, columns: string[]): { valid: boolean; invalid: string[] } {
  const validColSet = new Set(VALID_COLUMNS[entityType]);
  const invalid = columns.filter((col) => !validColSet.has(col));
  return {
    valid: invalid.length === 0,
    invalid,
  };
}
