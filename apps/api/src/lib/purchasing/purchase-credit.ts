// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Credit API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import { PurchaseCreditService } from "@jurnapod/modules-purchasing";
import type {
  PurchaseCreditCreateInput,
  PurchaseCreditListParams,
  PurchaseCreditListResult,
  PurchaseCreditGetResult,
  PurchaseCreditApplyResult,
  PurchaseCreditVoidResult,
} from "@jurnapod/modules-purchasing";
// Re-export error classes for backward compatibility with routes
export {
  PurchaseCreditError,
  PurchaseCreditNotFoundError,
  PurchaseCreditInvalidStatusTransitionError,
  PurchaseCreditSupplierInactiveError,
  PurchaseCreditInvoiceNotFoundError,
  PurchaseCreditInvoiceNotPostedError,
  PurchaseCreditInvoiceSupplierMismatchError,
  PurchaseCreditMissingAPAccountError,
  PurchaseCreditMissingExpenseAccountError,
  PurchaseCreditInvalidAPAccountTypeError,
  PurchaseCreditInvalidExpenseAccountTypeError,
  PurchaseCreditNoApplicableInvoiceError,
  PurchaseCreditJournalNotBalancedError,
} from "@jurnapod/modules-purchasing";
import type { AuthContext } from "@/lib/auth-guard.js";
import {
  checkPeriodCloseGuardrail,
  PeriodOverrideReasonInvalidError,
  PeriodOverrideForbiddenError,
  evaluateOverrideAccess,
} from "@/lib/accounting/ap-period-close-guardrail.js";

export async function createDraftPurchaseCredit(
  companyId: number,
  userId: number,
  input: {
    idempotencyKey?: string | null;
    supplierId: number;
    creditNo: string;
    creditDate: Date;
    description?: string | null;
    lines: Array<{
      purchaseInvoiceId?: number | null;
      purchaseInvoiceLineId?: number | null;
      itemId?: number | null;
      description?: string | null;
      qty: string;
      unitPrice: string;
      reason?: string | null;
    }>;
    overrideReason?: string | null;
  },
  auth: AuthContext
): Promise<PurchaseCreditGetResult> {
  const db = getDb();
  const service = new PurchaseCreditService(db);

  const creditDateStr = input.creditDate.toISOString().split("T")[0];
  const decision = await checkPeriodCloseGuardrail(companyId, creditDateStr);

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

  const serviceInput: PurchaseCreditCreateInput = {
    companyId,
    userId,
    idempotencyKey: input.idempotencyKey,
    supplierId: input.supplierId,
    creditNo: input.creditNo,
    creditDate: input.creditDate,
    description: input.description,
    lines: input.lines,
  };

  const result = await service.createDraftPurchaseCredit(serviceInput);

  // Note: createDraftPurchaseCredit creates a DRAFT - no journal posting, so period-close guardrail doesn't apply.
  // Guardrail evaluation is only needed for applyPurchaseCredit/voidPurchaseCredit which create journal entries.

  return result;
}

export async function listPurchaseCredits(
  params: PurchaseCreditListParams
): Promise<PurchaseCreditListResult> {
  const db = getDb();
  const service = new PurchaseCreditService(db);
  return service.listPurchaseCredits(params);
}

export async function getPurchaseCreditById(
  companyId: number,
  creditId: number
): Promise<PurchaseCreditGetResult | null> {
  const db = getDb();
  const service = new PurchaseCreditService(db);
  return service.getPurchaseCreditById(companyId, creditId);
}

export async function applyPurchaseCredit(
  companyId: number,
  userId: number,
  creditId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<PurchaseCreditApplyResult> {
  const db = getDb();
  const service = new PurchaseCreditService(db);

  const creditForDate = await db
    .selectFrom("purchase_credits")
    .where("id", "=", creditId)
    .where("company_id", "=", companyId)
    .select(["credit_date"])
    .executeTakeFirst();

  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  let cachedDecision: { periodId: number | null } | null = null;

  if (creditForDate) {
    const creditDateStr = new Date(creditForDate.credit_date).toISOString().split("T")[0];
    const decision = await checkPeriodCloseGuardrail(companyId, creditDateStr);
    cachedDecision = { periodId: decision.periodId };

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
  }

  const guardrailDecision = isOverrideEligible && cachedDecision
    ? { allowed: false, overrideRequired: true, periodId: cachedDecision.periodId, blockReason: null, blockCode: null }
    : null;

  return service.applyPurchaseCredit({
    companyId,
    userId,
    creditId,
    guardrailDecision,
    validOverrideReason,
  });
}

export async function voidPurchaseCredit(
  companyId: number,
  userId: number,
  creditId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<PurchaseCreditVoidResult> {
  const db = getDb();
  const service = new PurchaseCreditService(db);

  const creditForDate = await db
    .selectFrom("purchase_credits")
    .where("id", "=", creditId)
    .where("company_id", "=", companyId)
    .select(["credit_date"])
    .executeTakeFirst();

  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  let cachedDecision: { periodId: number | null } | null = null;

  if (creditForDate) {
    const creditDateStr = new Date(creditForDate.credit_date).toISOString().split("T")[0];
    const decision = await checkPeriodCloseGuardrail(companyId, creditDateStr);
    cachedDecision = { periodId: decision.periodId };

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
  }

  const guardrailDecision = isOverrideEligible && cachedDecision
    ? { allowed: false, overrideRequired: true, periodId: cachedDecision.periodId, blockReason: null, blockCode: null }
    : null;

  return service.voidPurchaseCredit({
    companyId,
    userId,
    creditId,
    guardrailDecision,
    validOverrideReason,
  });
}
