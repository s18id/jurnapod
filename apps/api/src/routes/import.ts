// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Routes
 *
 * Routes for importing data:
 * - POST /import/:entityType/upload - Upload and parse import file
 * - POST /import/:entityType/validate - Validate mapped data
 * - POST /import/:entityType/apply - Apply validated import
 * - GET /import/:entityType/template - Download import template
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT, or CASHIER (write operations)
 */

import { Hono } from "hono";
import type { RowDataPacket } from "mysql2";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { getDbPool } from "../lib/db.js";
import {
  parseCSVSync,
  parseExcelSync,
  type ImportRow,
  type FieldType,
  type ImportParseResult,
} from "../lib/import/index.js";
import { randomUUID } from "node:crypto";

// In-memory storage for upload sessions (TODO: move to Redis/database)
// WARNING: This will not work in multi-instance/production deployments
// All instances share memory but not sessions - users may hit different instances
const uploadSessions = new Map<string, UploadSession>();

// Session cleanup interval (30 minutes)
const SESSION_CLEANUP_INTERVAL = 30 * 60 * 1000;

// Warning threshold for session count
const SESSION_COUNT_WARNING_THRESHOLD = 1000;

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of uploadSessions.entries()) {
    if (now - session.createdAt.getTime() > SESSION_CLEANUP_INTERVAL) {
      uploadSessions.delete(sessionId);
    }
  }
}, SESSION_CLEANUP_INTERVAL);

// Warn if too many active sessions (memory leak indicator)
function checkSessionCount() {
  if (uploadSessions.size > SESSION_COUNT_WARNING_THRESHOLD) {
    console.warn(
      `[IMPORT WARNING] High session count: ${uploadSessions.size} active sessions. ` +
      `This may indicate a memory leak. Consider switching to Redis/database session storage.`
    );
  }
}

// Check session count every 5 minutes
setInterval(checkSessionCount, 5 * 60 * 1000);

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Types
// =============================================================================

type EntityType = "items" | "prices";

interface UploadSession {
  id: string;
  companyId: number;
  entityType: EntityType;
  filename: string;
  rowCount: number;
  columns: string[];
  sampleData: string[][];
  rows: ImportRow[];
  createdAt: Date;
}

interface ColumnMappingRequest {
  mappings: Array<{
    sourceColumn: string;
    targetField: string;
  }>;
}

// =============================================================================
// Field Definitions
// =============================================================================

const ITEM_IMPORT_FIELDS: Record<string, { type: FieldType; required: boolean }> = {
  sku: { type: "string", required: true },
  name: { type: "string", required: true },
  item_type: { type: "string", required: true },
  barcode: { type: "string", required: false },
  item_group_id: { type: "integer", required: false },
  cogs_account_id: { type: "integer", required: false },
  inventory_asset_account_id: { type: "integer", required: false },
  is_active: { type: "boolean", required: false },
};

const PRICE_IMPORT_FIELDS: Record<string, { type: FieldType; required: boolean }> = {
  item_sku: { type: "string", required: true },
  item_name: { type: "string", required: false },
  outlet_id: { type: "integer", required: false },
  price: { type: "number", required: true },
  is_active: { type: "boolean", required: false },
};

// =============================================================================
// Helper Functions
// =============================================================================

function getFieldDefinitions(entityType: EntityType) {
  return entityType === "items" ? ITEM_IMPORT_FIELDS : PRICE_IMPORT_FIELDS;
}

function parseFileSync(buffer: Buffer, filename: string): ImportParseResult {
  const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls');
  
  if (isExcel) {
    return parseExcelSync(buffer);
  }
  
  return parseCSVSync(buffer);
}

