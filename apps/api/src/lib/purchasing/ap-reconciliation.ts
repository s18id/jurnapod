// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Domain Service (Epic 47 Wave 0)
 *
 * Provides AP vs GL reconciliation functionality:
 * - Settings management (configurable AP control account set)
 * - Summary computation (AP subledger vs GL control balance)
 *
 * Key behaviors:
 * - Fail-closed: returns 409 if no valid account set resolved
 * - FX conversion: base = original * exchange_rate using scaled bigint math
 * - Timezone handling: as_of_date interpreted in tenant-local business day using
 *   canonical precedence outlet.timezone -> company.timezone (no UTC fallback),
 *   then converted to UTC boundaries for SQL comparisons
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  AP_RECONCILIATION_ACCOUNT_IDS_KEY,
  AP_CONTROL_ACCOUNT_TYPE_NAMES,
  AP_RECONCILIATION_ERROR_CODES,
  AP_PAYMENT_STATUS,
  PURCHASE_CREDIT_STATUS,
  PURCHASE_INVOICE_STATUS,
  normalizeDate,
  isValidTimeZone,
} from "@jurnapod/shared";
import { getDb } from "@/lib/db";

// =============================================================================
// Timezone Resolution (canonical: outlet -> company, no UTC fallback)
// =============================================================================

/**
 * Resolve the canonical IANA timezone for AP reconciliation.
 * Resolution order:
 * 1. outlet.timezone (if present and valid IANA identifier)
 * 2. company.timezone (if present and valid IANA identifier)
 * 3. NO UTC fallback - throw error if neither is available
 *
 * @param companyId - Company to resolve timezone for
 * @returns Resolved IANA timezone string
 */
async function resolveCompanyTimezone(companyId: number): Promise<string> {
  const db = getDb() as KyselySchema;

  // Try outlet timezone first (default outlet for company)
  const outletRow = await db
    .selectFrom("outlets")
    .where("company_id", "=", companyId)
    .where("code", "=", "MAIN")
    .select(["timezone"])
    .executeTakeFirst();

  if (outletRow?.timezone && isValidTimeZone(outletRow.timezone)) {
    return outletRow.timezone;
  }

  // Fall back to company timezone
  const companyRow = await db
    .selectFrom("companies")
    .where("id", "=", companyId)
    .select(["timezone"])
    .executeTakeFirst();

  if (companyRow?.timezone && isValidTimeZone(companyRow.timezone)) {
    return companyRow.timezone;
  }

  // NO UTC fallback - fail closed per project invariants
  throw new APReconciliationTimezoneRequiredError(
    companyId,
    outletRow?.timezone ?? null,
    companyRow?.timezone ?? null
  );
}

// =============================================================================
// Error Types
// =============================================================================

export class APReconciliationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "APReconciliationError";
  }
}

export class APReconciliationSettingsRequiredError extends APReconciliationError {
  constructor() {
    super(
      AP_RECONCILIATION_ERROR_CODES.SETTINGS_REQUIRED,
      "AP reconciliation settings are required. Configure account_ids via PUT /api/purchasing/reports/ap-reconciliation/settings"
    );
  }
}

export class APReconciliationInvalidAccountError extends APReconciliationError {
  constructor(accountId: number, reason: string) {
    super(
      AP_RECONCILIATION_ERROR_CODES.INVALID_ACCOUNT,
      `Account ${accountId} is not valid for AP reconciliation: ${reason}`
    );
  }
}

export class APReconciliationCrossTenantAccountError extends APReconciliationError {
  constructor(accountId: number) {
    super(
      AP_RECONCILIATION_ERROR_CODES.CROSS_TENANT_ACCOUNT,
      `Account ${accountId} does not belong to the authenticated company`
    );
  }
}

export class APReconciliationTimezoneRequiredError extends APReconciliationError {
  constructor(companyId: number, outletTimezone: string | null, companyTimezone: string | null) {
    super(
      AP_RECONCILIATION_ERROR_CODES.TIMEZONE_REQUIRED,
      `Cannot resolve timezone for company ${companyId}: outlet="${outletTimezone ?? "null"}", company="${companyTimezone ?? "null"}". Neither outlet nor company timezone is set or valid. No UTC fallback is permitted.`
    );
  }
}

// =============================================================================
// Scaled Math Helpers (avoid parseFloat precision leakage)
// =============================================================================

