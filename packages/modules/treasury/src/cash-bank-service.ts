// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * CashBankService - core business logic for cash-bank transactions.
 *
 * Implements create/post/void/get/list operations with port-based dependencies.
 * All database and external access flows through injected ports.
 *
 * Extracted from apps/api/src/lib/cash-bank.ts (Story 25.3)
 */

import { PostingService, type PostingRepository, type PostingMapper } from "@jurnapod/modules-accounting";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import type {
  CashBankTransaction,
  CashBankStatus,
  CreateCashBankInput,
  CashBankListFilters,
  CashBankType
} from "./types.js";
import type { MutationActor, TreasuryPorts, AccountInfo } from "./ports.js";
import { CashBankPostingMapper } from "./posting.js";
import {
  normalizeMoney,
  isCashBankTypeName,
  validateDirectionByTransactionType
} from "./helpers.js";
import {
  CashBankValidationError,
  CashBankStatusError,
  CashBankNotFoundError,
  CashBankForbiddenError
} from "./errors.js";

const DOC_TYPE_BY_TRANSACTION_TYPE: Record<CashBankType, string> = {
  MUTATION: "CASH_BANK_MUTATION",
  TOP_UP: "CASH_BANK_TOP_UP",
  WITHDRAWAL: "CASH_BANK_WITHDRAWAL",
  FOREX: "CASH_BANK_FOREX"
};

/**
 * Options for CashBankService construction.
 */
export interface CashBankServiceOptions {
  /**
   * Optional factory for creating PostingService with repository and mappers.
   * If not provided, postToJournal will throw (deferred to story 25.4).
   */
  postingServiceFactory?: (repository: PostingRepository, mappers: Record<string, PostingMapper>) => PostingService;
}

/**
 * Service for managing cash-bank transactions.
 *
 * Operations are idempotent where possible:
 * - Posting an already-posted transaction returns the current state
 * - Voiding an already-voided transaction returns the current state
 */
export class CashBankService {
  private readonly postingServiceFactory: ((repository: PostingRepository, mappers: Record<string, PostingMapper>) => PostingService) | undefined;

  constructor(
    private readonly ports: TreasuryPorts,
    options: CashBankServiceOptions = {}
  ) {
    this.postingServiceFactory = options.postingServiceFactory;
  }

  // ============================================
  // Read Operations
  // ============================================

  /**
   * Get a single cash-bank transaction by ID.
   */
  async get(transactionId: number, companyId: number): Promise<CashBankTransaction> {
    const tx = await this.ports.repository.findById(transactionId, companyId);
    if (!tx) {
      throw new CashBankNotFoundError("Cash/bank transaction not found");
    }
    return tx;
  }

  /**
   * List cash-bank transactions with optional filters.
   */
  async list(
    companyId: number,
    filters: CashBankListFilters
  ): Promise<{ total: number; transactions: CashBankTransaction[] }> {
    return this.ports.repository.list(companyId, filters);
  }

  // ============================================
  // Create Operation
  // ============================================

  /**
   * Create a new cash-bank transaction in DRAFT status.
   */
  async create(
    input: CreateCashBankInput,
    companyId: number,
    actor?: MutationActor
  ): Promise<CashBankTransaction> {
    return this.ports.repository.withTransaction(async () => {
      // Basic validation
      if (input.source_account_id === input.destination_account_id) {
        throw new CashBankValidationError("Source and destination accounts must differ");
      }
      if (input.amount <= 0) {
        throw new CashBankValidationError("Amount must be positive");
      }

      const outletId = input.outlet_id ?? null;

      // Outlet validation and access check
      if (outletId !== null) {
        const belongs = await this.ports.repository.outletBelongsToCompany(outletId, companyId);
        if (!belongs) {
          throw new CashBankValidationError("Outlet not found for company");
        }
        if (actor) {
          const hasAccess = await this.ports.accessChecker.userHasOutletAccess(
            actor.userId, companyId, outletId
          );
          if (!hasAccess) {
            throw new CashBankForbiddenError("User cannot access outlet");
          }
        }
      }

      // Account validation
      const sourceAccount = await this.ensureAccount(input.source_account_id, companyId, "source");
      const destAccount = await this.ensureAccount(input.destination_account_id, companyId, "destination");

      validateDirectionByTransactionType(input.transaction_type, sourceAccount.type_name, destAccount.type_name);

      // Process FOREX fields
      const processed = this.processForexFields(input);

      // Create transaction
      return this.ports.repository.create(
        {
          ...input,
          ...processed
        },
        companyId,
        actor?.userId ?? null
      );
    });
  }

  // ============================================
  // Post Operation
  // ============================================

