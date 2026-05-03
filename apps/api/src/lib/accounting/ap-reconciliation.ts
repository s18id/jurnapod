// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation API adapter.
 *
 * Delegates to @jurnapod/modules-accounting services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import {
  APReconciliationService,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
  APReconciliationError,
} from "@jurnapod/modules-accounting";
import type {
  APReconciliationSettings,
  APReconciliationSummaryResult,
  APDrilldownResult,
  GetAPReconciliationSettingsParams,
  ValidateAPReconciliationAccountIdsParams,
  SaveAPReconciliationSettingsParams,
  GetAPReconciliationSummaryParams,
  GetAPReconciliationDrilldownParams,
} from "@jurnapod/modules-accounting";

export type { APReconciliationSettings, APReconciliationSummaryResult };

export {
  APReconciliationError,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
};

export async function getAPReconciliationAccountIds(companyId: number): Promise<number[] | null> {
  const db = getDb();
  const service = new APReconciliationService(db);
  return service.getAPReconciliationAccountIds(companyId);
}

export async function getAPReconciliationSettings(companyId: number): Promise<APReconciliationSettings> {
  const db = getDb();
  const service = new APReconciliationService(db);
  return service.getAPReconciliationSettings({ companyId } as GetAPReconciliationSettingsParams);
}

export async function validateAPReconciliationAccountIds(companyId: number, accountIds: number[]): Promise<void> {
  const db = getDb();
  const service = new APReconciliationService(db);
  return service.validateAPReconciliationAccountIds({ companyId, accountIds } as ValidateAPReconciliationAccountIdsParams);
}

export async function saveAPReconciliationSettings(companyId: number, accountIds: number[]): Promise<void> {
  const db = getDb();
  const service = new APReconciliationService(db);
  return service.saveAPReconciliationSettings({ companyId, accountIds } as SaveAPReconciliationSettingsParams);
}

export async function getAPReconciliationSummary(companyId: number, asOfDate: string): Promise<APReconciliationSummaryResult> {
  const db = getDb();
  const service = new APReconciliationService(db);
  return service.getAPReconciliationSummary({ companyId, asOfDate } as GetAPReconciliationSummaryParams);
}

export async function getAPReconciliationDrilldown(
  companyId: number,
  asOfDate: string,
  options?: { documentType?: string; cursor?: string; limit?: number }
): Promise<APDrilldownResult> {
  const db = getDb();
  const service = new APReconciliationService(db);
  return service.getAPReconciliationDrilldown({
    companyId,
    asOfDate,
    documentType: options?.documentType as "purchase_invoice" | "ap_payment" | "purchase_credit" | undefined,
    cursor: options?.cursor,
    limit: options?.limit,
  } as GetAPReconciliationDrilldownParams);
}
