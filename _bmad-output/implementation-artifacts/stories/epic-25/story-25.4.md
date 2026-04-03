# story-25.4: Add tests, update route adapter, validate full gate

## Description

Complete the cash-bank extraction by adding comprehensive tests to the treasury package, implementing the API adapters for the treasury ports, updating the route handlers to use the new treasury service, and validating the full gate passes.

## Acceptance Criteria

- [ ] Unit tests created in `packages/modules/treasury/src/`:
  - `helpers.test.ts` - test money functions, account classification
  - `journal-builder.test.ts` - test journal line building for all transaction types
  - `cash-bank-service.test.ts` - test service with mock ports
- [ ] API port adapters implemented in `apps/api/src/lib/treasury-adapter.ts`:
  - `KyselyCashBankRepository` implements `CashBankRepository`
  - `ApiAccessScopeChecker` implements `AccessScopeChecker`
  - `ApiFiscalYearGuard` implements `FiscalYearGuard`
  - `KyselyPostingRepository` implements `TreasuryPostingRepository`
- [ ] Route adapter updated in `apps/api/src/routes/cash-bank-transactions.ts`:
  - Uses `CashBankService` from `@jurnapod/modules-treasury`
  - Injects API adapters into service
  - Removes direct imports from `../lib/cash-bank.js`
- [ ] `apps/api/src/lib/cash-bank.ts` deleted (or reduced to re-exports during transition)
- [ ] All existing API tests pass:
  - `npm run test:unit:single -w @jurnapod/api src/lib/cash-bank.test.ts`
  - `npm run test:unit:critical -w @jurnapod/api`
- [ ] New treasury package tests pass (if test runner configured)
- [ ] Full validation gate passes:
  - `npm run typecheck -w @jurnapod/modules-treasury`
  - `npm run build -w @jurnapod/modules-treasury`
  - `npm run typecheck -w @jurnapod/api`
  - `npm run build -w @jurnapod/api`
  - `npm run lint -w @jurnapod/api`
  - `npm run test:unit -w @jurnapod/api`
- [ ] Manual verification: create, post, void cash-bank transactions through API

## Files to Create

### Treasury Package Tests

```
packages/modules/treasury/src/
├── helpers.test.ts
├── journal-builder.test.ts
└── cash-bank-service.test.ts
```

### API Adapters

```
apps/api/src/lib/
└── treasury-adapter.ts   (new - implements treasury ports)
```

## Files to Modify

```
apps/api/src/routes/cash-bank-transactions.ts  (update to use treasury service)
apps/api/src/lib/cash-bank.ts                  (delete after migration)
```

## Files to Reference

- `apps/api/src/lib/cash-bank.ts` - source logic being replaced
- `apps/api/src/lib/cash-bank.test.ts` - existing tests to maintain compatibility
- `apps/api/src/lib/auth.ts` - for `userHasOutletAccess`
- `apps/api/src/lib/fiscal-years.ts` - for `ensureDateWithinOpenFiscalYearWithExecutor`
- `packages/modules/accounting/src/posting.ts` - for `PostingService` usage

## Dependencies

- Story 25.1: Package scaffold
- Story 25.2: Domain model, types, errors, helpers
- Story 25.3: CashBankService with ports

## Estimated Effort

2.5 hours

## Priority

P1

## Implementation Notes

### helpers.test.ts

