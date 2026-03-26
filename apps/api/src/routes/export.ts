// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Export Routes
 *
 * Routes for exporting data:
 * - POST /export/:entityType - Export items or prices
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT, or CASHIER (read operations)
 */

import { Hono } from "hono";
import type { RowDataPacket } from "mysql2";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse } from "../lib/response.js";
import { getDbPool } from "../lib/db.js";
import {
  generateCSVBuffer,
  generateExcel,
  generateExcelChunked,
  generateCSVStream,
  createReadableStream,
  getContentType,
  getFileExtension,
  type ExportColumn,
  type ExportFormat
} from "../lib/export/index.js";

// Constants for streaming thresholds
const STREAMING_THRESHOLD = 10000; // Use streaming for CSV >10K rows
const EXCEL_MAX_ROWS = 50000;      // Hard limit for Excel

/**
 * Check if export should use streaming mode
 */
function shouldUseStreaming(rowCount: number): boolean {
  return rowCount > STREAMING_THRESHOLD;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Types
// =============================================================================

export type EntityType = "items" | "prices";

export interface ExportQueryParams {
  format: ExportFormat;
  columns: string[];
  search?: string;
  type?: string;
  groupId?: number;
  status?: boolean;
  outletId?: number;
  viewMode?: "defaults" | "outlet";
  scopeFilter?: "override" | "default";
  /** Start date for date range filter (ISO string) */
  dateFrom?: string;
  /** End date for date range filter (ISO string) */
  dateTo?: string;
}

// =============================================================================
// Column Definitions
// =============================================================================

export const ITEM_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "id", header: "ID", fieldType: "number" },
  { key: "sku", header: "SKU", fieldType: "string" },
  { key: "name", header: "Name", fieldType: "string" },
  { key: "item_type", header: "Type", fieldType: "string" },
  { key: "barcode", header: "Barcode", fieldType: "string" },
  { key: "item_group_id", header: "Group ID", fieldType: "number" },
  { key: "item_group_name", header: "Group Name", fieldType: "string" },
  { key: "cogs_account_id", header: "COGS Account ID", fieldType: "number" },
  { key: "inventory_asset_account_id", header: "Inventory Asset Account ID", fieldType: "number" },
  { key: "is_active", header: "Active", fieldType: "boolean" },
  { key: "created_at", header: "Created At", fieldType: "datetime" },
  { key: "updated_at", header: "Updated At", fieldType: "datetime" }
];

export const PRICE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "id", header: "ID", fieldType: "number" },
  { key: "item_id", header: "Item ID", fieldType: "number" },
  { key: "item_sku", header: "Item SKU", fieldType: "string" },
  { key: "item_name", header: "Item Name", fieldType: "string" },
  { key: "outlet_id", header: "Outlet ID", fieldType: "number" },
  { key: "outlet_name", header: "Outlet Name", fieldType: "string" },
  { key: "price", header: "Price", fieldType: "money" },
  { key: "is_active", header: "Active", fieldType: "boolean" },
  { key: "is_override", header: "Is Override", fieldType: "boolean" },
  { key: "created_at", header: "Created At", fieldType: "datetime" },
  { key: "updated_at", header: "Updated At", fieldType: "datetime" }
];

export const DEFAULT_ITEM_COLUMNS = ["id", "sku", "name", "item_type", "item_group_name", "is_active"];
export const DEFAULT_PRICE_COLUMNS = ["item_sku", "item_name", "outlet_name", "price", "is_active"];

// =============================================================================
// Helper Functions
// =============================================================================