function validateMappings(
  entityType: EntityType,
  mappings: ColumnMappingRequest["mappings"],
  availableColumns: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const fieldDefs = getFieldDefinitions(entityType);
  const mappedFields = new Set<string>();

  for (const mapping of mappings) {
    // Check if source column exists
    if (!availableColumns.includes(mapping.sourceColumn)) {
      errors.push(`Source column '${mapping.sourceColumn}' does not exist in file`);
      continue;
    }

    // Check if target field is valid
    if (!fieldDefs[mapping.targetField]) {
      errors.push(`Target field '${mapping.targetField}' is not valid for ${entityType}`);
      continue;
    }

    mappedFields.add(mapping.targetField);
  }

  // Check required fields
  for (const [field, def] of Object.entries(fieldDefs)) {
    if (def.required && !mappedFields.has(field)) {
      errors.push(`Required field '${field}' is not mapped`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Maximum length for string fields
const MAX_STRING_LENGTH = 255;

// Control characters that should be rejected
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * Sanitize a string value for import
 * - Trims whitespace
 * - Enforces max length
 * - Rejects control characters
 */
function sanitizeString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const str = String(value).trim();

  if (str.length === 0) {
    return undefined;
  }

  // Check for control characters
  if (CONTROL_CHAR_REGEX.test(str)) {
    throw new Error("String contains invalid control characters");
  }

  // Enforce max length
  if (str.length > MAX_STRING_LENGTH) {
    return str.slice(0, MAX_STRING_LENGTH);
  }

  return str;
}

function mapRowData(
  row: ImportRow,
  mappings: ColumnMappingRequest["mappings"],
  fieldDefs: Record<string, { type: FieldType; required: boolean }>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const rawValue = row.data[mapping.sourceColumn];
    const fieldDef = fieldDefs[mapping.targetField];

    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (fieldDef?.required) {
        result[mapping.targetField] = undefined; // Will be caught by validation
      }
      continue;
    }

    // Type conversion with sanitization
    switch (fieldDef?.type) {
      case "integer":
        {
          const strValue = sanitizeString(rawValue);
          if (strValue !== undefined) {
            result[mapping.targetField] = parseInt(strValue, 10);
          }
        }
        break;
      case "number":
        {
          const strValue = sanitizeString(rawValue);
          if (strValue !== undefined) {
            result[mapping.targetField] = parseFloat(strValue);
          }
        }
        break;
      case "boolean":
        {
          const strValue = sanitizeString(rawValue);
          if (strValue !== undefined) {
            result[mapping.targetField] = ["true", "1", "yes", "y"].includes(strValue.toLowerCase());
          }
        }
        break;
      default:
        result[mapping.targetField] = sanitizeString(rawValue);
    }
  }

  return result;
}

// =============================================================================
// Validation Functions
// =============================================================================

async function validateItemRow(
  row: Record<string, unknown>,
  companyId: number,
  pool: ReturnType<typeof getDbPool>
): Promise<Array<{ field: string; message: string }>> {
  const errors: Array<{ field: string; message: string }> = [];

  // Check SKU uniqueness within company
  if (row.sku) {
    const [existing] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM items WHERE company_id = ? AND sku = ? LIMIT 1",
      [companyId, row.sku]
    );
    if (existing.length > 0) {
      errors.push({ field: "sku", message: `SKU '${row.sku}' already exists` });
    }
  }

  // Validate item_type
  if (row.item_type) {
    const validTypes = ["INVENTORY", "NON_INVENTORY", "SERVICE", "RAW_MATERIAL"];
    if (!validTypes.includes(String(row.item_type))) {
      errors.push({ field: "item_type", message: `Invalid item type '${row.item_type}'. Must be one of: ${validTypes.join(", ")}` });
    }
  }

  // Validate item_group_id if provided
  if (row.item_group_id) {
    const groupId = parseInt(String(row.item_group_id), 10);
    if (!isNaN(groupId)) {
      const [existing] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM item_groups WHERE company_id = ? AND id = ? LIMIT 1",
        [companyId, groupId]
      );
      if (existing.length === 0) {
        errors.push({ field: "item_group_id", message: `Item group with ID '${row.item_group_id}' does not exist` });
      }
    }
  }

  return errors;
}

