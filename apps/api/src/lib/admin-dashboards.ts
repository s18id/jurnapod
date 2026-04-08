// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db.js";
import { ReconciliationDashboardService } from "@jurnapod/modules-accounting/reconciliation";
import { TrialBalanceService } from "@jurnapod/modules-accounting/trial-balance";

/**
 * Adapter factory: Reconciliation dashboard service.
 */
export function getReconciliationDashboardService(): ReconciliationDashboardService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ReconciliationDashboardService(getDb() as any);
}

/**
 * Adapter factory: Trial balance service.
 */
export function getTrialBalanceService(): TrialBalanceService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new TrialBalanceService(getDb() as any);
}