export function parseExportParams(url: URL): ExportQueryParams {
  const format = (url.searchParams.get("format") as ExportFormat) || "csv";
  const columnsParam = url.searchParams.get("columns");
  const columns = columnsParam
    ? columnsParam.split(",").filter((c) => c.trim())
    : [];

  // Parse integer with NaN validation
  const parseIntParam = (param: string | null): number | undefined => {
    if (!param) return undefined;
    const parsed = parseInt(param, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  // Parse date with format validation (YYYY-MM-DD)
  const parseDateParam = (param: string | null): string | undefined => {
    if (!param) return undefined;
    // Validate YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(param)) return undefined;
    return param;
  };

  return {
    format: format === "xlsx" ? "xlsx" : "csv",
    columns,
    search: url.searchParams.get("search") || undefined,
    type: url.searchParams.get("type") || undefined,
    groupId: parseIntParam(url.searchParams.get("group_id")),
    status: url.searchParams.get("is_active") === "true"
      ? true
      : url.searchParams.get("is_active") === "false"
        ? false
        : undefined,
    outletId: parseIntParam(url.searchParams.get("outlet_id")),
    viewMode: (url.searchParams.get("view_mode") as "defaults" | "outlet") || undefined,
    scopeFilter: (url.searchParams.get("scope_filter") as "override" | "default") || undefined,
    dateFrom: parseDateParam(url.searchParams.get("date_from")),
    dateTo: parseDateParam(url.searchParams.get("date_to"))
  };
}

export function getColumnsForEntity(
  entityType: EntityType,
  selectedColumns: string[]
): ExportColumn[] {
  const allColumns = entityType === "items" ? ITEM_EXPORT_COLUMNS : PRICE_EXPORT_COLUMNS;

  if (selectedColumns.length === 0) {
    const defaults = entityType === "items" ? DEFAULT_ITEM_COLUMNS : DEFAULT_PRICE_COLUMNS;
    return allColumns.filter((col) => defaults.includes(col.key));
  }

  // Preserve order of selected columns
  return selectedColumns
    .map((key) => allColumns.find((col) => col.key === key))
    .filter((col): col is ExportColumn => col !== undefined);
}

export function generateFilename(entityType: EntityType, format: ExportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `jurnapod-${entityType}-${timestamp}${getFileExtension(format)}`;
}

// =============================================================================
// Data Fetching Functions
// =============================================================================

async function fetchItemsForExport(
  companyId: number,
  params: ExportQueryParams
): Promise<Record<string, unknown>[]> {
  const pool = getDbPool();
  const values: Array<number | string | boolean> = [companyId];

  let sql = `
    SELECT 
      i.id,
      i.sku,
      i.name,
      i.item_type,
      i.barcode,
      i.item_group_id,
      ig.name AS item_group_name,
      i.cogs_account_id,
      i.inventory_asset_account_id,
      i.is_active,
      i.created_at,
      i.updated_at
    FROM items i
    LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = i.company_id
    WHERE i.company_id = ?
  `;

  if (typeof params.status === "boolean") {
    sql += " AND i.is_active = ?";
    values.push(params.status ? 1 : 0);
  }

  if (params.type) {
    sql += " AND i.item_type = ?";
    values.push(params.type);
  }

  if (params.groupId) {
    sql += " AND i.item_group_id = ?";
    values.push(params.groupId);
  }

  if (params.search) {
    sql += " AND (i.name LIKE ? OR i.sku LIKE ?)";
    const searchPattern = `%${params.search}%`;
    values.push(searchPattern, searchPattern);
  }

  sql += " ORDER BY i.id ASC";

  const [rows] = await pool.execute<RowDataPacket[]>(sql, values);

  return rows.map((row) => ({
    id: Number(row.id),
    sku: row.sku,
    name: row.name,
    item_type: row.item_type,
    barcode: row.barcode,
    item_group_id: row.item_group_id ? Number(row.item_group_id) : null,
    item_group_name: row.item_group_name,
    cogs_account_id: row.cogs_account_id ? Number(row.cogs_account_id) : null,
    inventory_asset_account_id: row.inventory_asset_account_id
      ? Number(row.inventory_asset_account_id)
      : null,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

async function fetchPricesForExport(
  companyId: number,
  params: ExportQueryParams
): Promise<Record<string, unknown>[]> {
  const pool = getDbPool();
  const values: Array<number | string | boolean> = [companyId];

  // Build query based on view mode
  let sql: string;

  if (params.outletId) {
    // Outlet-specific view with override information
    sql = `
      SELECT 
        COALESCE(override.id, def.id) AS id,
        COALESCE(override.item_id, def.item_id) AS item_id,
        i.sku AS item_sku,
        i.name AS item_name,
        ? AS outlet_id,
        o.name AS outlet_name,
        COALESCE(override.price, def.price) AS price,
        COALESCE(override.is_active, def.is_active) AS is_active,
        CASE WHEN override.id IS NOT NULL THEN 1 ELSE 0 END AS is_override,
        COALESCE(override.updated_at, def.updated_at) AS updated_at,
        COALESCE(override.created_at, def.created_at) AS created_at
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
    values.unshift(params.outletId); // Add outlet_id at the beginning for outlet_name join
    values.unshift(params.outletId); // Add outlet_id at the beginning for override join
    values.push(params.outletId); // Add outlet_id for outlet_name join at the end
  } else {
    // Company-wide view (all prices)
    sql = `
      SELECT 
        ip.id,
        ip.item_id,
        i.sku AS item_sku,
        i.name AS item_name,
        ip.outlet_id,
        o.name AS outlet_name,
        ip.price,
        ip.is_active,
        CASE WHEN ip.outlet_id IS NOT NULL THEN 1 ELSE 0 END AS is_override,
        ip.created_at,
        ip.updated_at
      FROM item_prices ip
      INNER JOIN items i ON i.id = ip.item_id AND i.company_id = ip.company_id
      LEFT JOIN outlets o ON o.id = ip.outlet_id AND o.company_id = ip.company_id
      WHERE ip.company_id = ?
    `;
  }

  if (typeof params.status === "boolean") {
    if (params.outletId) {
      sql += " AND COALESCE(override.is_active, def.is_active) = ?";
    } else {
      sql += " AND ip.is_active = ?";
    }
    values.push(params.status ? 1 : 0);
  }

  if (params.search) {
    if (params.outletId) {
      sql += " AND (i.name LIKE ? OR i.sku LIKE ?)";
    } else {
      sql += " AND (i.name LIKE ? OR i.sku LIKE ?)";
    }
    const searchPattern = `%${params.search}%`;
    values.push(searchPattern, searchPattern);
  }

  // Scope filter for prices
  if (params.scopeFilter === "override" && !params.outletId) {
    sql += " AND ip.outlet_id IS NOT NULL";
  } else if (params.scopeFilter === "default" && !params.outletId) {
    sql += " AND ip.outlet_id IS NULL";
  }

  // Date range filter for prices
  if (params.dateFrom) {
    if (params.outletId) {
      sql += " AND COALESCE(override.updated_at, def.updated_at) >= ?";
    } else {
      sql += " AND ip.updated_at >= ?";
    }
    values.push(params.dateFrom);
  }

  if (params.dateTo) {
    if (params.outletId) {
      sql += " AND COALESCE(override.updated_at, def.updated_at) <= ?";
    } else {
      sql += " AND ip.updated_at <= ?";
    }
    values.push(params.dateTo);
  }

  sql += " ORDER BY i.id ASC, ip.outlet_id IS NULL DESC, ip.outlet_id ASC";

  const [rows] = await pool.execute<RowDataPacket[]>(sql, values);

  return rows.map((row) => ({
    id: Number(row.id),
    item_id: Number(row.item_id),
    item_sku: row.item_sku,
    item_name: row.item_name,
    outlet_id: row.outlet_id ? Number(row.outlet_id) : null,
    outlet_name: row.outlet_name || "Company Default",
    price: Number(row.price),
    is_active: row.is_active === 1,
    is_override: row.is_override === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

// =============================================================================
// Route Handlers
// =============================================================================

const exportRoutes = new Hono();

// Auth middleware
exportRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" }
    });
  }
  c.set("auth", authResult.auth);
  await next();
});

// POST /export/:entityType - Export items or prices
exportRoutes.post("/:entityType", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const entityType = c.req.param("entityType") as EntityType;

    // Validate entity type
    if (entityType !== "items" && entityType !== "prices") {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`,
        400
      );
    }

    // Parse query parameters
    const params = parseExportParams(url);

    // Get columns for export
    const columns = getColumnsForEntity(entityType, params.columns);

    if (columns.length === 0) {
      return errorResponse(
        "INVALID_REQUEST",
        "No valid columns selected for export",
        400
      );
    }

    // Fetch data
    const data =
      entityType === "items"
        ? await fetchItemsForExport(auth.companyId, params)
        : await fetchPricesForExport(auth.companyId, params);

    const format = params.format;
    const rowCount = data.length;
    const filename = generateFilename(entityType, format);

    // Handle large Excel exports (>50K rows)
    if (format === "xlsx" && rowCount > EXCEL_MAX_ROWS) {
      return errorResponse(
        "INVALID_REQUEST",
        `Excel export is limited to ${EXCEL_MAX_ROWS.toLocaleString()} rows. ` +
        `This export has ${rowCount.toLocaleString()} rows. ` +
        `Please use CSV format for larger datasets or apply filters to reduce the result set.`,
        400
      );
    }

    // Use streaming for large CSV datasets (>10K rows)
    if (format === "csv" && shouldUseStreaming(rowCount)) {
      // Create async generator from data array
      async function* dataGenerator() {
        for (const row of data) {
          yield row;
        }
      }

      // Create streaming response
      const streamGenerator = generateCSVStream(dataGenerator(), columns, {
        format: "csv",
        includeHeaders: true
      });
      
      const readableStream = createReadableStream(streamGenerator);

      return new Response(readableStream, {
        status: 200,
        headers: {
          "Content-Type": getContentType("csv"),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      });
    }

    // For Excel or small CSV, use buffer-based approach (existing logic continues...)
    let buffer: Buffer;
    let contentType: string;

    if (format === "xlsx") {
      // Use chunked generation for large datasets (>10K rows)
      buffer = rowCount > STREAMING_THRESHOLD
        ? generateExcelChunked(data, columns, { format: "xlsx" })
        : generateExcel(data, columns, { format: "xlsx" });
      contentType = getContentType("xlsx");
    } else {
      buffer = generateCSVBuffer(data, columns, { format: "csv" });
      contentType = getContentType("csv");
    }

    // Return file download
    // Convert Buffer to Uint8Array (valid BlobPart), then to Blob (valid BodyInit)
    const uint8Array = new Uint8Array(buffer);
    const blob = new Blob([uint8Array], { type: contentType });
    
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (error) {
    console.error("Export error:", error);

    return errorResponse(
      "INTERNAL_ERROR",
      "Failed to generate export",
      500
    );
  }
});

// GET /export/:entityType/columns - List available columns
exportRoutes.get("/:entityType/columns", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  const entityType = c.req.param("entityType") as EntityType;

  // Validate entity type
  if (entityType !== "items" && entityType !== "prices") {
    return errorResponse(
      "INVALID_REQUEST",
      `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`,
      400
    );
  }

  const allColumns =
    entityType === "items" ? ITEM_EXPORT_COLUMNS : PRICE_EXPORT_COLUMNS;
  const defaults = entityType === "items" ? DEFAULT_ITEM_COLUMNS : DEFAULT_PRICE_COLUMNS;

  return c.json({
    success: true,
    data: {
      entityType,
      columns: allColumns.map((col) => ({
        key: col.key,
        header: col.header,
        fieldType: col.fieldType || "string"
      })),
      defaultColumns: defaults
    }
  });
});

export { exportRoutes };