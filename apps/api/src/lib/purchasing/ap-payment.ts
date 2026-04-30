// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Payment API adapter.
 *
 * Delegates to @jurnapod/modules-purchasing services.
 * This file is a thin adapter — all business logic lives in the package.
 */

import { getDb } from "../db.js";
import { APPaymentService } from "@jurnapod/modules-purchasing";
import type {
  APPaymentCreateInput,
  APPaymentListParams,
  APPaymentListResult,
  APPaymentGetResult,
  APPaymentPostResult,
  APPaymentVoidResult,
} from "@jurnapod/modules-purchasing";
// Re-export error classes for backward compatibility with routes
export {
  APPaymentError,
  APPaymentNotFoundError,
  APPaymentInvalidStatusTransitionError,
  APPaymentOverpaymentError,
  APPaymentBankAccountNotFoundError,
  APPaymentSupplierInactiveError,
  APPaymentInvoiceNotFoundError,
  APPaymentInvoiceNotPostedError,
  APPaymentInvoiceSupplierMismatchError,
  APPaymentJournalNotBalancedError,
  APPaymentMissingAPAccountError,
  APPaymentInvalidAPAccountTypeError,
} from "@jurnapod/modules-purchasing";
import type { AuthContext } from "@/lib/auth-guard.js";
import {
  checkPeriodCloseGuardrail,
  PeriodOverrideReasonInvalidError,
  PeriodOverrideForbiddenError,
  evaluateOverrideAccess,
} from "@/lib/accounting/ap-period-close-guardrail.js";

export async function createDraftAPPayment(
  companyId: number,
  userId: number,
  input: {
    idempotencyKey?: string | null;
    paymentDate: Date;
    bankAccountId: number;
    supplierId: number;
    description?: string | null;
    lines: Array<{
      purchaseInvoiceId: number;
      allocationAmount: string;
      description?: string | null;
    }>;
    overrideReason?: string | null;
  },
  auth: AuthContext
): Promise<APPaymentGetResult> {
  const db = getDb();
  const service = new APPaymentService(db);

  const paymentDateStr = input.paymentDate.toISOString().split("T")[0];
  const decision = await checkPeriodCloseGuardrail(companyId, paymentDateStr);

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

  const serviceInput: APPaymentCreateInput = {
    companyId,
    userId,
    idempotencyKey: input.idempotencyKey,
    paymentDate: input.paymentDate,
    bankAccountId: input.bankAccountId,
    supplierId: input.supplierId,
    description: input.description,
    lines: input.lines,
  };

  const result = await service.createDraftAPPayment(serviceInput);

  // Note: createDraftAPPayment creates a DRAFT - no journal posting, so period-close guardrail doesn't apply.
  // Guardrail evaluation is only needed for postAPPayment/voidAPPayment which create journal entries.

  return result;
}

export async function listAPPayments(
  params: APPaymentListParams
): Promise<APPaymentListResult> {
  const db = getDb();
  const service = new APPaymentService(db);
  return service.listAPPayments(params);
}

export async function getAPPaymentById(
  companyId: number,
  paymentId: number
): Promise<APPaymentGetResult | null> {
  const db = getDb();
  const service = new APPaymentService(db);
  return service.getAPPaymentById(companyId, paymentId);
}

export async function postAPPayment(
  companyId: number,
  userId: number,
  paymentId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<APPaymentPostResult> {
  const db = getDb();
  const service = new APPaymentService(db);

  const paymentDateResult = await db
    .selectFrom("ap_payments")
    .where("id", "=", paymentId)
    .where("company_id", "=", companyId)
    .select(["payment_date"])
    .executeTakeFirst();

  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  let cachedDecision: { periodId: number | null } | null = null;

  if (paymentDateResult) {
    const paymentDateStr = new Date(paymentDateResult.payment_date).toISOString().split("T")[0];
    const decision = await checkPeriodCloseGuardrail(companyId, paymentDateStr);
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

  return service.postAPPayment({
    companyId,
    userId,
    paymentId,
    guardrailDecision,
    validOverrideReason,
  });
}

export async function voidAPPayment(
  companyId: number,
  userId: number,
  paymentId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<APPaymentVoidResult> {
  const db = getDb();
  const service = new APPaymentService(db);

  const paymentDateResult = await db
    .selectFrom("ap_payments")
    .where("id", "=", paymentId)
    .where("company_id", "=", companyId)
    .select(["payment_date"])
    .executeTakeFirst();

  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  let cachedDecision: { periodId: number | null } | null = null;

  if (paymentDateResult) {
    const paymentDateStr = new Date(paymentDateResult.payment_date).toISOString().split("T")[0];
    const decision = await checkPeriodCloseGuardrail(companyId, paymentDateStr);
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

  return service.voidAPPayment({
    companyId,
    userId,
    paymentId,
    guardrailDecision,
    validOverrideReason,
  });
}
