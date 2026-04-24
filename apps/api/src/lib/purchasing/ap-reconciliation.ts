// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import {
  ApReconciliationService,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
  APReconciliationError,
  fromScaled4,
  toScaled,
  computeBaseAmount,
} from "@jurnapod/modules-purchasing";
import type {
  APReconciliationSettings,
  APReconciliationSummaryResult,
  GetAPReconciliationSettingsParams,
  ValidateAPReconciliationAccountIdsParams,
  SaveAPReconciliationSettingsParams,
  GetAPReconciliationSummaryParams,
} from "@jurnapod/modules-purchasing";

// Re-export types for use in routes
export type {
  APReconciliationSettings,
  APReconciliationSummaryResult,
};

// Re-export error classes for use in routes
export {
  APReconciliationError,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
};

export { toScaled, fromScaled4, computeBaseAmount };

export async function resolveCompanyTimezone(companyId: number): Promise<string> {
  const db = getDb();
  const service = new ApReconciliationService(db);
  return service.resolveCompanyTimezone({ companyId });
}

export async function getAPReconciliationAccountIds(companyId: number): Promise<number[] | null> {
  const db = getDb();
  const service = new ApReconciliationService(db);
  return service.getAPReconciliationAccountIds(companyId);
}

export async function getAPReconciliationSettings(
  companyId: number
): Promise<APReconciliationSettings> {
  const db = getDb();
  const service = new ApReconciliationService(db);
  return service.getAPReconciliationSettings({ companyId } as GetAPReconciliationSettingsParams);
}

export async function validateAPReconciliationAccountIds(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb();
  const service = new ApReconciliationService(db);
  return service.validateAPReconciliationAccountIds({ companyId, accountIds } as ValidateAPReconciliationAccountIdsParams);
}

export async function saveAPReconciliationSettings(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb();
  const service = new ApReconciliationService(db);
  return service.saveAPReconciliationSettings({ companyId, accountIds } as SaveAPReconciliationSettingsParams);
}

export async function getAPReconciliationSummary(
  companyId: number,
  asOfDate: string
): Promise<APReconciliationSummaryResult> {
  const db = getDb();
  const service = new ApReconciliationService(db);
  return service.getAPReconciliationSummary({ companyId, asOfDate } as GetAPReconciliationSummaryParams);
}