async function validatePriceRow(
  row: Record<string, unknown>,
  companyId: number,
  pool: ReturnType<typeof getDbPool>
): Promise<Array<{ field: string; message: string }>> {
  const errors: Array<{ field: string; message: string }> = [];

  // Check item exists by SKU
  if (row.item_sku) {
    const [items] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM items WHERE company_id = ? AND sku = ? LIMIT 1",
      [companyId, row.item_sku]
    );
    if (items.length === 0) {
      errors.push({ field: "item_sku", message: `Item with SKU '${row.item_sku}' does not exist` });
    }
  }

  // Validate outlet_id if provided
  if (row.outlet_id) {
    const outletId = parseInt(String(row.outlet_id), 10);
    if (!isNaN(outletId)) {
      const [outlets] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM outlets WHERE company_id = ? AND id = ? LIMIT 1",
        [companyId, outletId]
      );
      if (outlets.length === 0) {
        errors.push({ field: "outlet_id", message: `Outlet with ID '${row.outlet_id}' does not exist` });
      }
    }
  }

  // Validate price is positive
  if (row.price !== undefined && row.price !== null) {
    const price = parseFloat(String(row.price));
    if (isNaN(price) || price < 0) {
      errors.push({ field: "price", message: `Price must be a non-negative number` });
    }
  }

  return errors;
}

// =============================================================================
// Apply Functions
// =============================================================================

const BATCH_SIZE = 500;

