// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared Common Utilities
 * 
 * Common helper functions extracted from sub-modules (invoices, payments, orders, credit-notes).
 * These utilities are duplicated across sales sub-modules and are consolidated here
 * to maintain a single source of truth.
 */

import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db";
import {
  getNextDocumentNumber,
  NumberingConflictError,
  NumberingTemplateNotFoundError,
  type DocumentType
} from "@/lib/numbering";
export {
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./common-errors";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./common-errors";

// =============================================================================
// Types
// =============================================================================

/**
 * Common query executor interface used across sales services.
 * Abstracts the database connection's execute method.
 */
export type QueryExecutor = {
  execute: PoolConnection["execute"];
};

// =============================================================================
// Constants
// =============================================================================

export const MONEY_SCALE = 100;

// =============================================================================
// Money Helpers
// =============================================================================

/**
 * Normalize a monetary value to 2 decimal places using banker's rounding.
 * Uses Number.EPSILON to avoid floating point precision issues.
 */
export function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

/**
 * Sum multiple monetary values and normalize the result.
 */
export function sumMoney(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return normalizeMoney(total);
}

// =============================================================================
// Transaction Helper
// =============================================================================

/**
 * Execute a function within a database transaction.
 * Automatically commits on success, rolls back on error.
 * Always releases the connection back to the pool.
 */
export async function withTransaction<T>(
  operation: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// =============================================================================
// MySQL Error Helper
// =============================================================================

/**
 * Type guard to check if an error is a MySQL error with errno property.
 */
export function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

// MySQL duplicate entry error code
export const MYSQL_DUPLICATE_ERROR_CODE = 1062;

// =============================================================================
// Numbering Helpers
// =============================================================================

/**
 * Get next document number with proper error mapping.
 * Maps NumberingConflictError to DatabaseConflictError
 * and NumberingTemplateNotFoundError to DatabaseReferenceError.
 */
export async function getNumberWithConflictMapping(
  companyId: number,
  outletId: number | null,
  docType: DocumentType,
  requestedNumber?: string | null
): Promise<string> {
  try {
    return await getNextDocumentNumber(companyId, outletId, docType, requestedNumber);
  } catch (error) {
    if (error instanceof NumberingConflictError) {
      throw new DatabaseConflictError(error.message);
    }
    if (error instanceof NumberingTemplateNotFoundError) {
      throw new DatabaseReferenceError("Numbering template not configured");
    }
    throw error;
  }
}

// =============================================================================
// Access Control Helpers
// =============================================================================

/**
 * Verify that an outlet exists and belongs to the given company.
 * @throws DatabaseReferenceError if outlet not found
 */
export async function ensureCompanyOutletExists(
  executor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [outletId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Outlet not found for company");
  }
}

// =============================================================================
// ACL Helpers
// =============================================================================

/**
 * Verify that a user has access to a specific outlet.
 * Throws DatabaseForbiddenError if user cannot access.
 * 
 * Delegates to userHasOutletAccess in auth.ts for centralized ACL logic.
 */
export async function ensureUserHasOutletAccess(
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const { userHasOutletAccess } = await import("../auth.js");
  const hasAccess = await userHasOutletAccess(userId, companyId, outletId);
  if (!hasAccess) {
    throw new DatabaseForbiddenError("User cannot access outlet");
  }
}

// =============================================================================
// Date Helpers
// =============================================================================

/**
 * Format a Date or ISO date string to YYYY-MM-DD format.
 */
export function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// =============================================================================
// Precision Validation Helpers
// =============================================================================

/**
 * Check if a monetary value has more than 2 decimal places.
 * Used for input validation to prevent floating point issues.
 */
export function hasMoreThanTwoDecimals(value: number): boolean {
  const str = value.toFixed(10);
  const decimalPart = str.split(".")[1];
  if (!decimalPart) return false;
  return decimalPart.slice(2).split("").some((d) => d !== "0");
}

// =============================================================================
// Feature Gate Helpers
// =============================================================================

/**
 * Parse a feature gate configuration value.
 * Handles boolean, number (0/1), and string ("true"/"1") values.
 */
export function parseFeatureGateValue(value: unknown): boolean {
  if (value === 1 || value === true) {
    return true;
  }

  if (value === 0 || value === false || value == null) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
  }

  return false;
}
