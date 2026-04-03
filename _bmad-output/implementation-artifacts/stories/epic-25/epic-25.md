# Epic 25: Cash-Bank Domain Extraction to modules-treasury

**Status:** 📋 Backlog  
**Date:** 2026-04-03  
**Stories:** 4 total  
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-25-sprint-plan.md`

---

## Executive Summary

Epic 25 extracts cash-bank domain logic from `apps/api/src/lib/cash-bank.ts` into a new `@jurnapod/modules-treasury` package. This continues the API detachment work from Epic 23, establishing a clean separation between business logic and HTTP/adapter layers.

**Key Goals:**
- Create `@jurnapod/modules-treasury` package
- Extract cash-bank domain logic (types, validation, service, journal building)
- Implement ports/adapters pattern for API integration
- Maintain full backward compatibility with existing API
- Ensure journal integrity and posting atomicity

---

## Goals & Non-Goals

### Goals
- Create `@jurnapod/modules-treasury` package with clean public API
- Extract domain model: types, errors, helpers (money, dates, validation)
- Implement `CashBankService` with create/post/void/list/get operations
- Build journal line builder (`buildCashBankJournalLines`)
- Define port interfaces for DB access, auth, fiscal-year guards
- Implement API adapters for treasury ports
- Add comprehensive tests for journal balance and status transitions
- Update route adapter to use treasury service

### Non-Goals
- Depreciation operations (stays in modules-accounting)
- New cash-bank features or transaction types
- Changes to database schema
- Changes to sync protocol
- Modifying POS or Backoffice apps directly

---

## Success Criteria

- [ ] `@jurnapod/modules-treasury` package created and builds successfully
- [ ] Domain logic fully extracted from `apps/api/src/lib/cash-bank.ts`
- [ ] API routes use treasury service via thin adapters (no business logic)
- [ ] All existing cash-bank tests pass without modification
- [ ] New treasury package has comprehensive unit tests
- [ ] Journal balance verified for all transaction types (MUTATION, TOP_UP, WITHDRAWAL, FOREX)
- [ ] Status transitions work correctly (DRAFT→POSTED→VOID)
- [ ] No circular dependencies between packages
- [ ] Full validation gate passes (typecheck, build, lint, critical tests)

---

## Architecture

### Dependency Direction

```
apps/api routes → modules-treasury → modules-accounting (PostingService)
                                → modules-platform (AccessScopeChecker port)
```

### Interface Pattern: Ports/Adapters

Following the modules-sales pattern:

**Treasury Package (business logic):**
- Domain types and validation
- `CashBankService` operations
- `buildCashBankJournalLines` (pure function)
- Port interface definitions (contracts)

**API Package (adapters):**
- HTTP route handling (auth middleware, Zod validation)
- `AccessScopeChecker` implementation
- `FiscalYearGuard` implementation
- `CashBankRepository` adapter (Kysely)

### Port Interfaces

```typescript
// Treasury-defined ports (API implements these)
interface CashBankRepository {
  findById(id: number, companyId: number): Promise<CashBankTransaction | null>;
  findByIdForUpdate(id: number, companyId: number): Promise<CashBankTransaction | null>;
  list(filters: CashBankListFilters): Promise<{ total: number; transactions: CashBankTransaction[] }>;
  create(input: CreateCashBankInput): Promise<CashBankTransaction>;
  updateStatus(id: number, companyId: number, status: CashBankStatus, postedAt?: Date): Promise<void>;
  // Account validation
  findAccount(accountId: number, companyId: number): Promise<AccountInfo | null>;
  // Outlet validation
  outletBelongsToCompany(outletId: number, companyId: number): Promise<boolean>;
}

interface AccessScopeChecker {
  userHasOutletAccess(userId: number, companyId: number, outletId: number): Promise<boolean>;
}

interface FiscalYearGuard {
  ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void>;
}
```

---

## Story List

| Story | Title | Priority | Estimate | Dependencies |
|-------|-------|----------|----------|--------------|
| 25.1 | Scaffold modules-treasury package | P1 | 1.5h | None |
| 25.2 | Extract domain model, types, errors, helpers | P1 | 2h | 25.1 |
| 25.3 | Implement CashBankService with create/post/void and API port adapters | P1 | 3h | 25.2 |
| 25.4 | Add tests, update route adapter, validate full gate | P1 | 2.5h | 25.3 |

**Total: 4 stories, ~9 hours**

---

## Critical Path

```
25.1 (Scaffold) 
    ↓
25.2 (Domain Model) 
    ↓
25.3 (Service + Ports) 
    ↓
25.4 (Tests + Adapter + Validation)
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Journal balance regression | P1 | Comprehensive tests for all 4 transaction types including FOREX gain/loss scenarios |
| Status transition errors | P1 | Explicit state machine tests for DRAFT→POSTED→VOID with edge cases |
| Tenant scoping leaks | P1 | Mandatory assertions for company_id/outlet_id in all repository operations |
| Posting atomicity issues | P1 | Transaction wrapper tests, verify journal_batches + journal_lines written atomically |
| Port adapter interface mismatch | P2 | Clear TypeScript interfaces, strict mode, compile-time checking |
| Money rounding errors | P1 | Use existing `toMinorUnits`/`normalizeMoney` patterns, never FLOAT |

---

## What Stays in API

- Route HTTP handling (auth middleware, Zod validation, response formatting)
- `userHasOutletAccess` as `AccessScopeChecker` port implementation
- `ensureDateWithinOpenFiscalYearWithExecutor` as `FiscalYearGuard` port implementation
- Thin composition in route handlers
- `lib/cash-bank.ts` **deleted** after extraction (logic moves to treasury)

---

## Linked Artifacts

- Epic 23: API Detachment (prerequisite)
- `apps/api/src/lib/cash-bank.ts` (source of extraction)
- `apps/api/src/routes/cash-bank-transactions.ts` (route adapter)
- `packages/shared/src/schemas/cash-bank.ts` (shared schemas)
- `packages/modules/accounting/src/posting.ts` (PostingService)

---

## Technical Notes

### Transaction Types

| Type | Description | Journal Impact |
|------|-------------|----------------|
| MUTATION | Transfer between cash/bank accounts | Debit destination, Credit source |
| TOP_UP | Cash to bank deposit | Debit bank, Credit cash |
| WITHDRAWAL | Bank to cash withdrawal | Debit cash, Credit bank |
| FOREX | Foreign exchange with gain/loss | Debit destination (base), Credit source, Optional FX gain/loss |

### Validation Rules

- Source and destination accounts must differ
- Amount must be positive
- Both accounts must be cash/bank classified (type_name contains "kas", "cash", "bank")
- TOP_UP: source must be cash, destination must be bank
- WITHDRAWAL: source must be bank, destination must be cash
- FOREX: requires exchange_rate, currency_code, may require fx_account_id for gain/loss

### Money Handling

- Never use FLOAT/DOUBLE
- Use `MONEY_SCALE = 100` for minor units
- `toMinorUnits(value)` rounds to avoid floating point errors
- `normalizeMoney(value)` returns clean decimal

---

## Status

**Status:** 📋 BACKLOG
