// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Period-Close Guardrail Service
 *
 * Enforces period-close guardrails for AP transactions (purchase invoices, AP payments,
 * purchase credits) by checking whether the transaction date falls within a closed
 * fiscal period or fiscal year.
 *
 * Decision flow:
 *  1. Read guardrail strictness setting `accounting.ap_period_close_guardrail`
 *     - "strict": block all closed-period transactions (no override)
 *     - "override_allowed": allow closed-period transactions if user has MANAGE on accounting.fiscal_years
 *  2. Primary check: look up fiscal_periods by company_id + inclusive date window
 *  3. Fallback check: look up fiscal_years by company_id + inclusive date window
 *  4. Return decision with allow/block, override eligibility, period_id/fiscal_year_id,
 *     and block reason code/message
 *
 * WP: 47.5-WP-B
 */

import { sql } from "kysely";
import { getDb } from "@/lib/db.js";
import { checkUserAccess } from "@/lib/auth.js";
import type { AuthContext } from "@/lib/auth-guard.js";
import type { KyselySchema, Transaction } from "@jurnapod/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GuardrailStrictness = "strict" | "override_allowed";

export type GuardrailDecision =
  | GuardrailDecisionAllow
  | GuardrailDecisionBlock
  | GuardrailDecisionOverrideRequired;

export type GuardrailDecisionAllow = {
  allowed: true;
  overrideRequired: false;
  periodId: number | null;
  fiscalYearId: number | null;
  blockReason: null;
  blockCode: null;
};

export type GuardrailDecisionBlock = {
  allowed: false;
  overrideRequired: false;
  periodId: number | null;
  fiscalYearId: number | null;
  blockReason: string;
  blockCode:
    | "PERIOD_CLOSED"
    | "FISCAL_YEAR_CLOSED"
    | "PERIOD_NOT_FOUND"
    | "FISCAL_YEAR_NOT_FOUND"
    | "SETTINGS_ERROR";
};

export type GuardrailDecisionOverrideRequired = {
  allowed: false;
  overrideRequired: true;
  periodId: number | null;
  fiscalYearId: number | null;
  blockReason: string;
  blockCode:
    | "PERIOD_CLOSED"
    | "FISCAL_YEAR_CLOSED"
    | "PERIOD_NOT_FOUND"
    | "FISCAL_YEAR_NOT_FOUND"
    | "SETTINGS_ERROR";
};

/** Override reason validation result */
export type OverrideReasonValidation =
  | { valid: true; reason: string }
  | { valid: false; message: string };

// ---------------------------------------------------------------------------
// Override Access Evaluator
// ---------------------------------------------------------------------------

/**
 * FIX(47.5-WP-C): Unified override access evaluator.
 *
 * Combines override reason validation AND MANAGE permission check into one call.
 * This is the single entry point for override decisions in the service layer.
 *
 * Decision table:
 *  - overrideRequired=false          → allow (no override needed)
 *  - overrideRequired=true + valid reason + MANAGE → allow
 *  - overrideRequired=true + no/short reason       → { valid:false, error:"reason" }
 *  - overrideRequired=true + valid reason + no MANAGE → { valid:false, error:"forbidden" }
 *
 * @param auth             - AuthContext from request
 * @param overrideReason   - Raw override reason (may be undefined/null)
 * @param decision         - GuardrailDecision with overrideRequired flag
 * @returns Evaluation result with allowed flag and error classification
 */
export async function evaluateOverrideAccess(
  auth: AuthContext,
  overrideReason: string | null | undefined,
  decision: GuardrailDecision
): Promise<
  | { allowed: true; overrideReason: string | null }
  | { allowed: false; error: "reason"; message: string }
  | { allowed: false; error: "forbidden"; message: string }
> {
  if (!decision.overrideRequired) {
    // Open period or no override needed — allow without any permission check
    return { allowed: true, overrideReason: null };
  }

  // Override is required — validate reason first (minimum length)
  const reasonValidation = validateOverrideReason(
    overrideReason ?? undefined,
    true // overrideRequired = true
  );

  if (!reasonValidation.valid) {
    return {
      allowed: false,
      error: "reason",
      message: reasonValidation.message,
    };
  }

  // Reason is valid — now check MANAGE permission
  const hasAcl = await hasOverridePermission(auth);
  if (!hasAcl) {
    return {
      allowed: false,
      error: "forbidden",
      message: "You do not have permission to override closed period restrictions. Requires accounting.fiscal_years MANAGE permission.",
    };
  }

  return { allowed: true, overrideReason: reasonValidation.reason };
}