async function applyItemImport(
  rows: Array<Record<string, unknown>>,
  companyId: number,
  pool: ReturnType<typeof getDbPool>
): Promise<{ created: number; updated: number; errors: Array<{ row: number; error: string }> }> {
  const result = { created: 0, updated: 0, errors: [] as Array<{ row: number; error: string }> };
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Process in batches of 500
    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
      const batch = rows.slice(batchStart, batchEnd);

      // Batch existence check - O(1) lookup with Map
      const skus = batch.map(r => String(r.sku || "")).filter(s => s.length > 0);
      let skuToIdMap = new Map<string, number>();

      if (skus.length > 0) {
        const placeholders = skus.map(() => "?").join(",");
        const [existingItems] = await connection.execute<RowDataPacket[]>(
          `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
          [companyId, ...skus]
        );
        for (const item of existingItems) {
          skuToIdMap.set(String(item.sku), Number(item.id));
        }
      }

      // Process each row using the batch lookup
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const rowIndex = batchStart + i;
        const sku = String(row.sku || "");

        if (!sku) {
          result.errors.push({ row: rowIndex + 1, error: "SKU is required" });
          continue;
        }

        const existingId = skuToIdMap.get(sku);

        try {
          if (existingId !== undefined) {
            // Update existing item
            const groupId = row.item_group_id ? parseInt(String(row.item_group_id), 10) || null : null;
            const cogsAccountId = row.cogs_account_id ? parseInt(String(row.cogs_account_id), 10) || null : null;
            const invAccountId = row.inventory_asset_account_id ? parseInt(String(row.inventory_asset_account_id), 10) || null : null;
            const isActive = row.is_active !== false ? 1 : 0;

            await connection.execute(
              `UPDATE items SET
                name = ?, item_type = ?, barcode = ?, item_group_id = ?,
                cogs_account_id = ?, inventory_asset_account_id = ?, is_active = ?,
                updated_at = NOW()
              WHERE id = ?`,
              [
                String(row.name || ""),
                String(row.item_type || ""),
                row.barcode ? String(row.barcode) : null,
                groupId,
                cogsAccountId,
                invAccountId,
                isActive,
                existingId,
              ]
            );
            result.updated++;
          } else {
            // Create new item
            const groupId = row.item_group_id ? parseInt(String(row.item_group_id), 10) || null : null;
            const cogsAccountId = row.cogs_account_id ? parseInt(String(row.cogs_account_id), 10) || null : null;
            const invAccountId = row.inventory_asset_account_id ? parseInt(String(row.inventory_asset_account_id), 10) || null : null;
            const isActive = row.is_active !== false ? 1 : 0;

            await connection.execute(
              `INSERT INTO items (
                company_id, sku, name, item_type, barcode, item_group_id,
                cogs_account_id, inventory_asset_account_id, is_active, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                companyId,
                sku,
                String(row.name || ""),
                String(row.item_type || ""),
                row.barcode ? String(row.barcode) : null,
                groupId,
                cogsAccountId,
                invAccountId,
                isActive,
              ]
            );
            result.created++;
          }
        } catch (error) {
          result.errors.push({ row: rowIndex + 1, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    // Re-throw to signal transaction failure to caller
    throw error;
  } finally {
    connection.release();
  }

  return result;
}

async function applyPriceImport(
  rows: Array<Record<string, unknown>>,
  companyId: number,
  pool: ReturnType<typeof getDbPool>
): Promise<{ created: number; updated: number; errors: Array<{ row: number; error: string }> }> {
  const result = { created: 0, updated: 0, errors: [] as Array<{ row: number; error: string }> };
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Process in batches of 500
    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
      const batch = rows.slice(batchStart, batchEnd);

      // Batch item lookup - O(1) lookup with Map
      const itemSkus = batch.map(r => String(r.item_sku || "")).filter(s => s.length > 0);
      let skuToItemIdMap = new Map<string, number>();

      if (itemSkus.length > 0) {
        const placeholders = itemSkus.map(() => "?").join(",");
        const [items] = await connection.execute<RowDataPacket[]>(
          `SELECT sku, id FROM items WHERE company_id = ? AND sku IN (${placeholders})`,
          [companyId, ...itemSkus]
        );
        for (const item of items) {
          skuToItemIdMap.set(String(item.sku), Number(item.id));
        }
      }

      // Batch existing prices lookup - get all prices for items in this batch
      const itemIds = [...skuToItemIdMap.values()];
      let existingPricesMap = new Map<string, number>(); // key: "itemId:outletId" or "itemId:null"

      if (itemIds.length > 0) {
        const [existingPrices] = await connection.execute<RowDataPacket[]>(
          `SELECT item_id, outlet_id, id FROM item_prices WHERE company_id = ? AND item_id IN (${itemIds.map(() => "?").join(",")})`,
          [companyId, ...itemIds]
        );
        for (const price of existingPrices) {
          const key = `${price.item_id}:${price.outlet_id ?? "null"}`;
          existingPricesMap.set(key, Number(price.id));
        }
      }

      // Process each row using the batch lookups
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const rowIndex = batchStart + i;
        const itemSku = String(row.item_sku || "");

        if (!itemSku) {
          result.errors.push({ row: rowIndex + 1, error: "item_sku is required" });
          continue;
        }

        const itemId = skuToItemIdMap.get(itemSku);
        if (!itemId) {
          result.errors.push({ row: rowIndex + 1, error: `Item with SKU '${itemSku}' not found` });
          continue;
        }

        const outletId = row.outlet_id ? parseInt(String(row.outlet_id), 10) || null : null;
        const price = parseFloat(String(row.price));
        const isActive = row.is_active !== false ? 1 : 0;

        const priceKey = `${itemId}:${outletId ?? "null"}`;
        const existingPriceId = existingPricesMap.get(priceKey);

        try {
          if (existingPriceId !== undefined) {
            // Update existing price
            await connection.execute(
              `UPDATE item_prices SET price = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
              [price, isActive, existingPriceId]
            );
            result.updated++;
          } else {
            // Create new price
            await connection.execute(
              `INSERT INTO item_prices (item_id, company_id, outlet_id, price, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
              [itemId, companyId, outletId, price, isActive]
            );
            result.created++;
          }
        } catch (error) {
          result.errors.push({ row: rowIndex + 1, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    // Re-throw to signal transaction failure to caller
    throw error;
  } finally {
    connection.release();
  }

  return result;
}

// =============================================================================
// Route Handlers
// =============================================================================

const importRoutes = new Hono();

// Auth middleware
importRoutes.use("/*", async (c, next) => {
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

// POST /import/:entityType/upload - Upload and parse import file
importRoutes.post("/:entityType/upload", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const entityType = c.req.param("entityType") as EntityType;

    // Validate entity type
    if (entityType !== "items" && entityType !== "prices") {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`,
        400
      );
    }

    // Get file from form data
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return errorResponse("INVALID_REQUEST", "No file provided", 400);
    }

    // Check file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("FILE_TOO_LARGE", "File exceeds 50MB limit", 400);
    }

    // Check file type
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream"
    ];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith(".csv") && !file.name.toLowerCase().endsWith(".xlsx")) {
      return errorResponse("INVALID_FILE_TYPE", "File must be CSV or Excel (.xlsx)", 400);
    }

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse file
    const parseResult = parseFileSync(buffer, file.name);

    if (parseResult.errors.length > 0 && parseResult.rows.length === 0) {
      return errorResponse(
        "PARSE_ERROR",
        `Failed to parse file: ${parseResult.errors[0].message}`,
        400
      );
    }

    // Generate session ID
    const sessionId = randomUUID();

    // Get sample data (first 5 rows)
    const sampleData = parseResult.rows.slice(0, 5).map((row: ImportRow) => row.rawData);

    // Get columns from first row
    const columns = parseResult.rows.length > 0 ? Object.keys(parseResult.rows[0].data) : [];

    // Store session
    const session: UploadSession = {
      id: sessionId,
      companyId: auth.companyId,
      entityType,
      filename: file.name,
      rowCount: parseResult.rows.length,
      columns,
      sampleData,
      rows: parseResult.rows,
      createdAt: new Date(),
    };
    uploadSessions.set(sessionId, session);

    return successResponse({
      uploadId: sessionId,
      filename: file.name,
      rowCount: parseResult.rows.length,
      columns,
      sampleData,
      parseErrors: parseResult.errors.map(e => ({
        row: e.rowNumber,
        message: e.message,
      })),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to process upload", 500);
  }
});

// POST /import/:entityType/validate - Validate mapped data
importRoutes.post("/:entityType/validate", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const entityType = c.req.param("entityType") as EntityType;

    // Validate entity type
    if (entityType !== "items" && entityType !== "prices") {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`,
        400
      );
    }

    // Parse request body
    const body = await c.req.json();
    const { uploadId, mappings } = body as { uploadId: string; mappings: ColumnMappingRequest["mappings"] };

    if (!uploadId) {
      return errorResponse("INVALID_REQUEST", "Missing uploadId", 400);
    }

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      return errorResponse("INVALID_REQUEST", "Missing or invalid mappings", 400);
    }

    // Get upload session
    const session = uploadSessions.get(uploadId);
    if (!session) {
      return errorResponse("NOT_FOUND", "Upload session not found or expired", 404);
    }

    // Verify company ownership
    if (session.companyId !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Access denied", 403);
    }

    // Validate mappings
    const mappingValidation = validateMappings(entityType, mappings, session.columns);
    if (!mappingValidation.valid) {
      return errorResponse("INVALID_REQUEST", mappingValidation.errors.join("; "), 400);
    }

    // Map and validate rows
    const fieldDefs = getFieldDefinitions(entityType);
    const validationErrors: Array<{ row: number; column: string; message: string; value: string }> = [];
    const validRowIndices: number[] = [];
    const errorRowIndices: number[] = [];
    const pool = getDbPool();

    for (let i = 0; i < session.rows.length; i++) {
      const row = session.rows[i];
      const mappedData = mapRowData(row, mappings, fieldDefs);

      // Basic field validation
      let hasErrors = false;
      for (const [field, def] of Object.entries(fieldDefs)) {
        if (def.required && (mappedData[field] === undefined || mappedData[field] === null || mappedData[field] === "")) {
          validationErrors.push({
            row: row.rowNumber,
            column: field,
            message: `Required field '${field}' is missing`,
            value: "",
          });
          hasErrors = true;
        }
      }

      if (hasErrors) {
        errorRowIndices.push(row.rowNumber);
        continue;
      }

      // Entity-specific validation
      const entityErrors = entityType === "items"
        ? await validateItemRow(mappedData, auth.companyId, pool)
        : await validatePriceRow(mappedData, auth.companyId, pool);

      if (entityErrors.length > 0) {
        for (const err of entityErrors) {
          validationErrors.push({
            row: row.rowNumber,
            column: err.field,
            message: err.message,
            value: String(mappedData[err.field] || ""),
          });
        }
        errorRowIndices.push(row.rowNumber);
      } else {
        validRowIndices.push(row.rowNumber);
      }
    }

    return successResponse({
      totalRows: session.rowCount,
      validRows: validRowIndices.length,
      errorRows: errorRowIndices.length,
      errors: validationErrors,
      validRowIndices,
      errorRowIndices,
    });
  } catch (error) {
    console.error("Validation error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to validate data", 500);
  }
});

// POST /import/:entityType/apply - Apply validated import
importRoutes.post("/:entityType/apply", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    module: "inventory",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const entityType = c.req.param("entityType") as EntityType;

    // Validate entity type
    if (entityType !== "items" && entityType !== "prices") {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`,
        400
      );
    }

    // Parse request body
    const body = await c.req.json();
    const { uploadId, mappings } = body as { uploadId: string; mappings: ColumnMappingRequest["mappings"] };

    if (!uploadId) {
      return errorResponse("INVALID_REQUEST", "Missing uploadId", 400);
    }

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      return errorResponse("INVALID_REQUEST", "Missing or invalid mappings", 400);
    }

    // Get upload session
    const session = uploadSessions.get(uploadId);
    if (!session) {
      return errorResponse("NOT_FOUND", "Upload session not found or expired", 404);
    }

    // Verify company ownership
    if (session.companyId !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Access denied", 403);
    }

    // Map all rows
    const fieldDefs = getFieldDefinitions(entityType);
    const mappedRows = session.rows.map(row => mapRowData(row, mappings, fieldDefs));

    // Apply import
    const pool = getDbPool();
    const result = entityType === "items"
      ? await applyItemImport(mappedRows, auth.companyId, pool)
      : await applyPriceImport(mappedRows, auth.companyId, pool);

    // Clean up session
    uploadSessions.delete(uploadId);

    return successResponse({
      success: result.created + result.updated,
      failed: result.errors.length,
      created: result.created,
      updated: result.updated,
      skipped: 0,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Apply error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to apply import", 500);
  }
});

// GET /import/:entityType/template - Download import template
importRoutes.get("/:entityType/template", async (c) => {
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
    const entityType = c.req.param("entityType") as EntityType;

    // Validate entity type
    if (entityType !== "items" && entityType !== "prices") {
      return errorResponse(
        "INVALID_REQUEST",
        `Invalid entity type: ${entityType}. Must be 'items' or 'prices'.`,
        400
      );
    }

    const fieldDefs = getFieldDefinitions(entityType);
    const headers = Object.keys(fieldDefs);

    // Generate sample row
    const sampleRow: Record<string, string> = {};
    for (const [field, def] of Object.entries(fieldDefs)) {
      switch (def.type) {
        case "string":
          sampleRow[field] = def.required ? `sample_${field}` : "";
          break;
        case "integer":
        case "number":
          sampleRow[field] = def.required ? "1" : "";
          break;
        case "boolean":
          sampleRow[field] = "true";
          break;
        default:
          sampleRow[field] = "";
      }
    }

    // Generate CSV content
    const csvContent = [
      headers.join(","),
      headers.map(h => sampleRow[h] || "").join(","),
    ].join("\n");

    const filename = `jurnapod-${entityType}-template.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(Buffer.byteLength(csvContent)),
      },
    });
  } catch (error) {
    console.error("Template error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to generate template", 500);
  }
});

export { importRoutes };
