# AGENTS.md — @jurnapod/modules-treasury

## Package Purpose

Cash-bank transaction domain for Jurnapod ERP — handles cash mutations, top-ups, withdrawals, and forex transactions.

**Core Capabilities:**
- **Cash mutations**: Internal cash movements between accounts
- **Top-ups**: Cash increases (deposits, sales proceeds)
- **Withdrawals**: Cash decreases (withdrawals, expense payouts)
- **Forex transactions**: Foreign currency exchange
- **Journal building**: Generate journal lines for posting

**Boundaries:**
- ✅ In: Cash-bank transaction CRUD, journal line building, validation
- ❌ Out: Journal posting (modules-accounting), authentication (modules-auth)

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### CashBankService

```typescript
import { CashBankService } from '@jurnapod/modules-treasury';

const service = new CashBankService(db, {
  accessScope: accessChecker,
  fiscalYear: fiscalYearGuard,
  posting: postingService
});

// Create mutation
const mutation = await service.createMutation({
  companyId: 1,
  outletId: 1,
  accountId: cashAccountId,
  type: 'MUTATION',
  amount: 1000000,
  description: 'Transfer to petty cash',
  reference: 'TXN-001'
});

// Post transaction
await service.post(mutation.id, userId);

// Void transaction
await service.void(mutation.id, userId, 'Duplicate entry');
```

### Journal Line Building

```typescript
import { buildCashBankJournalLines } from '@jurnapod/modules-treasury';

const lines = buildCashBankJournalLines({
  type: 'MUTATION',
  cashBankAccountId: cashId,
  counterpartAccountId: expenseId,
  amount: 100000,
  transactionDate: new Date(),
  reference: 'TXN-001',
  description: 'Petty cash replenishment'
});
// Returns journal lines ready for posting
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| CashBankService | `services/cashbank-service.ts` | Transaction CRUD |
| JournalBuilder | `journal/mutation.ts` | Journal line generation |
| Types | `types/*.ts` | Domain types |

### File Structure

```
packages/modules/treasury/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── services/
│   │   ├── cashbank-service.ts    # Main service
│   │   └── types/
│   │       └── cashbank.ts
│   │
│   └── journal/
│       ├── mutation.ts            # Mutation journal lines
│       └── index.ts
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### Transaction Rules

1. **Posted transactions are immutable** — void instead of modify
2. **Amounts are positive** — direction determined by transaction type
3. **All transactions require journal lines** — balanced debits and credits

---

## Review Checklist

When modifying this package:

- [ ] Journal lines are balanced (debits = credits)
- [ ] Posted transactions cannot be modified
- [ ] Void operations create reversal entries
- [ ] No floating-point math for money
- [ ] Kysely query builder used (not raw SQL)
- [ ] Company/outlet scoping on all queries
- [ ] Access scope properly checked

---

## DB Testing Policy

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

DB-backed tests (tests that exercise database queries, transactions, or constraints) MUST use real database connections:

```typescript
// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { createKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

**Why no mocks for DB-backed tests?**
- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks don't reveal transaction isolation issues
- Integration with real DB catches performance problems early

**What to mock instead:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic (pure computation) may use unit tests without database.**

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/modules-accounting` — PostingService for journal posting
- `@jurnapod/modules-platform` — AccessScopeChecker port

For project-wide conventions, see root `AGENTS.md`.