```typescript
import { test } from "node:test";
import assert from "node:assert";
import { 
  toMinorUnits, 
  normalizeMoney, 
  isCashBankTypeName, 
  classifyCashBankAccount,
  validateDirectionByTransactionType,
  CashBankValidationError
} from "./helpers.js";

test("toMinorUnits rounds correctly", () => {
  assert.strictEqual(toMinorUnits(10.005), 1001);
  assert.strictEqual(toMinorUnits(10.004), 1000);
  assert.strictEqual(toMinorUnits(10), 1000);
});

test("normalizeMoney returns clean decimal", () => {
  assert.strictEqual(normalizeMoney(10.005), 10.01);
  assert.strictEqual(normalizeMoney(10.004), 10);
  assert.strictEqual(normalizeMoney(10), 10);
});

test("isCashBankTypeName detects cash/bank accounts", () => {
  assert.strictEqual(isCashBankTypeName("Kas Kecil"), true);
  assert.strictEqual(isCashBankTypeName("Bank BCA"), true);
  assert.strictEqual(isCashBankTypeName("Cash on Hand"), true);
  assert.strictEqual(isCashBankTypeName("Accounts Receivable"), false);
  assert.strictEqual(isCashBankTypeName(null), false);
});

test("classifyCashBankAccount categorizes correctly", () => {
  assert.strictEqual(classifyCashBankAccount("Kas Kecil"), "CASH");
  assert.strictEqual(classifyCashBankAccount("Bank BCA"), "BANK");
  assert.strictEqual(classifyCashBankAccount("Cash on Hand"), "CASH");
  assert.strictEqual(classifyCashBankAccount("Bank and Cash"), null); // ambiguous
  assert.strictEqual(classifyCashBankAccount("Accounts Receivable"), null);
});

test("validateDirectionByTransactionType validates TOP_UP", () => {
  // Valid: cash to bank
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("TOP_UP", "Kas Kecil", "Bank BCA");
  });
  
  // Invalid: bank to cash
  assert.throws(() => {
    validateDirectionByTransactionType("TOP_UP", "Bank BCA", "Kas Kecil");
  }, CashBankValidationError);
});

test("validateDirectionByTransactionType validates WITHDRAWAL", () => {
  // Valid: bank to cash
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("WITHDRAWAL", "Bank BCA", "Kas Kecil");
  });
  
  // Invalid: cash to bank
  assert.throws(() => {
    validateDirectionByTransactionType("WITHDRAWAL", "Kas Kecil", "Bank BCA");
  }, CashBankValidationError);
});

test("validateDirectionByTransactionType allows any for MUTATION", () => {
  assert.doesNotThrow(() => {
    validateDirectionByTransactionType("MUTATION", "Bank BCA", "Bank Mandiri");
    validateDirectionByTransactionType("MUTATION", "Kas Kecil", "Kas Besar");
    validateDirectionByTransactionType("MUTATION", "Bank BCA", "Kas Kecil");
  });
});
```

### journal-builder.test.ts