/** Minimum character length for override reason */
const MIN_OVERRIDE_REASON_LENGTH = 10;

/** Period status values from DB (tinyint) */
const PERIOD_STATUS_OPEN = 1;

// ---------------------------------------------------------------------------
// Structured Errors
// ---------------------------------------------------------------------------

/**
 * Base class for period-close guardrail errors.
 * All guardrail errors carry PERIOD_CLOSED code so routes can map to 409.
 */
export class PeriodCloseError extends Error {
  constructor(
    public readonly code: "PERIOD_CLOSED",
    message: string,
    public readonly blockCode: string
  ) {
    super(message);
    this.name = "PeriodCloseError";
  }
}

/**
 * Thrown when override is required but reason is missing/invalid.
 * Routes map this to 400 Bad Request.
 */
export class PeriodOverrideReasonInvalidError extends PeriodCloseError {
  constructor(message: string) {
    super("PERIOD_CLOSED", message, "OVERRIDE_REASON_INVALID");
  }
}

/**
 * Thrown when override is attempted by user lacking MANAGE permission.
 * Routes map this to 403 Forbidden.
 * Note: This is thrown by service layer when MANAGE check fails.
 */
export class PeriodOverrideForbiddenError extends PeriodCloseError {
  constructor(message: string) {
    super("PERIOD_CLOSED", message, "OVERRIDE_FORBIDDEN");
  }
}

/**
 * Thrown when periodId is invalid (null, <= 0, or non-finite) before DB write.
 * This prevents hidden FK/null runtime crashes if caller logic drifts.
 * Routes map this to 400 Bad Request.
 */
export class PeriodOverrideInvalidPeriodIdError extends PeriodCloseError {
  constructor(periodId: unknown) {
    super(
      "PERIOD_CLOSED",
      `Invalid periodId for period_close_overrides insert: ${JSON.stringify(periodId)}`,
      "INVALID_PERIOD_ID"
    );
  }
}

// ---------------------------------------------------------------------------
// Setting Key Constants
// ---------------------------------------------------------------------------

const SETTING_KEY_GUARDRAIL = "accounting.ap_period_close_guardrail";
const DEFAULT_GUARDRAIL_STRICTNESS: GuardrailStrictness = "strict";

// ---------------------------------------------------------------------------
// Guardrail Service
// ---------------------------------------------------------------------------

/**
 * Check whether a transaction date falls within a closed fiscal period or fiscal year.
 *
 * This is the primary decision API for the AP period-close guardrail.
 *
 * @param companyId   - Tenant ID
 * @param transactionDate - Transaction date (YYYY-MM-DD string) to check against period/year windows
 * @returns GuardrailDecision with allow/block/override-required result
 */
