// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * FiscalYearGuard Adapter for Fixed Assets API
 * 
 * Implements the FiscalYearGuard interface from modules-accounting
 * using the API's fiscal year infrastructure.
 */

import type { FiscalYearGuard } from "@jurnapod/modules-accounting";
import { ensureDateWithinOpenFiscalYear } from "@/lib/fiscal-years";

/**
 * ApiFiscalYearGuard
 * 
 * Concrete implementation of FiscalYearGuard for fixed assets.
 * Uses the fiscal years lib to validate dates are within open fiscal years.
 */
export class ApiFiscalYearGuard implements FiscalYearGuard {
  /**
   * Ensure the given date falls within an open fiscal year.
   * Throws FiscalYearNotOpenError if no open fiscal year contains the date.
   */
  async ensureDateWithinOpenFiscalYear(
    companyId: number,
    date: string
  ): Promise<void> {
    await ensureDateWithinOpenFiscalYear(companyId, date);
  }
}

/**
 * Create a singleton instance of ApiFiscalYearGuard.
 */
let instance: ApiFiscalYearGuard | null = null;

export function getFiscalYearGuard(): FiscalYearGuard {
  if (!instance) {
    instance = new ApiFiscalYearGuard();
  }
  return instance;
}