const SCALE = 4n;

function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  // Accept optional leading minus for adjustment/variance paths.
  const re = new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const sign = trimmed.startsWith("-") ? -1n : 1n;
  const unsigned = sign < 0n ? trimmed.slice(1) : trimmed;
  const [integer, fraction = ""] = unsigned.split(".");
  const scaleFactor = 10n ** BigInt(scale);
  const fracScaled = (fraction + "0".repeat(scale)).slice(0, scale);
  const magnitude = BigInt(integer) * scaleFactor + BigInt(fracScaled);
  return sign * magnitude;
}

function fromScaled(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / (10n ** BigInt(scale));
  const fracPart = (abs % (10n ** BigInt(scale))).toString().padStart(scale, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

function fromScaled4(value: bigint): string {
  return fromScaled(value, 4);
}

/**
 * Compute base amount from original amount and exchange rate.
 * Formula: base = original * exchange_rate
 * All values are treated as decimal strings with proper scaling.
 *
 * Rounding policy: half-up to scale 4.
 * This matches existing purchasing FX conversion behavior in PI/AP services
 * where base amounts are normalized to DECIMAL(19,4) before aggregation.
 */
function computeBaseAmount(originalAmount: string, exchangeRate: string): bigint {
  const originalScaled = toScaled(originalAmount, 4);
  const rateScaled = toScaled(exchangeRate, 8);
  // original * rate: (scale4 * scale8) = scale12
  // To get back to scale4, divide by 10^8
  const scaleFactor = 10n ** 8n;
  return (originalScaled * rateScaled + scaleFactor / 2n) / scaleFactor;
}

// =============================================================================
// Settings Management
// =============================================================================

export interface APReconciliationSettings {
  accountIds: number[];
  source: "settings" | "fallback_company_default" | "none";
}

/**
 * Validate that an account is AP-control compatible.
 * An account is valid if:
 * - is_payable = 1, OR
 * - type_name is in the creditor/liability variants list
 */
async function isAPControlAccount(db: KyselySchema, companyId: number, accountId: number): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM accounts
    WHERE id = ${accountId}
      AND company_id = ${companyId}
      AND is_active = 1
      AND (
        is_payable = 1
        OR type_name IN (${sql.join(AP_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t}`), sql`, `)})
      )
    LIMIT 1
  `.execute(db);

  return result.rows.length > 0;
}

/**
 * Get AP reconciliation account IDs from settings.
 * Returns null if no settings are configured.
 */
export async function getAPReconciliationAccountIds(
  companyId: number
): Promise<number[] | null> {
  const db = getDb() as KyselySchema;

  const result = await sql`
    SELECT setting_value FROM settings_strings
    WHERE company_id = ${companyId}
      AND outlet_id IS NULL
      AND setting_key = ${AP_RECONCILIATION_ACCOUNT_IDS_KEY}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  const settingValue = (result.rows[0] as { setting_value: string }).setting_value;
  try {
    const parsed = JSON.parse(settingValue);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
  } catch {
    return null;
  }
}

/**
 * Get AP reconciliation account IDs with fallback to company_modules default.
 * Returns settings with source indicator.
 */
export async function getAPReconciliationSettings(
  companyId: number
): Promise<APReconciliationSettings> {
  // First try settings_strings
  const settingAccountIds = await getAPReconciliationAccountIds(companyId);

  if (settingAccountIds !== null && settingAccountIds.length > 0) {
    // Validate all accounts exist and are AP-control compatible
    const db = getDb() as KyselySchema;
    const validAccounts: number[] = [];

    for (const accountId of settingAccountIds) {
      const isValid = await isAPControlAccount(db, companyId, accountId);
      if (isValid) {
        validAccounts.push(accountId);
      }
    }

    if (validAccounts.length > 0) {
      return {
        accountIds: validAccounts,
        source: "settings",
      };
    }
  }

  // Fallback to company_modules.purchasing_default_ap_account_id
  const db = getDb() as KyselySchema;
  const fallbackResult = await sql`
    SELECT cm.purchasing_default_ap_account_id
    FROM company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    WHERE cm.company_id = ${companyId}
      AND m.code = 'purchasing'
      AND cm.purchasing_default_ap_account_id IS NOT NULL
    LIMIT 1
  `.execute(db);

  if (fallbackResult.rows.length > 0) {
    const defaultAccountId = Number(
      (fallbackResult.rows[0] as { purchasing_default_ap_account_id: number }).purchasing_default_ap_account_id
    );

    // Validate the fallback account is also AP-control compatible
    const isValid = await isAPControlAccount(db, companyId, defaultAccountId);
    if (isValid) {
      return {
        accountIds: [defaultAccountId],
        source: "fallback_company_default",
      };
    }
  }

  return {
    accountIds: [],
    source: "none",
  };
}

/**
 * Validate account IDs for AP reconciliation settings.
 * Throws APReconciliationCrossTenantAccountError if any account doesn't belong to company.
 * Throws APReconciliationInvalidAccountError if any account is not AP-control compatible.
 */
export async function validateAPReconciliationAccountIds(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb() as KyselySchema;

  // Fetch all accounts in one query
  const accountsResult = await sql`
    SELECT id, company_id, is_active, is_payable, type_name
    FROM accounts
    WHERE id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
  `.execute(db);

  const accountMap = new Map<number, { company_id: number; is_active: number; is_payable: number; type_name: string | null }>();
  for (const row of accountsResult.rows) {
    const r = row as { id: number; company_id: number; is_active: number; is_payable: number; type_name: string | null };
    accountMap.set(r.id, r);
  }

  for (const accountId of accountIds) {
    const account = accountMap.get(accountId);

    if (!account) {
      throw new APReconciliationInvalidAccountError(accountId, "Account not found or inactive");
    }

    if (account.company_id !== companyId) {
      throw new APReconciliationCrossTenantAccountError(accountId);
    }

    if (account.is_active !== 1) {
      throw new APReconciliationInvalidAccountError(accountId, "Account is inactive");
    }

    const isPayable = account.is_payable === 1;
    const typeName = (account.type_name ?? "").toUpperCase();
    const isCreditorType = AP_CONTROL_ACCOUNT_TYPE_NAMES.includes(
      typeName as (typeof AP_CONTROL_ACCOUNT_TYPE_NAMES)[number]
    );

    if (!isPayable && !isCreditorType) {
      throw new APReconciliationInvalidAccountError(
        accountId,
        `Account type '${account.type_name ?? "NULL"}' is not AP-control compatible. Set is_payable=1 or use a creditor/liability account type.`
      );
    }
  }
}

/**
 * Save AP reconciliation account IDs to settings.
 * Validates all accounts before saving.
 */
export async function saveAPReconciliationSettings(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  // Validate first
  await validateAPReconciliationAccountIds(companyId, accountIds);

  const db = getDb() as KyselySchema;
  const settingValue = JSON.stringify(accountIds);

  await sql`
    INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
    VALUES (${companyId}, NULL, ${AP_RECONCILIATION_ACCOUNT_IDS_KEY}, ${settingValue}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
  `.execute(db);
}

// =============================================================================
// Summary Computation
// =============================================================================

export interface APReconciliationSummaryResult {
  asOfDate: string;
  apSubledgerBalance: string;
  glControlBalance: string;
  variance: string;
  configuredAccountIds: number[];
  accountSource: "settings" | "fallback_company_default" | "none";
  currency: string;
}

/**
 * Get AP subledger balance (open posted purchase invoices base amounts).
 * Cutoff: invoice_date (local DATE column) <= as_of_date in tenant-local business day.
 * Since invoice_date is a DATE column without time, the simple string comparison
 * "2026-04-19" correctly includes the entire local business day.
 * Formula for each PI: base = grand_total * exchange_rate
 */
async function getAPSubledgerBalance(
  db: KyselySchema,
  companyId: number,
  asOfDate: string
): Promise<bigint> {
  // invoice_date is a DATE column (YYYY-MM-DD local). The simple <= comparison
  // correctly includes all invoices from the business day of as_of_date.
  const rows = await sql`
    SELECT
      pi.grand_total,
      pi.exchange_rate,
      pi.currency_code,
      COALESCE(pay.total_paid, 0) AS paid_base,
      COALESCE(cr.total_credited, 0) AS credited_base
    FROM purchase_invoices pi
    LEFT JOIN (
      SELECT apl.purchase_invoice_id, SUM(apl.allocation_amount) AS total_paid
      FROM ap_payment_lines apl
      INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
      WHERE ap.company_id = ${companyId}
        AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
      GROUP BY apl.purchase_invoice_id
    ) pay ON pay.purchase_invoice_id = pi.id
    LEFT JOIN (
      SELECT pca.purchase_invoice_id, SUM(pca.applied_amount) AS total_credited
      FROM purchase_credit_applications pca
      INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
      WHERE pca.company_id = ${companyId}
        AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
      GROUP BY pca.purchase_invoice_id
    ) cr ON cr.purchase_invoice_id = pi.id
    WHERE pi.company_id = ${companyId}
      AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
      AND pi.invoice_date <= ${asOfDate}
  `.execute(db);

  let totalBase = 0n;

  for (const row of rows.rows) {
    const r = row as {
      grand_total: string;
      exchange_rate: string;
      currency_code: string;
      paid_base: string;
      credited_base: string;
    };

    // Compute base amount: grand_total * exchange_rate
    const baseTotal = computeBaseAmount(r.grand_total, r.exchange_rate);
    const paidBase = toScaled(r.paid_base, 4);
    const creditedBase = toScaled(r.credited_base, 4);
    const openBase = baseTotal - paidBase - creditedBase;

    if (openBase > 0n) {
      totalBase += openBase;
    }
  }

  return totalBase;
}

/**
 * Get GL control balance (sum of debit - credit for configured AP accounts).
 * Cutoff: journal_batches.posted_at (DATETIME, UTC) <= as_of_date UTC boundary.
 * The as_of_date is converted to UTC end-of-day using tenant-local timezone.
 * posted_at is a DATETIME column (UTC-aligned per DB conventions).
 */
async function getGLControlBalance(
  db: KyselySchema,
  companyId: number,
  accountIds: number[],
  asOfDateUtcEnd: string
): Promise<bigint> {
  if (accountIds.length === 0) {
    return 0n;
  }

  const rows = await sql`
    SELECT
      SUM(jl.debit) AS total_debit,
      SUM(jl.credit) AS total_credit
    FROM journal_lines jl
    INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
    WHERE jl.company_id = ${companyId}
      AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
      AND jb.posted_at <= ${asOfDateUtcEnd}
  `.execute(db);

  if (rows.rows.length === 0) {
    return 0n;
  }

  const r = rows.rows[0] as { total_debit: string | null; total_credit: string | null };
  const totalDebit = toScaled(r.total_debit ?? "0", 4);
  const totalCredit = toScaled(r.total_credit ?? "0", 4);

  // GL control balance for AP should be expressed as positive payable balance,
  // so use credit - debit for liability-oriented accounts.
  return totalCredit - totalDebit;
}

/**
 * Get AP Reconciliation Summary.
 * Returns 409 error if no valid account set can be resolved (fail-closed).
 *
 * Timezone handling: as_of_date is interpreted in tenant-local business day using
 * canonical precedence outlet.timezone -> company.timezone (no UTC fallback),
 * then converted to UTC boundaries for SQL comparisons on journal_batches.posted_at.
 * invoice_date uses simple string comparison (DATE column, no time component).
 */
export async function getAPReconciliationSummary(
  companyId: number,
  asOfDate: string
): Promise<APReconciliationSummaryResult> {
  const settings = await getAPReconciliationSettings(companyId);

  if (settings.accountIds.length === 0) {
    throw new APReconciliationSettingsRequiredError();
  }

  // Resolve tenant-local timezone (canonical: outlet -> company, no UTC fallback)
  const timezone = await resolveCompanyTimezone(companyId);

  // Convert YYYY-MM-DD as_of_date to UTC boundaries in the tenant's timezone.
  // "end" boundary includes the full business day (23:59:59.999 local).
  // Used only for journal_batches.posted_at (DATETIME column).
  // invoice_date uses simple <= comparison (DATE column, no time component).
  const asOfDateUtcEnd = normalizeDate(asOfDate, timezone, "end");

  const db = getDb() as KyselySchema;

  const [apBalance, glBalance] = await Promise.all([
    getAPSubledgerBalance(db, companyId, asOfDate),
    getGLControlBalance(db, companyId, settings.accountIds, asOfDateUtcEnd),
  ]);

  const variance = apBalance - glBalance;

  return {
    asOfDate,
    apSubledgerBalance: fromScaled4(apBalance),
    glControlBalance: fromScaled4(glBalance),
    variance: fromScaled4(variance),
    configuredAccountIds: settings.accountIds,
    accountSource: settings.source,
    currency: "BASE", // Summary is always in base currency
  };
}
