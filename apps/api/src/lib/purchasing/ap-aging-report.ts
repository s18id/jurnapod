// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Aging Report API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import { ApAgingReportService } from "@jurnapod/modules-purchasing";
import type {
  APAgingSummary,
  APAgingSupplierDetail,
  GetAPAgingSummaryParams,
  GetAPAgingSupplierDetailParams,
} from "@jurnapod/modules-purchasing";

export async function getAPAgingSummary(
  companyId: number,
  asOfDate: string
): Promise<APAgingSummary> {
  const db = getDb();
  const service = new ApAgingReportService(db);
  return service.getAPAgingSummary({ companyId, asOfDate } as GetAPAgingSummaryParams);
}

export async function getAPAgingSupplierDetail(
  companyId: number,
  supplierId: number,
  asOfDate: string
): Promise<APAgingSupplierDetail | null> {
  const db = getDb();
  const service = new ApAgingReportService(db);
  return service.getAPAgingSupplierDetail({ companyId, supplierId, asOfDate } as GetAPAgingSupplierDetailParams);
}
