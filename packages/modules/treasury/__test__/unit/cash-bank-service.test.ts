// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for CashBankService.
 */

import { test, describe, beforeEach } from "vitest";
import assert from "node:assert";
import { CashBankService } from "../../src/cash-bank-service.ts";
import type { TreasuryPorts, MutationActor, AccountInfo } from "../../src/ports.ts";
import type { CashBankTransaction, CashBankStatus, CreateCashBankInput } from "../../src/types.ts";
import { CashBankValidationError, CashBankStatusError, CashBankNotFoundError, CashBankForbiddenError } from "../../src/errors.ts";

// Mock implementations
function createMockPorts(overrides: Partial<TreasuryPorts> = {}): TreasuryPorts {
  const mockTx: CashBankTransaction = {
    id: 1,
    company_id: 1,
    outlet_id: null,
    transaction_type: "MUTATION",
    transaction_date: "2026-04-03",
    reference: null,
    description: "Test transaction",
    source_account_id: 10,
    destination_account_id: 20,
    amount: 1000,
    currency_code: "IDR",
    exchange_rate: null,
    base_amount: null,
    fx_gain_loss: null,
    fx_account_id: null,
    status: "DRAFT" as CashBankStatus,
    posted_at: null,
    created_by_user_id: 1,
    created_at: "2026-04-03T00:00:00Z",
    updated_at: "2026-04-03T00:00:00Z"
  };

  return {
    repository: {
      findById: async (id: number) => id === 1 ? mockTx : null,
      findByIdForUpdate: async (id: number) => id === 1 ? { ...mockTx } : null,
      list: async () => ({ total: 1, transactions: [mockTx] }),
      create: async (input, companyId, createdByUserId) => ({ ...mockTx, ...input, created_by_user_id: createdByUserId }),
      updateStatus: async () => {},
      findAccount: async (id: number) => ({
        id,
        company_id: 1,
        name: `Account ${id}`,
        type_name: id === 10 ? "Kas Kecil" : id === 20 ? "Bank BCA" : "Lainnya"
      } as AccountInfo),
      outletBelongsToCompany: async () => true,
      withTransaction: async <T>(op: () => Promise<T>) => op()
    },
    accessChecker: {
      userHasOutletAccess: async () => true
    },
    fiscalYearGuard: {
      ensureDateWithinOpenFiscalYear: async () => {}
    },
    ...overrides
  };
}

describe("CashBankService", () => {
  test("get returns transaction when found", async () => {
    const service = new CashBankService(createMockPorts());
    const tx = await service.get(1, 1);
    assert.strictEqual(tx.id, 1);
  });

  test("get throws when not found", async () => {
    const service = new CashBankService(createMockPorts());
    await assert.rejects(() => service.get(999, 1), CashBankNotFoundError);
  });

  test("create validates accounts differ", async () => {
    const service = new CashBankService(createMockPorts());
    const input: CreateCashBankInput = {
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      description: "Test",
      source_account_id: 10,
      destination_account_id: 10, // same as source
      amount: 1000
    };
    await assert.rejects(() => service.create(input, 1), CashBankValidationError);
  });

  test("create validates positive amount", async () => {
    const service = new CashBankService(createMockPorts());
    const input: CreateCashBankInput = {
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      description: "Test",
      source_account_id: 10,
      destination_account_id: 20,
      amount: 0
    };
    await assert.rejects(() => service.create(input, 1), CashBankValidationError);
  });

  test("post idempotent on already POSTED", async () => {
    const mockTx: CashBankTransaction = {
      id: 1,
      company_id: 1,
      outlet_id: null,
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      reference: null,
      description: "Test",
      source_account_id: 10,
      destination_account_id: 20,
      amount: 1000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "POSTED",
      posted_at: "2026-04-03T00:00:00Z",
      created_by_user_id: 1,
      created_at: "2026-04-03T00:00:00Z",
      updated_at: "2026-04-03T00:00:00Z"
    };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => mockTx
      }
    }));
    
    const result = await service.post(1, 1);
    assert.strictEqual(result.status, "POSTED");
  });

  test("post rejects VOID transaction", async () => {
    // Use a DRAFT transaction and modify status
    const draftTx: CashBankTransaction = {
      id: 1,
      company_id: 1,
      outlet_id: null,
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      reference: null,
      description: "Test",
      source_account_id: 10,
      destination_account_id: 20,
      amount: 1000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "DRAFT" as CashBankStatus,
      posted_at: null,
      created_by_user_id: 1,
      created_at: "2026-04-03T00:00:00Z",
      updated_at: "2026-04-03T00:00:00Z"
    };
    
    const voidTx: CashBankTransaction = { ...draftTx, status: "VOID" };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => voidTx
      }
    }));
    
    await assert.rejects(() => service.post(1, 1), CashBankStatusError);
  });

  test("void idempotent on already VOID", async () => {
    // Use a POSTED transaction that will be returned as VOID
    const postedTx: CashBankTransaction = {
      id: 1,
      company_id: 1,
      outlet_id: null,
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      reference: null,
      description: "Test",
      source_account_id: 10,
      destination_account_id: 20,
      amount: 1000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "POSTED" as CashBankStatus,
      posted_at: "2026-04-03T00:00:00Z",
      created_by_user_id: 1,
      created_at: "2026-04-03T00:00:00Z",
      updated_at: "2026-04-03T00:00:00Z"
    };
    
    const voidTx: CashBankTransaction = { ...postedTx, status: "VOID" };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => voidTx
      }
    }));
    
    const result = await service.void(1, 1);
    assert.strictEqual(result.status, "VOID");
  });

  test("void rejects DRAFT transaction", async () => {
    // Use a DRAFT transaction - void should fail
    const draftTx: CashBankTransaction = {
      id: 1,
      company_id: 1,
      outlet_id: null,
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      reference: null,
      description: "Test",
      source_account_id: 10,
      destination_account_id: 20,
      amount: 1000,
      currency_code: "IDR",
      exchange_rate: null,
      base_amount: null,
      fx_gain_loss: null,
      fx_account_id: null,
      status: "DRAFT" as CashBankStatus,
      posted_at: null,
      created_by_user_id: 1,
      created_at: "2026-04-03T00:00:00Z",
      updated_at: "2026-04-03T00:00:00Z"
    };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => draftTx
      }
    }));
    
    await assert.rejects(() => service.void(1, 1), CashBankStatusError);
  });

  test("create checks outlet access when actor provided", async () => {
    const service = new CashBankService(createMockPorts({
      accessChecker: {
        userHasOutletAccess: async () => false // deny access
      }
    }));
    
    const input: CreateCashBankInput = {
      transaction_type: "MUTATION",
      transaction_date: "2026-04-03",
      description: "Test",
      source_account_id: 10,
      destination_account_id: 20,
      amount: 1000,
      outlet_id: 5
    };
    
    const actor: MutationActor = { userId: 1 };
    await assert.rejects(() => service.create(input, 1, actor), CashBankForbiddenError);
  });
});
