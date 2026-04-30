// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Invoice API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import { PurchaseInvoiceService } from "@jurnapod/modules-purchasing";
import type {
  PICreateInput,
  PIListParams,
  PIListResult,
  PIGetResult,
  PIPostResult,
  PIVoidResult,
} from "@jurnapod/modules-purchasing";
// Re-export error classes for backward compatibility with routes
export {
  PIError,
  PINotFoundError,
  PIInvalidStatusTransitionError,
  PIExchangeRateMissingError,
  PIAccountMissingError,
  PICreditLimitExceededError,
  PITaxAccountMissingError,
} from "@jurnapod/modules-purchasing";
import type { AuthContext } from "@/lib/auth-guard.js";
import {
  checkPeriodCloseGuardrail,
  PeriodOverrideReasonInvalidError,
  PeriodOverrideForbiddenError,
  evaluateOverrideAccess,
} from "@/lib/accounting/ap-period-close-guardrail.js";

export async function createDraftPI(
  companyId: number,
  userId: number,
  input: {
    idempotencyKey?: string | null;
    supplierId: number;
    invoiceNo: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    referenceNumber?: string | null;
    currencyCode: string;
    exchangeRate?: string;
    notes?: string | null;
    lines: Array<{
      itemId?: number | null;
      description: string;
      qty: string;
      unitPrice: string;
      taxRateId?: number | null;
      lineType?: "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT";
    }>;
    overrideReason?: string | null;
  },
  auth: AuthContext
): Promise<PIGetResult> {
  const db = getDb();
  const service = new PurchaseInvoiceService(db);

  // Period-close guardrail evaluation (API layer)
  const invoiceDateStr = input.invoiceDate.toISOString().split("T")[0];
  const decision = await checkPeriodCloseGuardrail(companyId, invoiceDateStr);

  let isOverrideEligible = false;
  let trackedOverrideReason: string | null = null;
  if (!decision.allowed && decision.overrideRequired) {
    const access = await evaluateOverrideAccess(auth, input.overrideReason, decision);
    if (!access.allowed) {
      if (access.error === "reason") {
        throw new PeriodOverrideReasonInvalidError(access.message);
      }
      throw new PeriodOverrideForbiddenError(access.message);
    }
    if (decision.periodId === null || decision.periodId <= 0) {
      const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
      err.code = "PERIOD_CLOSED";
      err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
      throw err;
    }
    isOverrideEligible = true;
    trackedOverrideReason = access.overrideReason;
  } else if (!decision.allowed) {
    const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
    err.code = "PERIOD_CLOSED";
    err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
    throw err;
  }

  const serviceInput: PICreateInput = {
    companyId,
    userId,
    idempotencyKey: input.idempotencyKey,
    supplierId: input.supplierId,
    invoiceNo: input.invoiceNo,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    referenceNumber: input.referenceNumber,
    currencyCode: input.currencyCode,
    exchangeRate: input.exchangeRate,
    notes: input.notes,
    lines: input.lines,
  };

  const result = await service.createDraftPI(serviceInput);

  // Note: createDraftPI creates a DRAFT - no journal posting, so period-close guardrail doesn't apply.
  // Guardrail evaluation is only needed for postPI/voidPI which create journal entries.

  return result;
}

export async function listPIs(params: PIListParams): Promise<PIListResult> {
  const db = getDb();
  const service = new PurchaseInvoiceService(db);
  return service.listPIs(params);
}

export async function getPIById(
  companyId: number,
  piId: number
): Promise<PIGetResult | null> {
  const db = getDb();
  const service = new PurchaseInvoiceService(db);
  return service.getPIById(companyId, piId);
}

export async function postPI(
  companyId: number,
  userId: number,
  piId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<PIPostResult> {
  const db = getDb();
  const service = new PurchaseInvoiceService(db);

  // Get PI to check invoice date
  const pi = await db
    .selectFrom("purchase_invoices")
    .where("id", "=", piId)
    .where("company_id", "=", companyId)
    .select(["invoice_date"])
    .executeTakeFirst();

  if (!pi) {
    throw new Error(`Purchase invoice ${piId} not found`);
  }

  const invoiceDateStr = new Date(pi.invoice_date).toISOString().split("T")[0];
  const decision = await checkPeriodCloseGuardrail(companyId, invoiceDateStr);

  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  if (!decision.allowed && decision.overrideRequired) {
    const access = await evaluateOverrideAccess(auth, overrideReason ?? null, decision);
    if (!access.allowed) {
      if (access.error === "reason") {
        throw new PeriodOverrideReasonInvalidError(access.message);
      }
      throw new PeriodOverrideForbiddenError(access.message);
    }
    if (decision.periodId === null || decision.periodId <= 0) {
      const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
      err.code = "PERIOD_CLOSED";
      err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
      throw err;
    }
    isOverrideEligible = true;
    validOverrideReason = access.overrideReason;
  } else if (!decision.allowed) {
    const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
    err.code = "PERIOD_CLOSED";
    err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
    throw err;
  }

  const guardrailDecision = isOverrideEligible ? decision : null;

  const result = await service.postPI({
    companyId,
    userId,
    piId,
    guardrailDecision,
    validOverrideReason,
  });

  return result;
}

export async function voidPI(
  companyId: number,
  userId: number,
  piId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<PIVoidResult> {
  const db = getDb();
  const service = new PurchaseInvoiceService(db);

  const pi = await db
    .selectFrom("purchase_invoices")
    .where("id", "=", piId)
    .where("company_id", "=", companyId)
    .select(["invoice_date"])
    .executeTakeFirst();

  if (!pi) {
    throw new Error(`Purchase invoice ${piId} not found`);
  }

  const invoiceDateStr = new Date(pi.invoice_date).toISOString().split("T")[0];
  const decision = await checkPeriodCloseGuardrail(companyId, invoiceDateStr);

  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  if (!decision.allowed && decision.overrideRequired) {
    const access = await evaluateOverrideAccess(auth, overrideReason ?? null, decision);
    if (!access.allowed) {
      if (access.error === "reason") {
        throw new PeriodOverrideReasonInvalidError(access.message);
      }
      throw new PeriodOverrideForbiddenError(access.message);
    }
    if (decision.periodId === null || decision.periodId <= 0) {
      const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
      err.code = "PERIOD_CLOSED";
      err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
      throw err;
    }
    isOverrideEligible = true;
    validOverrideReason = access.overrideReason;
  } else if (!decision.allowed) {
    const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
    err.code = "PERIOD_CLOSED";
    err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
    throw err;
  }

  const guardrailDecision = isOverrideEligible ? decision : null;

  const result = await service.voidPI({
    companyId,
    userId,
    piId,
    guardrailDecision,
    validOverrideReason,
  });

  return result;
}
