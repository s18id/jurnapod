// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Service for purchasing module.
 *
 * Provides AP vs GL reconciliation functionality with tenant isolation.
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
  toUtcIso,
  isValidTimeZone,
} from "@jurnapod/shared";
import type {
  APReconciliationSettings,
  APReconciliationSummaryResult,
  ResolveCompanyTimezoneParams,
  GetAPReconciliationSettingsParams,
  ValidateAPReconciliationAccountIdsParams,
  SaveAPReconciliationSettingsParams,
  GetAPReconciliationSummaryParams,
} from "../types/ap-reconciliation.js";
import {
  APReconciliationError,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
} from "../types/ap-reconciliation.js";

// =============================================================================
// BigInt Scaled Decimal Helpers
// =============================================================================

export function toScaled(value: string, scale: number): bigint {
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

export function fromScaled(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / (10n ** BigInt(scale));
  const fracPart = (abs % (10n ** BigInt(scale))).toString().padStart(scale, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

export function fromScaled4(value: bigint): string {
  return fromScaled(value, 4);
}

/**
 * Compute base amount from original amount and exchange rate.
 * Formula: base = original * exchange_rate
 * All values are treated as decimal strings with proper scaling.
 *
 * Rounding policy: half-up to scale 4.
 */
export function computeBaseAmount(originalAmount: string, exchangeRate: string): bigint {
  const originalScaled = toScaled(originalAmount, 4);
  const rateScaled = toScaled(exchangeRate, 8);
  // original * rate: (scale4 * scale8) = scale12
  // To get back to scale4, divide by 10^8
  const scaleFactor = 10n ** 8n;
  return (originalScaled * rateScaled + scaleFactor / 2n) / scaleFactor;
}

// =============================================================================
// Service
// =============================================================================

export class ApReconciliationService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Resolve the canonical IANA timezone for AP reconciliation.
   * Resolution order:
   * 1. outlet.timezone (if present and valid IANA identifier)
   * 2. company.timezone (if present and valid IANA identifier)
   * 3. NO UTC fallback - throw error if neither is available
   */
  async resolveCompanyTimezone(params: ResolveCompanyTimezoneParams): Promise<string> {
    const { companyId } = params;

    // Try outlet timezone first (default outlet for company)
    const outletRow = await this.db
      .selectFrom("outlets")
      .where("company_id", "=", companyId)
      .where("code", "=", "MAIN")
      .select(["timezone"])
      .executeTakeFirst();

    if (outletRow?.timezone && isValidTimeZone(outletRow.timezone)) {
      return outletRow.timezone;
    }

    // Fall back to company timezone
    const companyRow = await this.db
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

  /**
   * Validate that an account is AP-control compatible.
   */
  private async isAPControlAccount(companyId: number, accountId: number): Promise<boolean> {
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
    `.execute(this.db);

    return result.rows.length > 0;
  }

  /**
   * Get AP reconciliation account IDs from settings.
   */
  async getAPReconciliationAccountIds(companyId: number): Promise<number[] | null> {
    const result = await sql`
      SELECT setting_value FROM settings_strings
      WHERE company_id = ${companyId}
        AND outlet_id IS NULL
        AND setting_key = ${AP_RECONCILIATION_ACCOUNT_IDS_KEY}
      LIMIT 1
    `.execute(this.db);

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
   */
  async getAPReconciliationSettings(params: GetAPReconciliationSettingsParams): Promise<APReconciliationSettings> {
    const { companyId } = params;

    // First try settings_strings
    const settingAccountIds = await this.getAPReconciliationAccountIds(companyId);

    if (settingAccountIds !== null && settingAccountIds.length > 0) {
      // Validate all accounts exist and are AP-control compatible
      const validAccounts: number[] = [];

      for (const accountId of settingAccountIds) {
        const isValid = await this.isAPControlAccount(companyId, accountId);
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
    const fallbackResult = await sql`
      SELECT cm.purchasing_default_ap_account_id
      FROM company_modules cm
      INNER JOIN modules m ON m.id = cm.module_id
      WHERE cm.company_id = ${companyId}
        AND m.code = 'purchasing'
        AND cm.purchasing_default_ap_account_id IS NOT NULL
      LIMIT 1
    `.execute(this.db);

    if (fallbackResult.rows.length > 0) {
      const defaultAccountId = Number(
        (fallbackResult.rows[0] as { purchasing_default_ap_account_id: number }).purchasing_default_ap_account_id
      );

      // Validate the fallback account is also AP-control compatible
      const isValid = await this.isAPControlAccount(companyId, defaultAccountId);
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
   */
  async validateAPReconciliationAccountIds(params: ValidateAPReconciliationAccountIdsParams): Promise<void> {
    const { companyId, accountIds } = params;

    // Fetch all accounts in one query
    const accountsResult = await sql`
      SELECT id, company_id, is_active, is_payable, type_name
      FROM accounts
      WHERE id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
    `.execute(this.db);

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
   */
  async saveAPReconciliationSettings(params: SaveAPReconciliationSettingsParams): Promise<void> {
    const { companyId, accountIds } = params;

    // Validate first
    await this.validateAPReconciliationAccountIds({ companyId, accountIds });

    const settingValue = JSON.stringify(accountIds);

    await sql`
      INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
      VALUES (${companyId}, NULL, ${AP_RECONCILIATION_ACCOUNT_IDS_KEY}, ${settingValue}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
    `.execute(this.db);
  }

  /**
   * Get AP subledger balance (open posted purchase invoices base amounts).
   */
  private async getAPSubledgerBalance(companyId: number, asOfDate: string): Promise<bigint> {
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
    `.execute(this.db);

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
   */
  private async getGLControlBalance(companyId: number, accountIds: number[], asOfDateUtcEnd: string): Promise<bigint> {
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
    `.execute(this.db);

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
   */
  async getAPReconciliationSummary(params: GetAPReconciliationSummaryParams): Promise<APReconciliationSummaryResult> {
    const { companyId, asOfDate } = params;

    const settings = await this.getAPReconciliationSettings({ companyId });

    if (settings.accountIds.length === 0) {
      throw new APReconciliationSettingsRequiredError();
    }

    // Resolve tenant-local timezone (canonical: outlet -> company, no UTC fallback)
    const timezone = await this.resolveCompanyTimezone({ companyId });

    // Convert YYYY-MM-DD as_of_date to UTC boundaries in the tenant's timezone.
    const asOfDateUtcEnd = toUtcIso.businessDate(asOfDate, timezone, "end");

    const [apBalance, glBalance] = await Promise.all([
      this.getAPSubledgerBalance(companyId, asOfDate),
      this.getGLControlBalance(companyId, settings.accountIds, asOfDateUtcEnd),
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
}

// Export error classes for use in other services
export {
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
};
