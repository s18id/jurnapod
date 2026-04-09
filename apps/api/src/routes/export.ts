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
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse } from "../lib/response.js";
import {
  generateCSVBuffer,
  generateExcel,
  generateExcelChunked,
  generateCSVStream,
  createReadableStream,
  getContentType,
  getFileExtension,
  buildExportQuery,
  executeExportQuery,
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
  const { sql, values } = buildExportQuery("items", {
    company_id: companyId,
    search: params.search,
    is_active: params.status,
    type: params.type,
    group_id: params.groupId
  }, { format: params.format, columns: params.columns.length > 0 ? params.columns : undefined });

  const rows = await executeExportQuery(sql, values);

  return rows.map((row: Record<string, unknown>) => ({
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
  const { sql, values } = buildExportQuery("item_prices", {
    company_id: companyId,
    outlet_id: params.outletId,
    search: params.search,
    is_active: params.status,
    scope_filter: params.scopeFilter,
    date_from: params.dateFrom,
    date_to: params.dateTo
  }, { format: params.format, columns: params.columns.length > 0 ? params.columns : undefined });

  const rows = await executeExportQuery(sql, values);

  return rows.map((row: Record<string, unknown>) => ({
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

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Export columns response schema
 */
const ExportColumnsResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(true),
  data: zodOpenApi.object({
    entityType: zodOpenApi.string(),
    columns: zodOpenApi.array(zodOpenApi.object({
      key: zodOpenApi.string(),
      header: zodOpenApi.string(),
      fieldType: zodOpenApi.string(),
    })),
    defaultColumns: zodOpenApi.array(zodOpenApi.string()),
  }),
}).openapi("ExportColumnsResponse");

/**
 * Registers export routes with an OpenAPIHono instance.
 */
export function registerExportRoutes(app: OpenAPIHono): void {
  // POST /export/:entityType - Export items or prices
  app.openapi(
    createRoute({
      method: "post",
      path: "/export/{entityType}",
      operationId: "exportData",
      summary: "Export data",
      description: "Export items or prices to CSV or Excel format.",
      tags: ["Export"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          entityType: zodOpenApi.string().openapi({ description: "Entity type: items or prices" }),
        }),
      },
      responses: {
        200: {
          description: "Exported data file",
          content: {
            "application/json": {
              schema: zodOpenApi.any().openapi("ExportResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "inventory", permission: "read" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      try {
        const url = new URL(c.req.raw.url);
        const entityType = c.req.param("entityType") as EntityType;

        if (entityType !== "items" && entityType !== "prices") {
          return errorResponse("INVALID_REQUEST", `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`, 400);
        }

        const params = parseExportParams(url);
        const columns = getColumnsForEntity(entityType, params.columns);

        if (columns.length === 0) {
          return errorResponse("INVALID_REQUEST", "No valid columns selected for export", 400);
        }

        const data = entityType === "items"
          ? await fetchItemsForExport(auth.companyId, params)
          : await fetchPricesForExport(auth.companyId, params);

        const format = params.format;
        const rowCount = data.length;
        const filename = generateFilename(entityType, format);

        if (format === "xlsx" && rowCount > EXCEL_MAX_ROWS) {
          return errorResponse("INVALID_REQUEST", `Excel export is limited to ${EXCEL_MAX_ROWS.toLocaleString()} rows.`, 400);
        }

        if (format === "csv" && shouldUseStreaming(rowCount)) {
          async function* dataGenerator() {
            for (const row of data) { yield row; }
          }

          const streamGenerator = generateCSVStream(dataGenerator(), columns, { format: "csv", includeHeaders: true });
          const readableStream = createReadableStream(streamGenerator);

          return new Response(readableStream, {
            status: 200,
            headers: {
              "Content-Type": getContentType("csv"),
              "Content-Disposition": `attachment; filename="${filename}"`,
            },
          });
        }

        let buffer: Buffer;
        let contentType: string;

        if (format === "xlsx") {
          buffer = rowCount > STREAMING_THRESHOLD
            ? generateExcelChunked(data, columns, { format: "xlsx" })
            : generateExcel(data, columns, { format: "xlsx" });
          contentType = getContentType("xlsx");
        } else {
          buffer = generateCSVBuffer(data, columns, { format: "csv" });
          contentType = getContentType("csv");
        }

        const uint8Array = new Uint8Array(buffer);
        const blob = new Blob([uint8Array], { type: contentType });

        return new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(buffer.length),
          },
        });
      } catch (error) {
        console.error("Export error:", error);
        return errorResponse("INTERNAL_ERROR", "Failed to generate export", 500);
      }
    }
  );

  // GET /export/:entityType/columns - List available columns
  app.openapi(
    createRoute({
      method: "get",
      path: "/export/{entityType}/columns",
      operationId: "getExportColumns",
      summary: "Get export columns",
      description: "List available columns for export.",
      tags: ["Export"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          entityType: zodOpenApi.string().openapi({ description: "Entity type: items or prices" }),
        }),
      },
      responses: {
        200: {
          description: "Export columns",
          content: {
            "application/json": {
              schema: ExportColumnsResponseSchema,
            },
          },
        },
        400: { description: "Invalid entity type" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "inventory", permission: "read" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const entityType = c.req.param("entityType") as EntityType;

      if (entityType !== "items" && entityType !== "prices") {
        return errorResponse("INVALID_REQUEST", `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`, 400);
      }

      const allColumns = entityType === "items" ? ITEM_EXPORT_COLUMNS : PRICE_EXPORT_COLUMNS;
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
        },
      });
    }
  );
}