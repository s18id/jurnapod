// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Service
 * 
 * Payment orchestration service for the sales module.
 * Handles payment CRUD operations and lifecycle management.
 * 
 * IMPORTANT: This service does NOT import @/lib/auth or @/lib/db directly.
 * ACL checks are performed via the injected AccessScopeChecker interface.
 * Database access is performed via the injected SalesDb interface.
 */

import { toMysqlDateTime, toMysqlDateTimeFromDateLike } from "@jurnapod/shared";
import type { AccessScopeChecker } from "../interfaces/access-scope-checker.js";
import {
  SalesPermissions
} from "../interfaces/access-scope-checker.js";
import type { PaymentPostingHook } from "../interfaces/payment-posting-hook.js";
import type {
  SalesPayment,
  SalesPaymentSplit,
  CreatePaymentInput,
  UpdatePaymentInput,
  PostPaymentInput,
  PaymentListFilters,
  MutationActor,
  CanonicalPaymentInput
} from "../types/payments.js";
import { PaymentStatusError, PaymentAllocationError } from "../types/payments.js";
import type { SalesDb, SalesDbExecutor } from "./sales-db.js";

// =============================================================================
// Error Classes
// =============================================================================

export class DatabaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConflictError";
  }
}

export class DatabaseReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseReferenceError";
  }
}

// =============================================================================
// Money Helpers (internal to module)
// =============================================================================

const MONEY_SCALE = 100;

// Type guard for MySQL errors
function isMysqlError(error: unknown): error is { errno?: number; code?: string } {
  return typeof error === "object" && error !== null && "errno" in error;
}

function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function hasMoreThanTwoDecimals(value: number): boolean {
  const str = value.toFixed(10);
  const decimalPart = str.split(".")[1];
  if (!decimalPart) return false;
  return decimalPart.slice(2).split("").some((d) => d !== "0");
}

// =============================================================================
// Payment Service Interface
// =============================================================================

export interface PaymentService {
  createPayment(
    companyId: number,
    input: CreatePaymentInput,
    actor?: MutationActor
  ): Promise<SalesPayment>;

  getPayment(
    companyId: number,
    paymentId: number,
    actor?: MutationActor
  ): Promise<SalesPayment | null>;

  updatePayment(
    companyId: number,
    paymentId: number,
    input: UpdatePaymentInput,
    actor?: MutationActor
  ): Promise<SalesPayment | null>;

  listPayments(
    companyId: number,
    filters: PaymentListFilters
  ): Promise<{ total: number; payments: SalesPayment[] }>;

  postPayment(
    companyId: number,
    paymentId: number,
    actor?: MutationActor,
    options?: PostPaymentInput
  ): Promise<SalesPayment | null>;
}

export interface PaymentServiceDeps {
  db: SalesDb;
  accessScopeChecker: AccessScopeChecker;
  postingHook?: PaymentPostingHook;
}

// =============================================================================
// Idempotency Helpers
// =============================================================================

// Patch A: Normalize datetimes for idempotency comparison.
// Mirrors the API's payment-allocation.ts logic exactly.
function normalizeIncomingDatetimeForCompare(paymentAt: string): string {
  const persistedValue = toMysqlDateTime(paymentAt);
  const localInterpreted = new Date(persistedValue.replace(" ", "T"));
  if (Number.isNaN(localInterpreted.getTime())) {
    throw new Error("Invalid datetime");
  }
  return toMysqlDateTime(localInterpreted.toISOString());
}

function normalizeExistingDatetimeForCompare(paymentAt: string): string {
  return toMysqlDateTimeFromDateLike(paymentAt);
}

function buildCanonicalInput(
  input: CreatePaymentInput
): CanonicalPaymentInput {
  const hasSplits = input.splits && input.splits.length > 0;
  const effectiveAccountId = hasSplits ? input.splits![0].account_id : input.account_id!;
  const splits = hasSplits
    ? input.splits!.map(s => ({ account_id: s.account_id, amount_minor: Math.round(s.amount * 100) }))
    : [{ account_id: effectiveAccountId, amount_minor: Math.round(input.amount * 100) }];

  return {
    outlet_id: input.outlet_id,
    invoice_id: input.invoice_id,
    payment_at: normalizeIncomingDatetimeForCompare(input.payment_at),
    amount_minor: Math.round(input.amount * 100),
    account_id: effectiveAccountId,
    splits
  };
}