```typescript
import { test } from "node:test";
import assert from "node:assert";
import { buildCashBankJournalLines, type BuildJournalLinesInput } from "./journal-builder.js";
import { CashBankValidationError } from "./helpers.js";

const baseInput: BuildJournalLinesInput = {
  transactionType: "MUTATION",
  sourceAccountId: 1,
  destinationAccountId: 2,
  amount: 1000,
  baseAmount: null,
  fxAccountId: null,
  referenceLabel: "Test"
};

test("buildCashBankJournalLines rejects non-positive amount", () => {
  assert.throws(() => {
    buildCashBankJournalLines({ ...baseInput, amount: 0 });
  }, CashBankValidationError);
  
  assert.throws(() => {
    buildCashBankJournalLines({ ...baseInput, amount: -100 });
  }, CashBankValidationError);
});

test("buildCashBankJournalLines creates balanced lines for MUTATION", () => {
  const lines = buildCashBankJournalLines({ ...baseInput, transactionType: "MUTATION" });
  
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].account_id, 2); // destination
  assert.strictEqual(lines[0].debit, 1000);
  assert.strictEqual(lines[0].credit, 0);
  assert.strictEqual(lines[1].account_id, 1); // source
  assert.strictEqual(lines[1].debit, 0);
  assert.strictEqual(lines[1].credit, 1000);
  
  // Verify balance
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
});

test("buildCashBankJournalLines creates balanced lines for TOP_UP", () => {
  const lines = buildCashBankJournalLines({ ...baseInput, transactionType: "TOP_UP" });
  
  assert.strictEqual(lines.length, 2);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
});

test("buildCashBankJournalLines creates balanced lines for WITHDRAWAL", () => {
  const lines = buildCashBankJournalLines({ ...baseInput, transactionType: "WITHDRAWAL" });
  
  assert.strictEqual(lines.length, 2);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  assert.strictEqual(totalDebit, totalCredit);
});

test("buildCashBankJournalLines creates 2 lines for FOREX with no gain/loss", () => {
  const lines = buildCashBankJournalLines({
    ...baseInput,
    transactionType: "FOREX",
    amount: 1000,
    baseAmount: 1000, // no difference
    fxAccountId: 3
  });
  
  assert.strictEqual(lines.length, 2);
});

test("buildCashBankJournalLines creates 3 lines for FOREX with gain", () => {
  const lines = buildCashBankJournalLines({
    ...baseInput,
    transactionType: "FOREX",
    amount: 1000,
    baseAmount: 1100, // 100 gain
    fxAccountId: 3
  });
  
  assert.strictEqual(lines.length, 3);
  // Destination gets base amount
  assert.strictEqual(lines[0].debit, 1100);
  // Source gives original amount
  assert.strictEqual(lines[1].credit, 1000);
  // FX account gets gain (credit)
  assert.strictEqual(lines[2].account_id, 3);
  assert.strictEqual(lines[2].credit, 100);
  assert.strictEqual(lines[2].debit, 0);
});

test("buildCashBankJournalLines creates 3 lines for FOREX with loss", () => {
  const lines = buildCashBankJournalLines({
    ...baseInput,
    transactionType: "FOREX",
    amount: 1000,
    baseAmount: 900, // 100 loss
    fxAccountId: 3
  });
  
  assert.strictEqual(lines.length, 3);
  // FX account gets loss (debit)
  assert.strictEqual(lines[2].account_id, 3);
  assert.strictEqual(lines[2].debit, 100);
  assert.strictEqual(lines[2].credit, 0);
});

test("buildCashBankJournalLines rejects FOREX with gain/loss but no fx_account_id", () => {
  assert.throws(() => {
    buildCashBankJournalLines({
      ...baseInput,
      transactionType: "FOREX",
      amount: 1000,
      baseAmount: 1100, // would have gain
      fxAccountId: null
    });
  }, CashBankValidationError);
});

test("buildCashBankJournalLines always produces balanced journals", () => {
  const testCases: BuildJournalLinesInput[] = [
    { ...baseInput, transactionType: "MUTATION", amount: 100.01 },
    { ...baseInput, transactionType: "TOP_UP", amount: 999.99 },
    { ...baseInput, transactionType: "FOREX", amount: 1000, baseAmount: 1050.50, fxAccountId: 3 },
    { ...baseInput, transactionType: "FOREX", amount: 1000, baseAmount: 949.50, fxAccountId: 3 },
  ];
  
  for (const testCase of testCases) {
    const lines = buildCashBankJournalLines(testCase);
    const totalDebit = lines.reduce((sum, l) => sum + l.debit * 100, 0); // use minor units
    const totalCredit = lines.reduce((sum, l) => sum + l.credit * 100, 0);
    assert.strictEqual(totalDebit, totalCredit, 
      `Unbalanced journal for ${testCase.transactionType}`);
  }
});
```

### cash-bank-service.test.ts (simplified with mocks)

```typescript
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { CashBankService } from "./cash-bank-service.js";
import type { TreasuryPorts, MutationActor, AccountInfo } from "./ports.js";
import type { CashBankTransaction, CashBankStatus, CreateCashBankInput } from "./types.js";
import { CashBankValidationError, CashBankStatusError, CashBankNotFoundError, CashBankForbiddenError } from "./helpers.js";

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
      findByIdForUpdate: async (id: number) => id === 1 ? mockTx : null,
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
    const mockTx: CashBankTransaction = {
      ...createMockPorts().repository.findById(1) as CashBankTransaction,
      status: "VOID"
    };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => mockTx
      }
    }));
    
    await assert.rejects(() => service.post(1, 1), CashBankStatusError);
  });

  test("void idempotent on already VOID", async () => {
    const mockTx: CashBankTransaction = {
      ...createMockPorts().repository.findById(1) as CashBankTransaction,
      status: "VOID"
    };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => mockTx
      }
    }));
    
    const result = await service.void(1, 1);
    assert.strictEqual(result.status, "VOID");
  });

  test("void rejects DRAFT transaction", async () => {
    const mockTx: CashBankTransaction = {
      ...createMockPorts().repository.findById(1) as CashBankTransaction,
      status: "DRAFT"
    };
    
    const service = new CashBankService(createMockPorts({
      repository: {
        ...createMockPorts().repository,
        findByIdForUpdate: async () => mockTx
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
```

