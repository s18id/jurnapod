// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Reconciliation API adapter.
 *
 * Delegates to @jurnapod/modules-accounting services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import {
  InventoryReconciliationService,
  InventoryReconciliationSettingsRequiredError,
  InventoryReconciliationInvalidAccountError,
  InventoryReconciliationCrossTenantAccountError,
  InventoryReconciliationTimezoneRequiredError,
  InventoryReconciliationError,
  toScaled,
  fromScaled4,
} from "@jurnapod/modules-accounting";
import type {
  InventoryReconciliationSettings,
  InventoryReconciliationSummaryResult,
  InventoryDrilldownResult,
  GetInventoryReconciliationSettingsParams,
  ValidateInventoryReconciliationAccountIdsParams,
  SaveInventoryReconciliationSettingsParams,
  GetInventoryReconciliationSummaryParams,
  GetInventoryReconciliationDrilldownParams,
} from "@jurnapod/modules-accounting";

// Re-export types for use in routes
export type {
  InventoryReconciliationSettings,
  InventoryReconciliationSummaryResult,
};

// Re-export error classes for use in routes
export {
  InventoryReconciliationError,
  InventoryReconciliationSettingsRequiredError,
  InventoryReconciliationInvalidAccountError,
  InventoryReconciliationCrossTenantAccountError,
  InventoryReconciliationTimezoneRequiredError,
};

export { toScaled, fromScaled4 };

export async function resolveCompanyTimezone(companyId: number): Promise<string> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.resolveCompanyTimezone({ companyId });
}

export async function getInventoryReconciliationAccountIds(companyId: number): Promise<number[] | null> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.getInventoryReconciliationAccountIds(companyId);
}

export async function getInventoryReconciliationSettings(
  companyId: number
): Promise<InventoryReconciliationSettings> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.getInventoryReconciliationSettings({ companyId } as GetInventoryReconciliationSettingsParams);
}

export async function validateInventoryReconciliationAccountIds(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.validateInventoryReconciliationAccountIds({ companyId, accountIds } as ValidateInventoryReconciliationAccountIdsParams);
}

export async function saveInventoryReconciliationSettings(
  companyId: number,
  accountIds: number[]
): Promise<void> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.saveInventoryReconciliationSettings({ companyId, accountIds } as SaveInventoryReconciliationSettingsParams);
}

export async function getInventoryReconciliationSummary(
  companyId: number,
  asOfDate: string
): Promise<InventoryReconciliationSummaryResult> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.getInventoryReconciliationSummary({ companyId, asOfDate } as GetInventoryReconciliationSummaryParams);
}

export async function getInventoryReconciliationDrilldown(
  companyId: number,
  asOfDate: string,
  options?: { movementType?: string; cursor?: string; limit?: number }
): Promise<InventoryDrilldownResult> {
  const db = getDb();
  const service = new InventoryReconciliationService(db);
  return service.getInventoryReconciliationDrilldown({
    companyId,
    asOfDate,
    movementType: options?.movementType as "receipt" | "adjustment" | "sale" | "transfer" | "refund" | undefined,
    cursor: options?.cursor,
    limit: options?.limit,
  } as GetInventoryReconciliationDrilldownParams);
}