function buildCanonicalFromExisting(payment: SalesPayment): CanonicalPaymentInput {
  const splits = payment.splits && payment.splits.length > 0
    ? payment.splits.map(s => ({ account_id: s.account_id, amount_minor: Math.round(s.amount * 100) }))
    : [{ account_id: payment.account_id, amount_minor: Math.round(payment.amount * 100) }];

  return {
    outlet_id: payment.outlet_id,
    invoice_id: payment.invoice_id,
    payment_at: normalizeExistingDatetimeForCompare(payment.payment_at),
    amount_minor: Math.round(payment.amount * 100),
    account_id: payment.account_id,
    splits
  };
}

function canonicalPaymentsEqual(a: CanonicalPaymentInput, b: CanonicalPaymentInput): boolean {
  if (a.outlet_id !== b.outlet_id) return false;
  if (a.invoice_id !== b.invoice_id) return false;
  if (a.payment_at !== b.payment_at) return false;
  if (a.amount_minor !== b.amount_minor) return false;
  if (a.account_id !== b.account_id) return false;
  if (a.splits.length !== b.splits.length) return false;

  for (let i = 0; i < a.splits.length; i++) {
    if (a.splits[i].account_id !== b.splits[i].account_id) return false;
    if (a.splits[i].amount_minor !== b.splits[i].amount_minor) return false;
  }

  return true;
}

// =============================================================================
// Payment Service Factory
// =============================================================================