### treasury-adapter.ts (API-side)

```typescript
// apps/api/src/lib/treasury-adapter.ts
// Implements treasury ports using API infrastructure

import type { KyselySchema } from "./db.js";
import type { 
  CashBankRepository, 
  AccessScopeChecker, 
  FiscalYearGuard,
  TreasuryPostingRepository,
  AccountInfo 
} from "@jurnapod/modules-treasury";
import type { CashBankTransaction, CashBankStatus, CreateCashBankInput, CashBankListFilters } from "@jurnapod/modules-treasury";
import type { JournalLine, PostingRequest } from "@jurnapod/shared";
import { getDb, withKysely } from "./db.js";
import { userHasOutletAccess } from "./auth.js";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years.js";
import { sql } from "kysely";
import { normalizeMoney } from "@jurnapod/modules-treasury";

// Internal row type for DB mapping
type CashBankRow = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  transaction_type: "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
  transaction_date: string | Date;
  reference: string | null;
  description: string;
  source_account_id: number;
  source_account_name?: string;
  destination_account_id: number;
  destination_account_name?: string;
  amount: string | number;
  currency_code: string;
  exchange_rate: string | number | null;
  base_amount: string | number | null;
  fx_gain_loss: string | number | null;
  fx_account_id: number | null;
  fx_account_name?: string | null;
  status: "DRAFT" | "POSTED" | "VOID";
  posted_at: string | Date | null;
  created_by_user_id: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIsoDateOnly(value: string | Date): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string | Date): string {
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return value.toISOString();
}

function toCashBankTransaction(row: CashBankRow): CashBankTransaction {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id === null ? null : Number(row.outlet_id),
    transaction_type: row.transaction_type,
    transaction_date: toIsoDateOnly(row.transaction_date),
    reference: row.reference,
    description: row.description,
    source_account_id: Number(row.source_account_id),
    source_account_name: row.source_account_name,
    destination_account_id: Number(row.destination_account_id),
    destination_account_name: row.destination_account_name,
    amount: Number(row.amount),
    currency_code: row.currency_code,
    exchange_rate: row.exchange_rate === null ? null : Number(row.exchange_rate),
    base_amount: row.base_amount === null ? null : Number(row.base_amount),
    fx_gain_loss: row.fx_gain_loss === null ? null : Number(row.fx_gain_loss),
    fx_account_id: row.fx_account_id === null ? null : Number(row.fx_account_id),
    fx_account_name: row.fx_account_name ?? null,
    status: row.status,
    posted_at: row.posted_at ? toIsoDateTime(row.posted_at) : null,
    created_by_user_id: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
    created_at: toIsoDateTime(row.created_at),
    updated_at: toIsoDateTime(row.updated_at)
  };
}

export class KyselyCashBankRepository implements CashBankRepository {
  constructor(private readonly db: KyselySchema) {}

  async findById(id: number, companyId: number): Promise<CashBankTransaction | null> {
    const row = await sql<CashBankRow>`
      SELECT cbt.*, 
             sa.name AS source_account_name,
             da.name AS destination_account_name,
             fxa.name AS fx_account_name
      FROM cash_bank_transactions cbt
      LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
      LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
      LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
      WHERE cbt.id = ${id} AND cbt.company_id = ${companyId}
      LIMIT 1
    `.execute(this.db);

    if (row.rows.length === 0) {
      return null;
    }
    return toCashBankTransaction(row.rows[0]);
  }

  async findByIdForUpdate(id: number, companyId: number): Promise<CashBankTransaction | null> {
    const row = await sql<CashBankRow>`
      SELECT cbt.*,
             sa.name AS source_account_name,
             da.name AS destination_account_name,
             fxa.name AS fx_account_name
      FROM cash_bank_transactions cbt
      LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
      LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
      LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
      WHERE cbt.id = ${id} AND cbt.company_id = ${companyId}
      LIMIT 1
      FOR UPDATE
    `.execute(this.db);

    if (row.rows.length === 0) {
      return null;
    }
    return toCashBankTransaction(row.rows[0]);
  }

  async list(companyId: number, filters: CashBankListFilters): Promise<{ total: number; transactions: CashBankTransaction[] }> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const countResult = await sql<{ total: number }>`
      SELECT COUNT(*) AS total
      FROM cash_bank_transactions cbt
      WHERE cbt.company_id = ${companyId}
        ${filters.outletId !== undefined ? sql`AND cbt.outlet_id = ${filters.outletId}` : sql``}
        ${filters.transactionType ? sql`AND cbt.transaction_type = ${filters.transactionType}` : sql``}
        ${filters.status ? sql`AND cbt.status = ${filters.status}` : sql``}
        ${filters.dateFrom ? sql`AND cbt.transaction_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND cbt.transaction_date <= ${filters.dateTo}` : sql``}
    `.execute(this.db);

    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await sql<CashBankRow>`
      SELECT cbt.*,
             sa.name AS source_account_name,
             da.name AS destination_account_name,
             fxa.name AS fx_account_name
      FROM cash_bank_transactions cbt
      LEFT JOIN accounts sa ON sa.company_id = cbt.company_id AND sa.id = cbt.source_account_id
      LEFT JOIN accounts da ON da.company_id = cbt.company_id AND da.id = cbt.destination_account_id
      LEFT JOIN accounts fxa ON fxa.company_id = cbt.company_id AND fxa.id = cbt.fx_account_id
      WHERE cbt.company_id = ${companyId}
        ${filters.outletId !== undefined ? sql`AND cbt.outlet_id = ${filters.outletId}` : sql``}
        ${filters.transactionType ? sql`AND cbt.transaction_type = ${filters.transactionType}` : sql``}
        ${filters.status ? sql`AND cbt.status = ${filters.status}` : sql``}
        ${filters.dateFrom ? sql`AND cbt.transaction_date >= ${filters.dateFrom}` : sql``}
        ${filters.dateTo ? sql`AND cbt.transaction_date <= ${filters.dateTo}` : sql``}
      ORDER BY cbt.transaction_date DESC, cbt.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);

    return {
      total,
      transactions: rows.rows.map(toCashBankTransaction)
    };
  }

  async create(input: CreateCashBankInput, companyId: number, createdByUserId: number | null): Promise<CashBankTransaction> {
    const currencyCode = (input.currency_code ?? "IDR").toUpperCase();
    
    const result = await this.db
      .insertInto("cash_bank_transactions")
      .values({
        company_id: companyId,
        outlet_id: input.outlet_id ?? null,
        transaction_type: input.transaction_type,
        transaction_date: new Date(input.transaction_date),
        reference: input.reference ?? null,
        description: input.description,
        source_account_id: input.source_account_id,
        destination_account_id: input.destination_account_id,
        amount: normalizeMoney(input.amount),
        currency_code: currencyCode,
        exchange_rate: input.exchange_rate ?? null,
        base_amount: input.base_amount ?? null,
        fx_gain_loss: input.fx_gain_loss ?? 0,
        fx_account_id: input.fx_account_id ?? null,
        status: "DRAFT",
        created_by_user_id: createdByUserId
      })
      .executeTakeFirst();

    const created = await this.findById(Number(result.insertId), companyId);
    if (!created) {
      throw new Error("Created transaction not found");
    }
    return created;
  }

  async updateStatus(id: number, companyId: number, status: CashBankStatus, postedAt?: Date): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date()
    };
    if (postedAt) {
      update.posted_at = postedAt;
    }

    await this.db
      .updateTable("cash_bank_transactions")
      .set(update)
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();
  }

  async findAccount(accountId: number, companyId: number): Promise<AccountInfo | null> {
    const account = await this.db
      .selectFrom("accounts")
      .where("company_id", "=", companyId)
      .where("id", "=", accountId)
      .limit(1)
      .select(["id", "company_id", "name", "type_name"])
      .executeTakeFirst();

    return account ?? null;
  }

  async outletBelongsToCompany(outletId: number, companyId: number): Promise<boolean> {
    const row = await this.db
      .selectFrom("outlets")
      .where("company_id", "=", companyId)
      .where("id", "=", outletId)
      .limit(1)
      .select("id")
      .executeTakeFirst();

    return !!row;
  }

  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.db.transaction().execute(operation);
  }
}

