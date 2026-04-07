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
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  parseCSVSync,
  parseExcelSync,
  type ImportRow,
  type FieldType,
  type ImportParseResult,
  batchValidateForeignKeys,
} from "../lib/import/index.js";
import {
  checkSkuExists,
  checkItemExistsBySku,
} from "../lib/import/validation.js";
import {
  batchFindItemsBySkus,
  batchFindPricesByItemIds,
  batchUpdateItems,
  batchInsertItems,
  batchUpdatePrices,
  batchInsertPrices,
  type BatchItemInsert,
  type BatchItemUpdate,
  type BatchPriceInsert,
  type BatchPriceUpdate,
} from "../lib/import/batch-operations.js";
import {
  createSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
  updateCheckpoint,
  clearCheckpoint,
  updateFileHash,
  computeFileHash,
  type CheckpointData,
  SESSION_TTL_MS,
} from "../lib/import/session-store.js";
import { randomUUID } from "node:crypto";

// Clean up expired sessions at startup (non-fatal if DB not yet ready)
cleanupExpiredSessions().catch(() => {/* non-fatal at startup */});

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Session Configuration Constants
// =============================================================================

/**
 * Story 8.1: Minimum time remaining before session expiry warning (60 seconds)
 * If session expires within this window, reject resume to prevent mid-operation expiry
 */
const SESSION_EXPIRY_WARNING_THRESHOLD_MS = 60_000;

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
// Validation Functions (TD-012: Batch FK Validation)
// =============================================================================

import type { FkLookupResults } from "../lib/import/index.js";

/**
 * Collects FK IDs from item rows for batch validation.
 * Used to prefetch all FK references before row-level validation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _collectItemRowFkIds(
  rows: Array<{ rowNumber: number; mappedData: Record<string, unknown> }>
): Map<number, number> {
  // Map rowNumber -> item_group_id for FK validation
  const itemGroupIds = new Map<number, number>();
  
  for (const { rowNumber, mappedData } of rows) {
    if (mappedData.item_group_id) {
      const groupId = parseInt(String(mappedData.item_group_id), 10);
      if (!isNaN(groupId)) {
        itemGroupIds.set(rowNumber, groupId);
      }
    }
  }
  
  return itemGroupIds;
}

/**
 * Collects FK IDs from price rows for batch validation.
 * Used to prefetch all FK references before row-level validation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _collectPriceRowFkIds(
  rows: Array<{ rowNumber: number; mappedData: Record<string, unknown> }>
): Map<number, number> {
  // Map rowNumber -> outlet_id for FK validation
  const outletIds = new Map<number, number>();
  
  for (const { rowNumber, mappedData } of rows) {
    if (mappedData.outlet_id) {
      const id = parseInt(String(mappedData.outlet_id), 10);
      if (!isNaN(id)) {
        outletIds.set(rowNumber, id);
      }
    }
  }
  
  return outletIds;
}

/**
 * Validates item row fields (non-FK) and checks FK results from batch query.
 * 
 * @param row - The mapped row data
 * @param fkResults - Pre-fetched FK validation results from batchValidateForeignKeys
 * @returns Array of validation errors
 */
function validateItemRowWithFkCache(
  row: Record<string, unknown>,
  fkResults: FkLookupResults
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate item_type (enum check)
  if (row.item_type) {
    const validTypes = ["INVENTORY", "NON_INVENTORY", "SERVICE", "RAW_MATERIAL"];
    if (!validTypes.includes(String(row.item_type))) {
      errors.push({ field: "item_type", message: `Invalid item type '${row.item_type}'. Must be one of: ${validTypes.join(", ")}` });
    }
  }

  // Validate item_group_id using pre-fetched FK results (O(1) lookup)
  if (row.item_group_id) {
    const groupId = parseInt(String(row.item_group_id), 10);
    if (!isNaN(groupId)) {
      // O(1) lookup from batch query results
      const exists = fkResults.get('item_groups')?.get(groupId);
      if (exists === false) {
        errors.push({ field: "item_group_id", message: `Item group with ID '${row.item_group_id}' does not exist` });
      }
    }
  }

  return errors;
}