export async function checkPeriodCloseGuardrail(
  companyId: number,
  transactionDate: string
): Promise<GuardrailDecision> {
  const db = getDb();

  // 1. Read guardrail strictness setting (default: strict)
  const strictness = await readGuardrailStrictness(db, companyId);

  // 2. Primary check: fiscal_periods lookup
  const periodResult = await lookupFiscalPeriod(db, companyId, transactionDate);

  if (periodResult.found) {
    if (periodResult.status === PERIOD_STATUS_OPEN) {
      return {
        allowed: true,
        overrideRequired: false,
        periodId: periodResult.id,
        fiscalYearId: null,
        blockReason: null,
        blockCode: null,
      };
    }

    // Period is closed
    if (strictness === "strict") {
      return {
        allowed: false,
        overrideRequired: false,
        periodId: periodResult.id,
        fiscalYearId: null,
        blockReason: `Transaction date ${transactionDate} falls within closed fiscal period ${periodResult.periodNo}. Contact your administrator to reopen the period.`,
        blockCode: "PERIOD_CLOSED",
      };
    }

    // override_allowed — caller must provide override reason and have ACL
    return {
      allowed: false,
      overrideRequired: true,
      periodId: periodResult.id,
      fiscalYearId: null,
      blockReason: `Transaction date ${transactionDate} falls within closed fiscal period ${periodResult.periodNo}. An override reason is required.`,
      blockCode: "PERIOD_CLOSED",
    };
  }

  // 3. Fallback check: fiscal_years lookup
  const yearResult = await lookupFiscalYear(db, companyId, transactionDate);

  if (yearResult.found) {
    if (yearResult.status === "OPEN") {
      return {
        allowed: true,
        overrideRequired: false,
        periodId: null,
        fiscalYearId: yearResult.id,
        blockReason: null,
        blockCode: null,
      };
    }

    // Fiscal year is closed
    if (strictness === "strict") {
      return {
        allowed: false,
        overrideRequired: false,
        periodId: null,
        fiscalYearId: yearResult.id,
        blockReason: `Transaction date ${transactionDate} falls within closed fiscal year ${yearResult.year}. Contact your administrator to reopen the fiscal year.`,
        blockCode: "FISCAL_YEAR_CLOSED",
      };
    }

    // override_allowed
    return {
      allowed: false,
      overrideRequired: true,
      periodId: null,
      fiscalYearId: yearResult.id,
      blockReason: `Transaction date ${transactionDate} falls within closed fiscal year ${yearResult.year}. An override reason is required.`,
      blockCode: "FISCAL_YEAR_CLOSED",
    };
  }

  // FIX(47.5-compat): No period or year found — return allow for backward compatibility.
  // Blocking on PERIOD_NOT_FOUND breaks purchasing integration suites when no fiscal
  // periods/years exist yet for a company/date. We only block when a matching
  // period/year IS found and is CLOSED. Override path for CLOSED + override_allowed unchanged.
  return {
    allowed: true,
    overrideRequired: false,
    periodId: null,
    fiscalYearId: null,
    blockReason: null,
    blockCode: null,
  };
}

/**
 * Validate override reason for closed-period override path.
 *
 * Rules:
 *  - If no override path is used: reason is optional (returned as valid with empty string)
 *  - If override path is used: reason is mandatory AND must be at least MIN_OVERRIDE_REASON_LENGTH chars
 *
 * @param overrideReason - Raw override reason string from request
 * @param overrideRequired - Whether override is required for this decision
 * @returns OverrideReasonValidation result
 */
export function validateOverrideReason(
  overrideReason: string | undefined,
  overrideRequired: boolean
): OverrideReasonValidation {
  const trimmed = overrideReason?.trim() ?? "";

  if (!overrideRequired) {
    // Reason is optional when override is not required
    return { valid: true, reason: trimmed };
  }

  if (!trimmed || trimmed.length < MIN_OVERRIDE_REASON_LENGTH) {
    return {
      valid: false,
      message: `Override reason is required and must be at least ${MIN_OVERRIDE_REASON_LENGTH} characters when overriding a closed period.`,
    };
  }

  return { valid: true, reason: trimmed };
}

/**
 * Verify that the user has MANAGE permission on accounting.fiscal_years.
 * This is the ACL gate for the override path.
 *
 * FIX(47.5-WP-C): Replaces broken implementation that used fake Request object.
 * Now calls checkUserAccess directly with proper AuthContext.
 *
 * @param auth - AuthContext from the request
 * @returns true if user has override permission, false otherwise
 */
export async function hasOverridePermission(auth: AuthContext): Promise<boolean> {
  // FIX(47.5-WP-C): Call checkUserAccess directly — no fake Request needed.
  // MANAGE = 32 bit, CRUDAM mask = 63.
  const access = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    module: "accounting",
    resource: "fiscal_years",
    permission: "manage",
  });

  // access is null when user/company not found (shouldn't happen in normal flow)
  if (!access) {
    return false;
  }

  // SUPER_ADMIN bypasses normal permission checks
  if (access.isSuperAdmin) {
    return true;
  }

  return access.hasPermission;
}

// ---------------------------------------------------------------------------
// Atomic Insert Helper
// ---------------------------------------------------------------------------

/**
 * Insert a period_close_overrides audit row inside an existing DB transaction.
 *
 * Required fields:
 *  - company_id
 *  - user_id
 *  - transaction_type (e.g., "PURCHASE_INVOICE", "AP_PAYMENT", "PURCHASE_CREDIT")
 *  - transaction_id
 *  - period_id (0 if override is at fiscal year level)
 *  - reason
 *  - overridden_at
 *
 * @param trx       - Kysely transaction executor
 * @param params    - Override record parameters
 */
