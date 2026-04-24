// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation types for purchasing module.
 */

import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Error Types
// =============================================================================

export class APReconciliationError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "APReconciliationError";
  }
}

export class APReconciliationSettingsRequiredError extends APReconciliationError {
  constructor() {
    super(
      "AP_RECONCILIATION_SETTINGS_REQUIRED",
      "AP reconciliation settings are required. Configure account_ids via PUT /api/purchasing/reports/ap-reconciliation/settings"
    );
  }
}

export class APReconciliationInvalidAccountError extends APReconciliationError {
  constructor(accountId: number, reason: string) {
    super(
      "AP_RECONCILIATION_INVALID_ACCOUNT",
      `Account ${accountId} is not valid for AP reconciliation: ${reason}`
    );
  }
}

export class APReconciliationCrossTenantAccountError extends APReconciliationError {
  constructor(accountId: number) {
    super(
      "AP_RECONCILIATION_CROSS_TENANT_ACCOUNT",
      `Account ${accountId} does not belong to the authenticated company`
    );
  }
}

export class APReconciliationTimezoneRequiredError extends APReconciliationError {
  constructor(companyId: number, outletTimezone: string | null, companyTimezone: string | null) {
    super(
      "AP_RECONCILIATION_TIMEZONE_REQUIRED",
      `Cannot resolve timezone for company ${companyId}: outlet="${outletTimezone ?? "null"}", company="${companyTimezone ?? "null"}". Neither outlet nor company timezone is set or valid. No UTC fallback is permitted.`
    );
  }
}

// =============================================================================
// Settings Types
// =============================================================================

export interface APReconciliationSettings {
  accountIds: number[];
  source: "settings" | "fallback_company_default" | "none";
}

// =============================================================================
// Summary Types
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

// =============================================================================
// Service Interface
// =============================================================================

export interface ApReconciliationServiceOptions {
  db: KyselySchema;
}

export interface ResolveCompanyTimezoneParams {
  companyId: number;
}

export interface GetAPReconciliationSettingsParams {
  companyId: number;
}

export interface ValidateAPReconciliationAccountIdsParams {
  companyId: number;
  accountIds: number[];
}

export interface SaveAPReconciliationSettingsParams {
  companyId: number;
  accountIds: number[];
}

export interface GetAPReconciliationSummaryParams {
  companyId: number;
  asOfDate: string;
}