export class ApiAccessScopeChecker implements AccessScopeChecker {
  async userHasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean> {
    return userHasOutletAccess(userId, companyId, outletId);
  }
}

export class ApiFiscalYearGuard implements FiscalYearGuard {
  constructor(private readonly db: KyselySchema) {}

  async ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void> {
    await ensureDateWithinOpenFiscalYearWithExecutor(this.db, companyId, date);
  }
}

export class KyselyPostingRepository implements TreasuryPostingRepository {
  constructor(private readonly db: KyselySchema, private readonly postedAt: string) {}

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const result = await this.db
      .insertInto("journal_batches")
      .values({
        company_id: request.company_id,
        outlet_id: request.outlet_id ?? null,
        doc_type: request.doc_type,
        doc_id: request.doc_id,
        posted_at: new Date(this.postedAt)
      })
      .executeTakeFirst();

    return { journal_batch_id: Number(result.insertId) };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    if (lines.length === 0) {
      return;
    }

    const lineDate = this.postedAt.slice(0, 10);

    await this.db
      .insertInto("journal_lines")
      .values(
        lines.map((line) => ({
          journal_batch_id: journalBatchId,
          company_id: request.company_id,
          outlet_id: request.outlet_id ?? null,
          account_id: line.account_id,
          line_date: new Date(lineDate),
          debit: line.debit,
          credit: line.credit,
          description: line.description
        }))
      )
      .execute();
  }
}

