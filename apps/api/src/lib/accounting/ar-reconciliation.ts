// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AR Reconciliation API adapter.
 *
 * Delegates to @jurnapod/modules-accounting services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import {
  ARReconciliationService,
  ARReconciliationSettingsRequiredError,
  ARReconciliationInvalidAccountError,
  ARReconciliationCrossTenantAccountError,
  ARReconciliationTimezoneRequiredError,
  ARReconciliationError,
  toScaled,
  fromScaled4,
} from "@jurnapod/modules-accounting";
import type {
  ARReconciliationSettings,
  ARReconciliationSummaryResult,
  ARDrilldownResult,
  GetARReconciliationSettingsParams,
  ValidateARReconciliationAccountIdsParams,
  SaveARReconciliationSettingsParams,
  GetARReconciliationSummaryParams,
  GetARReconciliationDrilldownParams,
} from "@jurnapod/modules-accounting";

// Re-export types for use in routes
export type {
  ARReconciliationSettings,
  ARReconciliationSummaryResult,
};

// Re-export error classes for use in routes
export {
  ARReconciliationError,
  ARReconciliationSettingsRequiredError,
  ARReconciliationInvalidAccountError,
  ARReconciliationCrossTenantAccountError,
  ARReconciliationTimezoneRequiredError,
};

export { toScaled, fromScaled4 };

export async function resolveCompanyTimezone(companyId: number): Promise<string> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.resolveCompanyTimezone({ companyId });
}

export async function getARReconciliationAccountIds(companyId: number): Promise<number[] | null> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.getARReconciliationAccountIds(companyId);
}

export async function getARReconciliationSettings(
  companyId: number
): Promise<ARReconciliationSettings> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.getARReconciliationSettings({ companyId } as GetARReconciliationSettingsParams);
}

export async function validateARReconciliationAccountIds(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.validateARReconciliationAccountIds({ companyId, accountIds } as ValidateARReconciliationAccountIdsParams);
}

export async function saveARReconciliationSettings(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.saveARReconciliationSettings({ companyId, accountIds } as SaveARReconciliationSettingsParams);
}

export async function getARReconciliationSummary(
  companyId: number,
  asOfDate: string
): Promise<ARReconciliationSummaryResult> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.getARReconciliationSummary({ companyId, asOfDate } as GetARReconciliationSummaryParams);
}

export async function getARReconciliationDrilldown(
  companyId: number,
  asOfDate: string,
  options?: { documentType?: string; cursor?: string; limit?: number }
): Promise<ARDrilldownResult> {
  const db = getDb();
  const service = new ARReconciliationService(db);
  return service.getARReconciliationDrilldown({
    companyId,
    asOfDate,
    documentType: options?.documentType as "sales_invoice" | "sales_payment" | "sales_credit_note" | undefined,
    cursor: options?.cursor,
    limit: options?.limit,
  } as GetARReconciliationDrilldownParams);
}