export function createPaymentService(deps: PaymentServiceDeps): PaymentService {
  const { db, accessScopeChecker, postingHook } = deps;

  async function withTransaction<T>(operation: (executor: SalesDbExecutor) => Promise<T>): Promise<T> {
    return db.withTransaction(operation);
  }

  async function ensureOutletExists(executor: SalesDbExecutor, companyId: number, outletId: number): Promise<void> {
    const exists = await executor.outletExists(companyId, outletId);
    if (!exists) {
      throw new DatabaseReferenceError("Outlet not found");
    }
  }

  async function ensureAccountIsPayable(executor: SalesDbExecutor, companyId: number, accountId: number): Promise<void> {
    const isPayable = await executor.accountIsPayable(companyId, accountId);
    if (!isPayable) {
      throw new DatabaseReferenceError("Account not found or not payable");
    }
  }

  function attachSplitsToPayment(
    payment: SalesPayment,
    splits: SalesPaymentSplit[]
  ): SalesPayment {
    return { ...payment, splits };
  }

  // =============================================================================
  // Public API
  // =============================================================================

  async function createPayment(
    companyId: number,
    input: CreatePaymentInput,
    actor?: MutationActor
  ): Promise<SalesPayment> {
    return withTransaction(async (executor) => {
      // Phase 8: Handle splits - determine effective account_id and validate splits
      const hasSplits = input.splits && input.splits.length > 0;
      let effectiveAccountId: number;
      let splitData: Array<{ account_id: number; amount: number }> = [];

      if (hasSplits) {
        // Validate splits
        if (input.splits!.length > 10) {
          throw new PaymentAllocationError("Maximum 10 splits allowed");
        }

        const accountIds = input.splits!.map(s => s.account_id);
        if (new Set(accountIds).size !== accountIds.length) {
          throw new PaymentAllocationError("Duplicate account_ids not allowed in splits");
        }

        if (hasMoreThanTwoDecimals(input.amount)) {
          throw new PaymentAllocationError("Amount must have at most 2 decimal places");
        }
        for (const split of input.splits!) {
          if (hasMoreThanTwoDecimals(split.amount)) {
            throw new PaymentAllocationError("Split amount must have at most 2 decimal places");
          }
        }

        const splitSumMinor = input.splits!.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
        const amountMinor = Math.round(input.amount * 100);
        if (splitSumMinor !== amountMinor) {
          throw new PaymentAllocationError("Sum of split amounts must equal payment amount");
        }

        // Validate each split account is payable and belongs to company
        for (const split of input.splits!) {
          await ensureAccountIsPayable(executor, companyId, split.account_id);
        }

        effectiveAccountId = input.splits![0].account_id;
        splitData = input.splits!;

        if (input.account_id !== undefined && input.account_id !== effectiveAccountId) {
          throw new PaymentAllocationError("Header account_id must equal splits[0].account_id");
        }

        if (typeof input.actual_amount_idr === "number") {
          if (Math.round(input.actual_amount_idr * 100) !== Math.round(input.amount * 100)) {
            throw new PaymentAllocationError("When splits are provided, actual_amount_idr must equal amount");
          }
        }
      } else {
        if (input.account_id === undefined) {
          throw new DatabaseReferenceError("account_id is required when splits not provided");
        }

        if (hasMoreThanTwoDecimals(input.amount)) {
          throw new PaymentAllocationError("Amount must have at most 2 decimal places");
        }

        effectiveAccountId = input.account_id;
        splitData = [{ account_id: effectiveAccountId, amount: input.amount }];
      }

      // Check for idempotency via client_ref
      if (input.client_ref) {
        const existing = await executor.findPaymentByClientRef(companyId, input.client_ref);
        if (existing) {
          if (actor) {
            await accessScopeChecker.assertOutletAccess({
              actorUserId: actor.userId,
              companyId,
              outletId: existing.outlet_id,
              permission: SalesPermissions.READ_PAYMENT
            });
          }

          const existingSplits = await executor.findPaymentSplits(companyId, existing.id);
          const existingForCompare = existingSplits.length > 0
            ? attachSplitsToPayment(existing, existingSplits)
            : existing;

          // Enforce idempotency contract - compare canonical payloads
          const incomingCanonical = buildCanonicalInput(input);
          const existingCanonical = buildCanonicalFromExisting(existingForCompare);

          if (!canonicalPaymentsEqual(incomingCanonical, existingCanonical)) {
            throw new DatabaseConflictError("Idempotency conflict: payload mismatch");
          }

          return existingForCompare;
        }
      }

      await ensureOutletExists(executor, companyId, input.outlet_id);
      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: input.outlet_id,
          permission: SalesPermissions.CREATE_PAYMENT
        });
      }

      // P1: Validate invoice exists and belongs to same outlet
      const invoice = await executor.findInvoiceById(companyId, input.invoice_id);
      if (!invoice) {
        throw new DatabaseReferenceError("Invoice not found");
      }
      const invoiceData = invoice as { outlet_id?: number };
      if (invoiceData.outlet_id !== input.outlet_id) {
        throw new DatabaseReferenceError("Invoice outlet mismatch");
      }

      await ensureAccountIsPayable(executor, companyId, effectiveAccountId);

      const amount = normalizeMoney(input.amount);
      const effectivePaymentAmount = normalizeMoney(input.actual_amount_idr ?? input.amount);

      const paymentNo = await executor.getNextDocumentNumber(
        companyId,
        input.outlet_id,
        "SALES_PAYMENT",
        input.payment_no
      );

      let paymentId: number;
      try {
        paymentId = await executor.insertPayment({
          companyId,
          outletId: input.outlet_id,
          invoiceId: input.invoice_id,
          paymentNo,
          clientRef: input.client_ref,
          paymentAt: toMysqlDateTime(input.payment_at),
          accountId: effectiveAccountId,
          method: input.method,
          status: "DRAFT",
          amount,
          paymentAmountIdr: effectivePaymentAmount,
          createdByUserId: actor?.userId
        });
      } catch (error) {
        // P2: Handle duplicate key error for race condition on client_ref
        if (isMysqlError(error) && error.errno === 1062 && input.client_ref) {
          const existing = await executor.findPaymentByClientRef(companyId, input.client_ref);
          if (existing) {
            const existingSplits = await executor.findPaymentSplits(companyId, existing.id);
            const existingForCompare = existingSplits.length > 0
              ? attachSplitsToPayment(existing, existingSplits)
              : existing;

            const incomingCanonical = buildCanonicalInput(input);
            const existingCanonical = buildCanonicalFromExisting(existingForCompare);
            if (!canonicalPaymentsEqual(incomingCanonical, existingCanonical)) {
              throw new DatabaseConflictError("Idempotency conflict: payload mismatch");
            }
            if (actor) {
              await accessScopeChecker.assertOutletAccess({
                actorUserId: actor.userId,
                companyId,
                outletId: existing.outlet_id,
                permission: SalesPermissions.READ_PAYMENT
              });
            }
            return existingForCompare;
          }
          throw new DatabaseConflictError("Duplicate payment");
        }
        throw error;
      }

      // Phase 8: Insert split rows
      for (let i = 0; i < splitData.length; i++) {
        const split = splitData[i];
        await executor.insertPaymentSplit({
          paymentId,
          companyId,
          outletId: input.outlet_id,
          splitIndex: i,
          accountId: split.account_id,
          amount: normalizeMoney(split.amount)
        });
      }

      const payment = await executor.findPaymentById(companyId, paymentId);
      if (!payment) {
        throw new Error("Created payment not found");
      }

      const splits = await executor.findPaymentSplits(companyId, paymentId);
      if (splits.length > 0) {
        return attachSplitsToPayment(payment, splits);
      }
      return payment;
    });
  }

  async function getPayment(
    companyId: number,
    paymentId: number,
    actor?: MutationActor
  ): Promise<SalesPayment | null> {
    const executor = db.executor;
    const payment = await executor.findPaymentById(companyId, paymentId);
    if (!payment) {
      return null;
    }

    if (actor) {
      await accessScopeChecker.assertOutletAccess({
        actorUserId: actor.userId,
        companyId,
        outletId: payment.outlet_id,
        permission: SalesPermissions.READ_PAYMENT
      });
    }

    const splits = await executor.findPaymentSplits(companyId, paymentId);
    if (splits.length > 0) {
      return attachSplitsToPayment(payment, splits);
    }
    return payment;
  }

  async function updatePayment(
    companyId: number,
    paymentId: number,
    input: UpdatePaymentInput,
    actor?: MutationActor
  ): Promise<SalesPayment | null> {
    return withTransaction(async (executor) => {
      const current = await executor.findPaymentById(companyId, paymentId, true);
      if (!current) {
        return null;
      }

      if (current.status === "VOID") {
        throw new PaymentStatusError("Cannot modify a voided payment");
      }

      if (current.status !== "DRAFT") {
        throw new PaymentStatusError("Payment is not editable");
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: current.outlet_id,
          permission: SalesPermissions.UPDATE_PAYMENT
        });
      }

      if (typeof input.outlet_id === "number") {
        await ensureOutletExists(executor, companyId, input.outlet_id);
        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: input.outlet_id,
            permission: SalesPermissions.UPDATE_PAYMENT
          });
        }
      }

      // P2: Validate invoice when invoice_id or outlet_id is being changed
      const nextOutletId = input.outlet_id ?? current.outlet_id;
      const nextInvoiceId = input.invoice_id ?? current.invoice_id;
      if (typeof input.invoice_id === "number" || typeof input.outlet_id === "number") {
        const invoice = await executor.findInvoiceById(companyId, nextInvoiceId);
        if (!invoice) {
          throw new DatabaseReferenceError("Invoice not found");
        }
        const invoiceData = invoice as { outlet_id?: number };
        if (invoiceData.outlet_id !== nextOutletId) {
          throw new DatabaseReferenceError("Invoice outlet mismatch");
        }
      }

      // Phase 8: Handle splits update
      const hasSplits = input.splits && input.splits.length > 0;
      let nextAccountId = input.account_id ?? current.account_id;
      let nextAmount = typeof input.amount === "number" ? normalizeMoney(input.amount) : current.amount;
      let nextPaymentAmountIdr = typeof input.actual_amount_idr === "number" 
        ? normalizeMoney(input.actual_amount_idr) 
        : current.payment_amount_idr ?? current.amount;

      if (hasSplits) {
        if (input.splits!.length > 10) {
          throw new PaymentAllocationError("Maximum 10 splits allowed");
        }

        const accountIds = input.splits!.map(s => s.account_id);
        if (new Set(accountIds).size !== accountIds.length) {
          throw new PaymentAllocationError("Duplicate account_ids not allowed in splits");
        }

        if (typeof input.amount === "number" && hasMoreThanTwoDecimals(input.amount)) {
          throw new PaymentAllocationError("Amount must have at most 2 decimal places");
        }
        for (const split of input.splits!) {
          if (hasMoreThanTwoDecimals(split.amount)) {
            throw new PaymentAllocationError("Split amount must have at most 2 decimal places");
          }
        }

        const splitSumMinor = input.splits!.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
        if (typeof input.amount === "number") {
          const nextAmountMinor = Math.round(nextAmount * 100);
          if (splitSumMinor !== nextAmountMinor) {
            throw new PaymentAllocationError("Sum of split amounts must equal payment amount");
          }
        } else {
          nextAmount = normalizeMoney(splitSumMinor / 100);
        }

        for (const split of input.splits!) {
          await ensureAccountIsPayable(executor, companyId, split.account_id);
        }

        nextAccountId = input.splits![0].account_id;

        if (input.account_id !== undefined && input.account_id !== nextAccountId) {
          throw new PaymentAllocationError("Header account_id must equal splits[0].account_id");
        }

        if (typeof input.actual_amount_idr === "number") {
          const actualMinor = Math.round(input.actual_amount_idr * 100);
          const effectiveAmountMinor = Math.round(nextAmount * 100);
          if (actualMinor !== effectiveAmountMinor) {
            throw new PaymentAllocationError("When splits are provided, actual_amount_idr must equal amount");
          }
        }

        nextPaymentAmountIdr = nextAmount;
      } else {
        if (typeof input.amount === "number" && hasMoreThanTwoDecimals(input.amount)) {
          throw new PaymentAllocationError("Amount must have at most 2 decimal places");
        }
      }

      if (!hasSplits && typeof input.account_id === "number") {
        await ensureAccountIsPayable(executor, companyId, input.account_id);
      }

      const nextPaymentNo = input.payment_no ?? current.payment_no;
      const nextPaymentAt = input.payment_at ?? current.payment_at;
      const nextMethod = input.method ?? current.method;

      await executor.updatePayment({
        companyId,
        paymentId,
        outletId: nextOutletId,
        invoiceId: nextInvoiceId,
        paymentNo: nextPaymentNo,
        paymentAt: nextPaymentAt,
        accountId: nextAccountId,
        method: nextMethod,
        amount: nextAmount,
        paymentAmountIdr: nextPaymentAmountIdr,
        updatedByUserId: actor?.userId
      });

      if (hasSplits) {
        await executor.deletePaymentSplits(companyId, paymentId);

        for (let i = 0; i < input.splits!.length; i++) {
          const split = input.splits![i];
          await executor.insertPaymentSplit({
            paymentId,
            companyId,
            outletId: nextOutletId,
            splitIndex: i,
            accountId: split.account_id,
            amount: normalizeMoney(split.amount)
          });
        }
      }

      const payment = await executor.findPaymentById(companyId, paymentId);
      if (!payment) {
        return null;
      }

      const splits = await executor.findPaymentSplits(companyId, paymentId);
      if (splits.length > 0) {
        return attachSplitsToPayment(payment, splits);
      }
      return payment;
    });
  }

  async function listPayments(
    companyId: number,
    filters: PaymentListFilters
  ): Promise<{ total: number; payments: SalesPayment[] }> {
    const executor = db.executor;
    return executor.listPayments(companyId, filters);
  }

  async function postPayment(
    companyId: number,
    paymentId: number,
    actor?: MutationActor,
    options?: PostPaymentInput
  ): Promise<SalesPayment | null> {
    return withTransaction(async (executor) => {
      const payment = await executor.findPaymentById(companyId, paymentId, true);
      if (!payment) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: payment.outlet_id,
          permission: SalesPermissions.POST_PAYMENT
        });
      }

      if (payment.status === "POSTED") {
        return executor.findPaymentById(companyId, paymentId);
      }

      if (payment.status !== "DRAFT") {
        throw new PaymentStatusError("Payment cannot be posted");
      }

      // Get invoice for validation
      const invoice = await executor.findInvoiceById(companyId, payment.invoice_id, true);
      if (!invoice) {
        throw new PaymentAllocationError("Invoice not found");
      }

      const invoiceData = invoice as { status?: string; grand_total?: number; paid_total?: number; outlet_id?: number };

      if (invoiceData.status === "VOID") {
        throw new PaymentAllocationError("Invoice is void");
      }

      if (invoiceData.status !== "POSTED") {
        throw new PaymentAllocationError("Invoice is not posted");
      }

      const grandTotal = Number(invoiceData.grand_total ?? 0);
      const paidTotal = Number(invoiceData.paid_total ?? 0);
      const outstanding = normalizeMoney(grandTotal - paidTotal);
      if (outstanding <= 0) {
        throw new PaymentAllocationError("Invoice is fully paid");
      }

      const paymentAmount = payment.payment_amount_idr ?? payment.amount;
      const isUnderpayment = paymentAmount < outstanding;
      
      if (options?.settle_shortfall_as_loss && !isUnderpayment) {
        throw new PaymentAllocationError("Cannot settle shortfall as loss for exact or overpayment");
      }

      if (options?.settle_shortfall_as_loss && isUnderpayment && !options.shortfall_reason?.trim()) {
        throw new PaymentAllocationError("shortfall_reason is required when settle_shortfall_as_loss is true");
      }

      let invoiceAmountApplied: number;
      let delta: number;

      if (isUnderpayment && options?.settle_shortfall_as_loss) {
        invoiceAmountApplied = outstanding;
        delta = normalizeMoney(paymentAmount - outstanding);
      } else {
        invoiceAmountApplied = Math.min(paymentAmount, outstanding);
        delta = normalizeMoney(paymentAmount - invoiceAmountApplied);
      }

      const userId = actor?.userId ?? null;
      const shortfallSettledAt = options?.settle_shortfall_as_loss ? new Date() : null;

      await executor.updatePaymentStatus({
        companyId,
        paymentId,
        status: "POSTED",
        invoiceAmountIdr: invoiceAmountApplied,
        paymentDeltaIdr: delta,
        shortfallSettledAsLoss: options?.settle_shortfall_as_loss,
        shortfallReason: options?.shortfall_reason ?? undefined,
        shortfallSettledByUserId: options?.settle_shortfall_as_loss ? userId ?? undefined : undefined,
        shortfallSettledAt: shortfallSettledAt,
        updatedByUserId: userId ?? undefined
      });

      const newPaidTotal = normalizeMoney(Math.min(grandTotal, paidTotal + invoiceAmountApplied));
      const newPaymentStatus =
        newPaidTotal >= grandTotal
          ? "PAID"
          : newPaidTotal > 0
            ? "PARTIAL"
            : "UNPAID";

      await executor.updateInvoicePaidTotal({
        companyId,
        invoiceId: payment.invoice_id,
        paidTotal: newPaidTotal,
        paymentStatus: newPaymentStatus,
        updatedByUserId: userId ?? undefined
      });

      // Post to journal if hook is provided (graceful degradation if undefined)
      const tx = executor.getTransaction();
      if (postingHook && tx) {
        await postingHook.postPaymentToJournal({
          ...options,
          _paymentId: paymentId,
          _companyId: companyId,
          _invoiceId: payment.invoice_id
        }, tx);
      }

      const postedPayment = await executor.findPaymentById(companyId, paymentId);
      if (!postedPayment) {
        throw new Error("Posted payment not found");
      }

      const splits = await executor.findPaymentSplits(companyId, paymentId);
      if (splits.length > 0) {
        return attachSplitsToPayment(postedPayment, splits);
      }
      return postedPayment;
    });
  }

  return {
    createPayment,
    getPayment,
    updatePayment,
    listPayments,
    postPayment
  };
}