// Factory function for creating service with API adapters
export function createCashBankService(db: KyselySchema) {
  const { CashBankService } = await import("@jurnapod/modules-treasury");
  
  return new CashBankService({
    repository: new KyselyCashBankRepository(db),
    accessChecker: new ApiAccessScopeChecker(),
    fiscalYearGuard: new ApiFiscalYearGuard(db)
  });
}
```

### Route Updates (cash-bank-transactions.ts)

Key changes to existing route file:

```typescript
// Remove these imports:
// import {
//   listCashBankTransactions,
//   createCashBankTransaction,
//   postCashBankTransaction,
//   voidCashBankTransaction,
//   CashBankValidationError,
//   CashBankNotFoundError,
//   CashBankForbiddenError,
//   CashBankStatusError
// } from "../lib/cash-bank.js";

// Add these imports:
import {
  CashBankService,
  CashBankValidationError,
  CashBankNotFoundError,
  CashBankForbiddenError,
  CashBankStatusError
} from "@jurnapod/modules-treasury";
import { createCashBankService } from "../lib/treasury-adapter.js";
import { getDb } from "../lib/db.js";

// In route handlers, replace:
// const transactions = await listCashBankTransactions(...)
// With:
// const db = getDb();
// const service = createCashBankService(db);
// const result = await service.list(...)

// Similar changes for create, post, void operations
```

## Validation Commands

```bash
cd /home/ahmad/jurnapod

# Treasury package
npm run build -w @jurnapod/modules-treasury
npm run typecheck -w @jurnapod/modules-treasury

# API package
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run lint -w @jurnapod/api

# Tests
npm run test:unit:single -w @jurnapod/api src/lib/cash-bank.test.ts
npm run test:unit:critical -w @jurnapod/api

# Full gate
npm run typecheck -w @jurnapod/modules-treasury && \
npm run build -w @jurnapod/modules-treasury && \
npm run typecheck -w @jurnapod/api && \
npm run build -w @jurnapod/api && \
npm run lint -w @jurnapod/api && \
npm run test:unit:critical -w @jurnapod/api
```

## Notes

- The API adapters bridge treasury ports to existing API infrastructure
- `KyselyCashBankRepository` uses the same SQL patterns as the original `cash-bank.ts`
- `ApiAccessScopeChecker` wraps the existing `userHasOutletAccess` function
- `ApiFiscalYearGuard` wraps `ensureDateWithinOpenFiscalYearWithExecutor`
- Route changes should be minimal - just swapping function calls to service methods
- After successful migration, `lib/cash-bank.ts` can be deleted
- Keep `lib/cash-bank.test.ts` as regression tests unless fully covered by treasury tests