/**
 * Validates price row fields (non-FK) and checks FK results from batch query.
 * 
 * @param row - The mapped row data
 * @param fkResults - Pre-fetched FK validation results from batchValidateForeignKeys
 * @returns Array of validation errors
 */
function validatePriceRowWithFkCache(
  row: Record<string, unknown>,
  fkResults: FkLookupResults
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate outlet_id using pre-fetched FK results (O(1) lookup)
  if (row.outlet_id) {
    const outletId = parseInt(String(row.outlet_id), 10);
    if (!isNaN(outletId)) {
      // O(1) lookup from batch query results
      const exists = fkResults.get('outlets')?.get(outletId);
      if (exists === false) {
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

/**
 * Validates item rows with SKU uniqueness check.
 * SKU uniqueness must still be checked per-row as it depends on existing data.
 * 
 * @param row - The mapped row data
 * @param companyId - Company ID for SKU uniqueness check
 * @param fkResults - Pre-fetched FK validation results from batchValidateForeignKeys
 * @returns Array of validation errors
 */
async function validateItemRow(
  row: Record<string, unknown>,
  companyId: number,
  fkResults: FkLookupResults
): Promise<Array<{ field: string; message: string }>> {
  const errors: Array<{ field: string; message: string }> = [];

  // Check SKU uniqueness within company (requires per-row DB query)
  if (row.sku) {
    const skuCheck = await checkSkuExists(companyId, String(row.sku));
    if (skuCheck.exists) {
      errors.push({ field: "sku", message: `SKU '${row.sku}' already exists` });
    }
  }

  // Validate non-FK fields and check FK results from cache
  errors.push(...validateItemRowWithFkCache(row, fkResults));

  return errors;
}

/**
 * Validates price rows with item_sku existence check.
 * Item existence by SKU must still be checked per-row as it depends on existing data.
 * 
 * @param row - The mapped row data
 * @param companyId - Company ID for item existence check
 * @param fkResults - Pre-fetched FK validation results from batchValidateForeignKeys
 * @returns Array of validation errors
 */
async function validatePriceRow(
  row: Record<string, unknown>,
  companyId: number,
  fkResults: FkLookupResults
): Promise<Array<{ field: string; message: string }>> {
  const errors: Array<{ field: string; message: string }> = [];

  // Check item exists by SKU (requires per-row DB query)
  if (row.item_sku) {
    const itemCheck = await checkItemExistsBySku(companyId, String(row.item_sku));
    if (!itemCheck.exists) {
      errors.push({ field: "item_sku", message: `Item with SKU '${row.item_sku}' does not exist` });
    }
  }

  // Validate non-FK fields and check FK results from cache
  errors.push(...validatePriceRowWithFkCache(row, fkResults));

  return errors;
}

// =============================================================================
// Apply Functions
// =============================================================================

const BATCH_SIZE = 500;

interface ApplyResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; error: string }>;
  batchesCompleted: number;
  batchesFailed: number;
  rowsProcessed: number;
  /** Batch index (0-based) where failure occurred, if any */
  failedAtBatch?: number;
  /** Whether the import can be resumed */
  canResume: boolean;
}

interface ApplyOptions {
  /** 0-based batch index to start from (for resume). Default: 0 */
  startBatch?: number;
  /** Called after each batch commits — use to persist checkpoint */
  onBatchCommit?: (batchNumber: number, rowsCommitted: number) => Promise<void>;
}

async function applyItemImport(
  rows: Array<Record<string, unknown>>,
  companyId: number,
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  const { startBatch = 0, onBatchCommit } = options;
  const result: ApplyResult = {
    created: 0,
    updated: 0,
    errors: [],
    batchesCompleted: 0,
    batchesFailed: 0,
    rowsProcessed: 0,
    canResume: false, // Will be set based on failure status
  };

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    // Skip already-committed batches (resume support)
    if (batchIndex < startBatch) {
      continue;
    }

    const batchStart = batchIndex * BATCH_SIZE;
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      // Batch existence check — O(1) lookup with Map
      const skus = batch.map(r => String(r.sku || "")).filter(s => s.length > 0);
      const skuToIdMap = await batchFindItemsBySkus(companyId, skus);

      // Prepare batch update/insert arrays
      const updates: BatchItemUpdate[] = [];
      const inserts: BatchItemInsert[] = [];

      // Process each row in the batch
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const rowIndex = batchStart + i;
        const sku = String(row.sku || "");

        if (!sku) {
          result.errors.push({ row: rowIndex + 1, error: "SKU is required" });
          continue;
        }

        const existingId = skuToIdMap.get(sku);
        const groupId = row.item_group_id ? parseInt(String(row.item_group_id), 10) || null : null;
        const cogsAccountId = row.cogs_account_id ? parseInt(String(row.cogs_account_id), 10) || null : null;
        const invAccountId = row.inventory_asset_account_id ? parseInt(String(row.inventory_asset_account_id), 10) || null : null;
        const isActive = row.is_active !== false;

        try {
          if (existingId !== undefined) {
            updates.push({
              id: existingId,
              name: String(row.name || ""),
              item_type: String(row.item_type || ""),
              barcode: row.barcode ? String(row.barcode) : null,
              item_group_id: groupId,
              cogs_account_id: cogsAccountId,
              inventory_asset_account_id: invAccountId,
              is_active: isActive,
            });
            result.updated++;
          } else {
            inserts.push({
              sku,
              name: String(row.name || ""),
              item_type: String(row.item_type || ""),
              barcode: row.barcode ? String(row.barcode) : null,
              item_group_id: groupId,
              cogs_account_id: cogsAccountId,
              inventory_asset_account_id: invAccountId,
              is_active: isActive,
            });
            result.created++;
          }
        } catch (error) {
          result.errors.push({ row: rowIndex + 1, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // Execute batch operations
      if (updates.length > 0) {
        await batchUpdateItems(updates);
      }
      if (inserts.length > 0) {
        await batchInsertItems(companyId, inserts);
      }

      result.batchesCompleted++;
      result.rowsProcessed += batch.length;
      await onBatchCommit?.(batchIndex, result.rowsProcessed);
    } catch (error) {
      result.batchesFailed++;
      result.failedAtBatch = batchIndex;
      result.canResume = true; // Can resume from this batch
      result.errors.push({
        row: batchStart + 1,
        error: `Batch ${batchIndex + 1} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  // Set canResume based on whether there were failures
  if (result.batchesFailed === 0) {
    result.canResume = false;
  }

  return result;
}

async function applyPriceImport(
  rows: Array<Record<string, unknown>>,
  companyId: number,
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  const { startBatch = 0, onBatchCommit } = options;
  const result: ApplyResult = {
    created: 0,
    updated: 0,
    errors: [],
    batchesCompleted: 0,
    batchesFailed: 0,
    rowsProcessed: 0,
    canResume: false, // Will be set based on failure status
  };

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    // Skip already-committed batches (resume support)
    if (batchIndex < startBatch) {
      continue;
    }

    const batchStart = batchIndex * BATCH_SIZE;
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      // Batch item lookup — O(1) lookup with Map
      const itemSkus = batch.map(r => String(r.item_sku || "")).filter(s => s.length > 0);
      const skuToItemIdMap = await batchFindItemsBySkus(companyId, itemSkus);

      // Batch existing prices lookup
      const itemIds = [...skuToItemIdMap.values()];
      const existingPricesMap = await batchFindPricesByItemIds(companyId, itemIds);

      // Prepare batch update/insert arrays
      const updates: BatchPriceUpdate[] = [];
      const inserts: BatchPriceInsert[] = [];

      // Process each row in the batch
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
        const isActive = row.is_active !== false;
        const existingPriceId = existingPricesMap.get(`${itemId}:${outletId ?? "null"}`);

        try {
          if (existingPriceId !== undefined) {
            updates.push({
              id: existingPriceId,
              price,
              is_active: isActive,
            });
            result.updated++;
          } else {
            inserts.push({
              item_id: itemId,
              outlet_id: outletId,
              price,
              is_active: isActive,
            });
            result.created++;
          }
        } catch (error) {
          result.errors.push({ row: rowIndex + 1, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // Execute batch operations
      if (updates.length > 0) {
        await batchUpdatePrices(updates);
      }
      if (inserts.length > 0) {
        await batchInsertPrices(companyId, inserts);
      }

      result.batchesCompleted++;
      result.rowsProcessed += batch.length;
      await onBatchCommit?.(batchIndex, result.rowsProcessed);
    } catch (error) {
      result.batchesFailed++;
      result.failedAtBatch = batchIndex;
      result.canResume = true; // Can resume from this batch
      result.errors.push({
        row: batchStart + 1,
        error: `Batch ${batchIndex + 1} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  // Set canResume based on whether there were failures
  if (result.batchesFailed === 0) {
    result.canResume = false;
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

    // Compute file hash for resume integrity check (Story 8.1 AC3)
    const fileHash = computeFileHash(buffer);

    // Persist session to database
    await createSession(sessionId, auth.companyId, entityType, {
      entityType,
      filename: file.name,
      rowCount: parseResult.rows.length,
      columns,
      sampleData,
      rows: parseResult.rows,
    });

    // Store file hash for resume integrity verification
    await updateFileHash(sessionId, auth.companyId, fileHash);

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

    // Get upload session (company isolation enforced in query)
    const stored = await getSession(uploadId, auth.companyId);
    if (!stored) {
      return errorResponse("NOT_FOUND", "Upload session not found or expired", 404);
    }

    const session = stored.payload as unknown as UploadSession;

    // Validate mappings
    const mappingValidation = validateMappings(entityType, mappings, session.columns);
    if (!mappingValidation.valid) {
      return errorResponse("INVALID_REQUEST", mappingValidation.errors.join("; "), 400);
    }

    // Map and validate rows
    // TD-012: Use batch FK validation to avoid N+1 queries
    const fieldDefs = getFieldDefinitions(entityType);
    const validationErrors: Array<{ row: number; column: string; message: string; value: string }> = [];
    const validRowIndices: number[] = [];
    const errorRowIndices: number[] = [];

    // Phase 1: Map all rows and collect FK IDs for batch validation
    const mappedRows: Array<{ row: typeof session.rows[0]; mappedData: Record<string, unknown> }> = [];
    const itemGroupIds = new Set<number>();
    const outletIds = new Set<number>();

    for (const row of session.rows) {
      const mappedData = mapRowData(row, mappings, fieldDefs);
      mappedRows.push({ row, mappedData });

      // Collect FK IDs for batch validation
      if (entityType === "items" && mappedData.item_group_id) {
        const groupId = parseInt(String(mappedData.item_group_id), 10);
        if (!isNaN(groupId)) {
          itemGroupIds.add(groupId);
        }
      } else if (entityType === "prices" && mappedData.outlet_id) {
        const id = parseInt(String(mappedData.outlet_id), 10);
        if (!isNaN(id)) {
          outletIds.add(id);
        }
      }
    }

    // Phase 2: Batch-validate all FK references (single query per table)
    const fkRequests: Array<{ table: string; ids: Set<number>; companyId: number }> = [];
    if (entityType === "items" && itemGroupIds.size > 0) {
      fkRequests.push({ table: 'item_groups', ids: itemGroupIds, companyId: auth.companyId });
    } else if (entityType === "prices" && outletIds.size > 0) {
      fkRequests.push({ table: 'outlets', ids: outletIds, companyId: auth.companyId });
    }

    const fkResults = fkRequests.length > 0
      ? await batchValidateForeignKeys(fkRequests)
      : new Map<string, Map<number, boolean>>();

    // Phase 3: Validate rows using cached FK results
    for (const { row, mappedData } of mappedRows) {
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

      // Entity-specific validation with FK cache
      const entityErrors = entityType === "items"
        ? await validateItemRow(mappedData, auth.companyId, fkResults)
        : await validatePriceRow(mappedData, auth.companyId, fkResults);

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

    // Get upload session (company isolation enforced in query)
    const stored = await getSession(uploadId, auth.companyId);
    if (!stored) {
      return errorResponse("NOT_FOUND", "Upload session not found or expired", 404);
    }

    // TD-028: Expiry guard — reject if session expires within threshold
    const expiresInMs = stored.expiresAt.getTime() - Date.now();
    if (expiresInMs < SESSION_EXPIRY_WARNING_THRESHOLD_MS) {
      return errorResponse(
        "SESSION_EXPIRED",
        "Upload session is expiring imminently. Please re-upload and try again.",
        410
      );
    }

    const session = stored.payload as unknown as UploadSession;

    // Story 8.1 AC3: Verify file hash for resume validation
    // If client provides a new file hash, verify it matches the stored hash
    const clientFileHash = body.fileHash as string | undefined;
    if (clientFileHash && stored.fileHash) {
      if (clientFileHash !== stored.fileHash) {
        return errorResponse(
          "FILE_HASH_MISMATCH",
          "File has been modified since upload. Please upload the original file again.",
          409
        );
      }
    }

    // Story 8.1 AC2: Resume from checkpoint if a previous apply partially succeeded
    let startBatch = 0;
    let isResuming = false;

    if (stored.checkpointData) {
      // Check if checkpoint is within TTL window
      const checkpointTime = new Date(stored.checkpointData.timestamp).getTime();
      const now = Date.now();

      if (now - checkpointTime <= SESSION_TTL_MS) {
        startBatch = stored.checkpointData.lastSuccessfulBatchNumber + 1;
        isResuming = true;
        console.info(`[import] Resuming session ${uploadId} from batch ${startBatch} (checkpoint: ${JSON.stringify(stored.checkpointData)})`);
      } else {
        console.info(`[import] Session ${uploadId} checkpoint expired (checkpoint: ${stored.checkpointData.timestamp}, TTL: 30min)`);
        // Checkpoint expired, start fresh
        await clearCheckpoint(uploadId, auth.companyId);
      }
    }

    // Map all rows
    const fieldDefs = getFieldDefinitions(entityType);
    const mappedRows = session.rows.map(row => mapRowData(row, mappings, fieldDefs));

    // Apply import — per-batch transactions with checkpoint persistence
    const applyFn = entityType === "items" ? applyItemImport : applyPriceImport;
    const result = await applyFn(mappedRows, auth.companyId, {
      startBatch,
      onBatchCommit: async (batchIndex: number, rowsCommitted: number) => {
        // Story 8.1 AC1: Persist checkpoint after each successful batch
        const checkpoint: CheckpointData = {
          lastSuccessfulBatchNumber: batchIndex,
          rowsCommitted,
          timestamp: new Date().toISOString(),
        };
        await updateCheckpoint(uploadId, auth.companyId, checkpoint);
        console.info(`[import] Checkpoint saved: batch ${batchIndex}, rows ${rowsCommitted}`);
      },
    });

    // Only delete session and clear checkpoint when all batches completed without failure
    if (result.batchesFailed === 0) {
      await clearCheckpoint(uploadId, auth.companyId);
      await deleteSession(uploadId, auth.companyId);
    }

    // Story 8.1 AC4: Return structured error with partial failure info
    return successResponse({
      success: result.created + result.updated,
      failed: result.errors.length,
      created: result.created,
      updated: result.updated,
      batchesCompleted: result.batchesCompleted,
      batchesFailed: result.batchesFailed,
      rowsProcessed: result.rowsProcessed,
      // AC4: Structured partial failure response
      failedAtBatch: result.failedAtBatch,
      rowsCommitted: result.rowsProcessed,
      canResume: result.canResume,
      // Resume info
      resumed: isResuming,
      skippedBatches: startBatch,
      skippedRows: startBatch * BATCH_SIZE,
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
