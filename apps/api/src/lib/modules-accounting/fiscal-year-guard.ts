// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * FiscalYearGuard Adapter for Fixed Assets API
 * 
 * Implements the FiscalYearGuard interface from modules-accounting
 * using the API's fiscal year infrastructure.
 */

import type { FiscalYearGuard, FiscalYearContext } from "@jurnapod/modules-accounting";
import { FiscalYearClosedError } from "@jurnapod/modules-accounting";
import { ensureDateWithinOpenFiscalYear, getFiscalYearById } from "@/lib/fiscal-years";

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

  /**
   * Ensures the fiscal year is open for transactions.
   * Throws FiscalYearClosedError if the fiscal year is closed.
   */
  async ensureFiscalYearIsOpen(fiscalYearId: number, ctx: FiscalYearContext): Promise<void> {
    const fiscalYear = await getFiscalYearById(ctx.companyId, fiscalYearId);
    if (!fiscalYear) {
      throw new Error(`Fiscal year ${fiscalYearId} not found`);
    }
    if (fiscalYear.status === "CLOSED") {
      throw new FiscalYearClosedError(fiscalYearId);
    }
  }

  /**
   * Ensures the fiscal year allows updates (not locked or in close process).
   * Currently this is the same as ensureFiscalYearIsOpen but allows for
   * future expansion to handle close-in-progress states.
   * Throws FiscalYearClosedError if the fiscal year is closed.
   */
  async ensureFiscalYearAllowsUpdate(fiscalYearId: number, ctx: FiscalYearContext): Promise<void> {
    const fiscalYear = await getFiscalYearById(ctx.companyId, fiscalYearId);
    if (!fiscalYear) {
      throw new Error(`Fiscal year ${fiscalYearId} not found`);
    }
    if (fiscalYear.status === "CLOSED") {
      throw new FiscalYearClosedError(fiscalYearId);
    }
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
