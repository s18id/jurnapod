// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reconciliation Service Adapter
 * 
 * Thin API adapter that delegates to the accounting package.
 * This file exists for backward compatibility while the core logic
 * resides in @jurnapod/modules-accounting.
 */

export type {
  ReconciliationFindingType,
  ReconciliationFinding,
  ReconciliationCounts,
  ReconciliationResult,
  ReconciliationOptions
} from "@jurnapod/modules-accounting";

import { 
  ReconciliationService as AccountingReconciliationService,
  type ReconciliationOptions,
  type ReconciliationResult,
  type ReconciliationCounts
} from "@jurnapod/modules-accounting";
import { getDb } from "./db";

/**
 * Thin adapter that delegates to the accounting package implementation.
 */
export class ReconciliationService {
  private readonly service: AccountingReconciliationService;

  constructor() {
    const db = getDb();
    this.service = new AccountingReconciliationService(db);
  }

  /**
   * Run reconciliation check for POS transactions vs journal batches.
   * This is deterministic and rerunnable without side effects.
   */
  async reconcile(options: ReconciliationOptions): Promise<ReconciliationResult> {
    return this.service.reconcile(options);
  }

  /**
   * Get reconciliation counts only (lighter weight than full reconcile with findings).
   */
  async getCounts(options: ReconciliationOptions): Promise<ReconciliationCounts> {
    return this.service.getCounts(options);
  }
}