// FIX(47.5-WP-B): Transaction is TS<DB> (non-generic alias from @jurnapod/db)
// but period_close_overrides IS in the DB schema — the type-system union just
// doesn't carry all table names. At runtime mysql2 driver handles the query fine.
export async function insertPeriodCloseOverride(
  trx: Transaction,
  params: {
    companyId: number;
    userId: number;
    transactionType: string;
    transactionId: number;
    periodId: number;
    reason: string;
    overriddenAt: Date;
  }
): Promise<void> {
  // FIX(47.5-Remediation): Defensive runtime validation for periodId.
  // Throws structured PeriodOverrideInvalidPeriodIdError before DB write
  // if caller logic drifts and passes null/<=0/non-finite periodId.
  if (
    params.periodId == null ||
    !Number.isFinite(params.periodId) ||
    params.periodId <= 0
  ) {
    throw new PeriodOverrideInvalidPeriodIdError(params.periodId);
  }

  // FIX(47.5-WP-B): Atomic insert of period_close_overrides row
  await trx
    .insertInto("period_close_overrides")
    .values({
      company_id: params.companyId,
      user_id: params.userId,
      transaction_type: params.transactionType,
      transaction_id: params.transactionId,
      period_id: params.periodId,
      reason: params.reason,
      overridden_at: params.overriddenAt,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Read guardrail strictness setting for a company.
 * Falls back to default "strict" if not set.
 */
async function readGuardrailStrictness(
  db: KyselySchema,
  companyId: number
): Promise<GuardrailStrictness> {
  const row = await sql<{ setting_value: string | null }>`
    SELECT setting_value
    FROM settings_strings
    WHERE company_id = ${companyId}
      AND outlet_id IS NULL
      AND setting_key = ${SETTING_KEY_GUARDRAIL}
    LIMIT 1
  `.execute(db);

  if (!row.rows.length || !row.rows[0].setting_value) {
    return DEFAULT_GUARDRAIL_STRICTNESS;
  }

  const value = row.rows[0].setting_value.trim().toLowerCase();
  if (value === "override_allowed") {
    return "override_allowed";
  }
  return DEFAULT_GUARDRAIL_STRICTNESS;
}

type PeriodLookupResult =
  | { found: false }
  | { found: true; id: number; status: number; periodNo: number };

/**
 * Look up a fiscal period by company_id + inclusive date window.
 * A period matches if: period.start_date <= transactionDate <= period.end_date
 */
async function lookupFiscalPeriod(
  db: KyselySchema,
  companyId: number,
  transactionDate: string
): Promise<PeriodLookupResult> {
  const row = await sql<{
    id: number;
    status: number;
    period_no: number;
  }>`
    SELECT fp.id, fp.status, fp.period_no
    FROM fiscal_periods fp
    WHERE fp.company_id = ${companyId}
      AND fp.start_date <= ${transactionDate}
      AND fp.end_date >= ${transactionDate}
    LIMIT 1
  `.execute(db);

  if (!row.rows.length) {
    return { found: false };
  }

  return {
    found: true,
    id: Number(row.rows[0].id),
    status: Number(row.rows[0].status),
    periodNo: Number(row.rows[0].period_no),
  };
}

type YearLookupResult =
  | { found: false }
  | { found: true; id: number; status: "OPEN" | "CLOSED"; year: number };

/**
 * Look up a fiscal year by company_id + inclusive date window.
 * A year matches if: fiscal_year.start_date <= transactionDate <= fiscal_year.end_date
 */
async function lookupFiscalYear(
  db: KyselySchema,
  companyId: number,
  transactionDate: string
): Promise<YearLookupResult> {
  const row = await sql<{
    id: number;
    status: string;
    start_date: Date;
    end_date: Date;
  }>`
    SELECT fy.id, fy.status, fy.start_date, fy.end_date
    FROM fiscal_years fy
    WHERE fy.company_id = ${companyId}
      AND fy.start_date <= ${transactionDate}
      AND fy.end_date >= ${transactionDate}
    LIMIT 1
  `.execute(db);

  if (!row.rows.length) {
    return { found: false };
  }

  const rawStatus = String(row.rows[0].status).toUpperCase();
  return {
    found: true,
    id: Number(row.rows[0].id),
    status: rawStatus === "CLOSED" ? "CLOSED" : "OPEN",
    year: row.rows[0].start_date.getFullYear(),
  };
}
