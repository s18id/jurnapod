# AGENTS.md

## Scope
Accounting module rules for chart of accounts, journal generation, posting integrity, imports, and financial reporting.

## Review guidelines

### Priority
- Treat unbalanced journals, incorrect account mapping, posting bypasses, or broken transactional integrity as P1.
- This package should optimize for financial correctness and auditability first.

### Journal integrity
- Flag any path that can create unbalanced entries.
- Flag any path where `journal_batches` and `journal_lines` can become inconsistent, detached, or partially written.
- Verify posting logic is deterministic and reproducible from source documents.

### Reconciliation & Subledger

The package provides GL vs subledger reconciliation via `SubledgerBalanceProvider`.

**Key concepts:**
- **Canonical sign rule**: Debit = positive, Credit = negative
- **Subledger types**: CASH, INVENTORY, RECEIVABLES, PAYABLES (extensible)
- **Drilldown**: Line-level traceability for variance explanation

**Key files:**
- `reconciliation/subledger/types.ts` — Core types
- `reconciliation/subledger/provider.ts` — Provider helpers
- `reconciliation/subledger/cash-provider.ts` — CASH implementation

**Usage:**

```typescript
import { 
  SubledgerType,
  CashSubledgerProvider 
} from '@jurnapod/modules-accounting/reconciliation/subledger';

const cashProvider = new CashSubledgerProvider(db);

const balance = await cashProvider.getBalance({
  companyId: 1,
  outletId: 1,
  asOfEpochMs: Date.now(),
  fiscalYearId: 2024,
  periodId: 12,
  includeDrilldown: true
});

// balance.signedBalance — net (debit positive)
// balance.breakdown — debitAmount, creditAmount
// balance.drilldown.lines — for variance explainability
```

**Reconciliation context for journal posting:**

```typescript
import { ReconciliationContext } from '@jurnapod/modules-accounting/reconciliation';

// Parameterized document family (not hardcoded POS_SALE)
const ctx: ReconciliationContext = {
  companyId: 1,
  outletId: 1,
  fiscalYearId: 2024,
  periodId: 12,
  documentFamily: 'POS_SALE',
  sourceTable: 'pos_transactions',
  statusPredicate: (s) => s === 'COMPLETED'
};
```

### Fiscal Year Close Infrastructure

**Idempotency table:** `fiscal_year_close_requests`

**Close procedure states:**
- `PENDING` → `IN_PROGRESS` → `SUCCEEDED` | `FAILED`

**Error types:**
- `FiscalYearNotFoundError`
- `FiscalYearAlreadyClosedError`
- `FiscalYearCloseConflictError` (concurrent close requests)
- `FiscalYearClosePreconditionError` (periods not closed)

**Period lock:** Once a fiscal year is closed, journal posting to that year is rejected.

### File Structure

Add to existing structure:
```
├── reconciliation/
│   ├── index.ts
│   ├── subledger/
│   │   ├── index.ts              # Subledger exports
│   │   ├── types.ts              # Core types (NEW)
│   │   ├── provider.ts           # Provider helpers (NEW)
│   │   └── cash-provider.ts       # CASH implementation (NEW)
```

### Review Checklist Additions

Add to existing checklist:
- [ ] Reconciliation uses `SubledgerBalanceProvider` (not hardcoded queries)
- [ ] Signed amounts use debit-positive convention
- [ ] Period lock check prevents posting to closed fiscal years
- [ ] `closeFiscalYear` uses idempotency key to prevent duplicates

### Source-of-truth rules
- Journals are the source for GL, trial balance, P&L, and balance sheet style reporting.
- Flag code that introduces parallel financial truth outside the journal model without a very clear reason and reconciliation strategy.

### Mapping and posting logic
- Review account mapping carefully, especially for sales revenue, tax, AR, cash/bank, discounts, refunds, and voids.
- Flag hidden assumptions that can misclassify entries across outlets or companies.
- Verify date, reference, and source-document linkage stays auditable.

### Imports
- Review ODS/Excel import logic for traceability, idempotency, and mapping correctness.
- Flag missing hash/idempotency protections or weak validation around imported COA and journal data.

### Money math
- Flag use of floating-point math for money.
- Review rounding behavior carefully, especially where tax or split lines are involved.

### Testing expectations
- Expect tests when changing:
  - posting mappers
  - journal balancing
  - report calculations
  - import mapping
  - account classification logic

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.