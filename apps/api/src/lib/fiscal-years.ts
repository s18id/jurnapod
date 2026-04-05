// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fiscal Year API Adapter
 * 
 * Thin adapter layer that bridges the API to the fiscal-year domain service
 * in @jurnapod/modules-accounting.
 * 
 * This file re-exports domain types/errors from the package and provides
 * backward-compatible wrapper functions that use getDb() internally.
 */

import type { KyselySchema } from "@jurnapod/db";
import type {
  FiscalYear,
  FiscalYearCreateRequest,
  FiscalYearListQuery,
  FiscalYearUpdateRequest
} from "@jurnapod/shared";
import { getDb } from "./db.js";
import { KyselySettingsAdapter } from "@jurnapod/modules-platform/settings";
import { formatDateOnlyFromUnknown } from "./shared/common-utils.js";

import {
  FiscalYearService,
  type FiscalYearSettingsPort,
  type FiscalYearDbClient,
  type CloseFiscalYearContext,
  type CloseFiscalYearResult,
  type ClosePreviewResult,
  type FiscalYearStatusResult,
  FISCAL_YEAR_CLOSE_STATUS,
  type FiscalYearCloseStatus,
  type ClosingEntryLine,
  type PeriodStatus,
  // Re-export errors from package
  FiscalYearNotFoundError,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearOverlapError,
  FiscalYearOpenConflictError,
  FiscalYearNotOpenError,
  FiscalYearSelectionError,
  FiscalYearAlreadyClosedError,
  FiscalYearCloseConflictError,
  FiscalYearClosePreconditionError,
  FiscalYearClosePreviewError,
  RetainedEarningsAccountNotFoundError
} from "@jurnapod/modules-accounting/fiscal-year";

// Re-export types from package
export {
  type CloseFiscalYearContext,
  type CloseFiscalYearResult,
  type ClosePreviewResult,
  type FiscalYearStatusResult,
  FISCAL_YEAR_CLOSE_STATUS,
  type FiscalYearCloseStatus,
  type ClosingEntryLine,
  type PeriodStatus
} from "@jurnapod/modules-accounting/fiscal-year";

// Re-export errors from package
export {
  FiscalYearNotFoundError,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearOverlapError,
  FiscalYearOpenConflictError,
  FiscalYearNotOpenError,
  FiscalYearSelectionError,
  FiscalYearAlreadyClosedError,
  FiscalYearCloseConflictError,
  FiscalYearClosePreconditionError,
  FiscalYearClosePreviewError,
  RetainedEarningsAccountNotFoundError
} from "@jurnapod/modules-accounting/fiscal-year";

// Create a settings port implementation using KyselySettingsAdapter
function createSettingsPort(db: KyselySchema): FiscalYearSettingsPort {
  const adapter = new KyselySettingsAdapter(db);
  return {
    async resolveBoolean(
      companyId: number,
      key: string,
      options?: { outletId?: number }
    ): Promise<boolean> {
      const value = await adapter.resolve<boolean>(companyId, key as any, {
        outletId: options?.outletId
      });
      return Boolean(value);
    }
  };
}

// Create a service instance getter (per-call factory)
function createFiscalYearService(): FiscalYearService {
  const db = getDb();
  const settings = createSettingsPort(db);
  return new FiscalYearService(db as FiscalYearDbClient, settings);
}

// Wrapper functions that provide backward-compatible API

export async function listFiscalYears(query: FiscalYearListQuery): Promise<FiscalYear[]> {
  return createFiscalYearService().listFiscalYears(query);
}

export async function getFiscalYearById(
  companyId: number,
  fiscalYearId: number
): Promise<FiscalYear | null> {
  return createFiscalYearService().getFiscalYearById(companyId, fiscalYearId);
}

export async function createFiscalYear(
  input: FiscalYearCreateRequest,
  actorUserId?: number
): Promise<FiscalYear> {
  return createFiscalYearService().createFiscalYear(input, actorUserId);
}

export async function updateFiscalYear(
  companyId: number,
  fiscalYearId: number,
  input: FiscalYearUpdateRequest,
  actorUserId?: number
): Promise<FiscalYear | null> {
  return createFiscalYearService().updateFiscalYear(companyId, fiscalYearId, input, actorUserId);
}

export async function listOpenFiscalYearsForDate(
  companyId: number,
  date: string
): Promise<FiscalYear[]> {
  return createFiscalYearService().listOpenFiscalYearsForDate(companyId, date);
}

export async function ensureDateWithinOpenFiscalYear(
  companyId: number,
  date: string
): Promise<void> {
  return createFiscalYearService().ensureDateWithinOpenFiscalYear(companyId, date);
}

export async function ensureDateWithinOpenFiscalYearWithExecutor(
  db: KyselySchema,
  companyId: number,
  date: string
): Promise<void> {
  const service = new FiscalYearService(db as FiscalYearDbClient, createSettingsPort(db));
  return service.ensureDateWithinOpenFiscalYearWithExecutor(db as FiscalYearDbClient, companyId, date);
}

export async function resolveDefaultFiscalYearDateRange(
  companyId: number,
  referenceDate?: string
): Promise<{ dateFrom: string; dateTo: string }> {
  return createFiscalYearService().resolveDefaultFiscalYearDateRange(companyId, referenceDate);
}

export async function isFiscalYearClosed(
  db: KyselySchema,
  companyId: number,
  fiscalYearId: number
): Promise<boolean> {
  const service = new FiscalYearService(db as FiscalYearDbClient, createSettingsPort(db));
  return service.isFiscalYearClosed(companyId, fiscalYearId);
}

export async function closeFiscalYear(
  db: KyselySchema,
  fiscalYearId: number,
  closeRequestId: string,
  context: CloseFiscalYearContext,
  trx?: KyselySchema
): Promise<CloseFiscalYearResult> {
  const service = new FiscalYearService(db as FiscalYearDbClient, createSettingsPort(db));
  return service.closeFiscalYear(fiscalYearId, closeRequestId, context, trx as FiscalYearDbClient);
}

export async function getFiscalYearClosePreview(
  companyId: number,
  fiscalYearId: number,
  dbOrTrx?: KyselySchema
): Promise<ClosePreviewResult> {
  const db = dbOrTrx ?? getDb();
  const service = new FiscalYearService(db as FiscalYearDbClient, createSettingsPort(db));
  return service.getFiscalYearClosePreview(companyId, fiscalYearId);
}

export async function getFiscalYearStatus(
  companyId: number,
  fiscalYearId: number
): Promise<FiscalYearStatusResult> {
  return createFiscalYearService().getFiscalYearStatus(companyId, fiscalYearId);
}
