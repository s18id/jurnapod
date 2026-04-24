// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Drilldown API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import {
  ApReconciliationDrilldownService,
  buildDrilldownAttribution,
  generateDrilldownCSV,
  APReconciliationSettingsRequiredError,
} from "@jurnapod/modules-purchasing";
import type {
  GLDetailResult,
  APDetailResult,
  DrilldownResult,
  GLDetailLine,
  APDetailLine,
  DrilldownLineItem,
  DrilldownCategorySummary,
} from "@jurnapod/modules-purchasing";

// Re-export types for use in routes
export type {
  GLDetailLine,
  APDetailLine,
  DrilldownLineItem,
  DrilldownCategorySummary,
  GLDetailResult,
  APDetailResult,
  DrilldownResult,
};

// Re-export for use in routes
export { buildDrilldownAttribution, generateDrilldownCSV };

export async function getGLDetail(
  companyId: number,
  accountIds: number[],
  asOfDate: string,
  timezone: string,
  cursor?: string,
  limit: number = 100
): Promise<GLDetailResult> {
  const db = getDb();
  const service = new ApReconciliationDrilldownService(db);
  return service.getGLDetail({ companyId, accountIds, asOfDate, timezone, cursor, limit });
}

export async function getAPDetail(
  companyId: number,
  asOfDate: string,
  cursor?: string,
  limit: number = 100
): Promise<APDetailResult> {
  const db = getDb();
  const service = new ApReconciliationDrilldownService(db);
  return service.getAPDetail({ companyId, asOfDate, cursor, limit });
}

export async function getAPReconciliationDrilldown(
  companyId: number,
  asOfDate: string,
  cursor?: string,
  limit: number = 100
): Promise<DrilldownResult> {
  const db = getDb();
  const service = new ApReconciliationDrilldownService(db);
  return service.getAPReconciliationDrilldown({ companyId, asOfDate, cursor, limit });
}