  /**
   * Post a DRAFT transaction to the journal.
   * Idempotent: posting an already-posted transaction returns current state.
   */
  async post(
    transactionId: number,
    companyId: number,
    actor?: MutationActor
  ): Promise<CashBankTransaction> {
    return this.ports.repository.withTransaction(async () => {
      const current = await this.ports.repository.findByIdForUpdate(transactionId, companyId);
      if (!current) {
        throw new CashBankNotFoundError("Cash/bank transaction not found");
      }

      // Access check
      if (current.outlet_id && actor) {
        const hasAccess = await this.ports.accessChecker.userHasOutletAccess(
          actor.userId, companyId, current.outlet_id
        );
        if (!hasAccess) {
          throw new CashBankForbiddenError("User cannot access outlet");
        }
      }

      // Idempotency check
      if (current.status === "POSTED") {
        return current;
      }
      if (current.status !== "DRAFT") {
        throw new CashBankStatusError("Only DRAFT transaction can be posted");
      }

      // Validate accounts still valid
      const sourceAccount = await this.ensureAccount(current.source_account_id, companyId, "source");
      const destAccount = await this.ensureAccount(current.destination_account_id, companyId, "destination");
      validateDirectionByTransactionType(current.transaction_type, sourceAccount.type_name, destAccount.type_name);

      // Fiscal year check
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, current.transaction_date);

      // Update status
      const postedAt = new Date();
      await this.ports.repository.updateStatus(transactionId, companyId, "POSTED", postedAt);

      // Re-read to get updated state
      const posted = await this.ports.repository.findByIdForUpdate(transactionId, companyId);
      if (!posted) {
        throw new CashBankNotFoundError("Posted transaction not found");
      }

      // Post to journal (external transaction - repository handles atomicity)
      await this.postToJournal(posted, false);

      return posted;
    });
  }

  // ============================================
  // Void Operation
  // ============================================

  /**
   * Void a POSTED transaction by posting a reversal to the journal.
   * Idempotent: voiding an already-voided transaction returns current state.
   */
  async void(
    transactionId: number,
    companyId: number,
    actor?: MutationActor
  ): Promise<CashBankTransaction> {
    return this.ports.repository.withTransaction(async () => {
      const current = await this.ports.repository.findByIdForUpdate(transactionId, companyId);
      if (!current) {
        throw new CashBankNotFoundError("Cash/bank transaction not found");
      }

      // Access check
      if (current.outlet_id && actor) {
        const hasAccess = await this.ports.accessChecker.userHasOutletAccess(
          actor.userId, companyId, current.outlet_id
        );
        if (!hasAccess) {
          throw new CashBankForbiddenError("User cannot access outlet");
        }
      }

      // Idempotency check
      if (current.status === "VOID") {
        return current;
      }
      if (current.status !== "POSTED") {
        throw new CashBankStatusError("Only POSTED transaction can be voided");
      }

      // Fiscal year check
      await this.ports.fiscalYearGuard.ensureDateWithinOpenFiscalYear(companyId, current.transaction_date);

      // Update status
      await this.ports.repository.updateStatus(transactionId, companyId, "VOID");

      // Re-read to get updated state
      const voided = await this.ports.repository.findByIdForUpdate(transactionId, companyId);
      if (!voided) {
        throw new CashBankNotFoundError("Voided transaction not found");
      }

      // Post reversal to journal
      await this.postToJournal(voided, true);

      return voided;
    });
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async ensureAccount(
    accountId: number,
    companyId: number,
    roleLabel: "source" | "destination" | "fx"
  ): Promise<AccountInfo> {
    const account = await this.ports.repository.findAccount(accountId, companyId);
    if (!account) {
      throw new CashBankValidationError(`${roleLabel} account not found`);
    }
    if (!isCashBankTypeName(account.type_name)) {
      throw new CashBankValidationError(`${roleLabel} account must be cash/bank classified`);
    }
    return account;
  }

  private processForexFields(input: CreateCashBankInput): {
    exchange_rate: number | undefined;
    base_amount: number | undefined;
    fx_account_id: number | null;
    fx_gain_loss: number;
  } {
    if (input.transaction_type !== "FOREX") {
      return {
        exchange_rate: undefined,
        base_amount: undefined,
        fx_account_id: null,
        fx_gain_loss: 0
      };
    }

    const exchangeRate = input.exchange_rate;
    if (!exchangeRate || exchangeRate <= 0) {
      throw new CashBankValidationError("FOREX requires exchange_rate > 0");
    }

    const currencyCode = (input.currency_code ?? "IDR").toUpperCase();
    if (currencyCode.length !== 3) {
      throw new CashBankValidationError("FOREX requires 3-char currency_code");
    }

    let baseAmount = input.base_amount ?? normalizeMoney(input.amount * exchangeRate);
    if (baseAmount <= 0) {
      throw new CashBankValidationError("FOREX base_amount must be positive");
    }

    const fxGainLoss = normalizeMoney(baseAmount - input.amount);

    if (fxGainLoss !== 0 && !input.fx_account_id) {
      throw new CashBankValidationError("fx_account_id is required when FOREX produces gain/loss");
    }

    return {
      exchange_rate: exchangeRate,
      base_amount: baseAmount,
      fx_account_id: input.fx_account_id ?? null,
      fx_gain_loss: fxGainLoss
    };
  }

  private async postToJournal(tx: CashBankTransaction, voidMode: boolean): Promise<PostingResult> {
    if (!this.postingServiceFactory) {
      throw new Error("postToJournal requires postingServiceFactory - deferred to story 25.4");
    }

    const baseDocType = DOC_TYPE_BY_TRANSACTION_TYPE[tx.transaction_type];
    const docType = voidMode ? `${baseDocType}_VOID` : baseDocType;

    const request: PostingRequest = {
      company_id: tx.company_id,
      outlet_id: tx.outlet_id ?? undefined,
      doc_type: docType,
      doc_id: tx.id
    };

    const mappers: Record<string, PostingMapper> = {
      [docType]: new CashBankPostingMapper(tx, voidMode)
    };

    const postingService = this.postingServiceFactory(this.ports.repository as unknown as PostingRepository, mappers);
    return postingService.post(request, { transactionOwner: "external" });
  }
}

// Re-export errors for convenience
export {
  CashBankValidationError,
  CashBankStatusError,
  CashBankNotFoundError,
  CashBankForbiddenError
};
