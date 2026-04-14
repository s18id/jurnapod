# Epic 25 Parallel Execution Coordination

## Current Target

Story 25.4: Add tests, update route adapter, validate full gate.

## Batch 1 (Parallel, non-overlapping)

### Scope A: Treasury test stabilization
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files allowed:**
- `packages/modules/treasury/src/helpers.test.ts`
- `packages/modules/treasury/src/journal-builder.test.ts`
- `packages/modules/treasury/src/cash-bank-service.test.ts`
- `packages/modules/treasury/package.json` (only if test script required)

**Primary objective:**
- Resolve treasury typecheck/test failures with minimal change surface.

**Known blocker:**
- `helpers.test.ts` imports `CashBankValidationError` from `./helpers.js` but helper module does not export it.

**Acceptance criteria:**
- `npm run typecheck -w @jurnapod/modules-treasury` passes
- Treasury unit tests pass (or clear report of any external blockers)
- No changes outside allowed files

---

### Scope B: CashBankService posting integration
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files allowed:**
- `packages/modules/treasury/src/cash-bank-service.ts`
- `packages/modules/treasury/src/posting.ts` (only if needed for interface compatibility)

**Primary objective:**
- Replace `postToJournal()` placeholder throw with functional posting flow.

**Required behavior:**
- Preserve doc type mapping:
  - `MUTATION` -> `CASH_BANK_MUTATION`
  - `TOP_UP` -> `CASH_BANK_TOP_UP`
  - `WITHDRAWAL` -> `CASH_BANK_WITHDRAWAL`
  - `FOREX` -> `CASH_BANK_FOREX`
- For void mode, use `${baseDocType}_VOID`
- Use `CashBankPostingMapper` and injected `postingServiceFactory`
- Return `PostingResult`

**Acceptance criteria:**
- No placeholder throws remain in `postToJournal()`
- Treasury typecheck/build still pass
- No route or API adapter changes in this scope

---

## Integration Sequence

1. ✅ Complete Scope A + Scope B in parallel
2. ✅ Re-run treasury checks (typecheck pass)
3. Next: API adapter wiring and route migration (Batch 2/3)

---

## Batch 2 (Adapter-only)

### Scope C: API adapter composition seam
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files changed:**
- `apps/api/src/lib/treasury-adapter.ts`

**Delivered:**
- Added `createCashBankService(db?)` composer export
- `KyselyPostingRepository` aligned to implement posting contracts
- Posting repository line-date fallback support retained

---

## Batch 3 (Route-only)

### Scope D: Route migration to treasury service
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files changed:**
- `apps/api/src/routes/cash-bank-transactions.ts`

**Delivered:**
- Route now uses `createCashBankService()`
- Replaced direct `../lib/cash-bank.js` mutation calls with treasury service calls
- Preserved auth/permission checks and error mappings

---

## Batch 4 (Corrective + Validation)

### Scope E1: Posting transaction-owner safety fix
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files changed:**
- `packages/modules/treasury/src/cash-bank-service.ts`

**Delivered:**
- `postToJournal()` now calls posting with `{ transactionOwner: "external" }`
- Prevents runtime failure on missing begin/commit/rollback in adapter posting repository

### Scope E2: Adapter import cleanup
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files changed:**
- `apps/api/src/lib/treasury-adapter.ts`

**Delivered:**
- Removed unused import introduced during Scope C

### Scope F: Transactional posting via same executor (P0 fix)
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files changed:**
- `apps/api/src/lib/treasury-adapter.ts`

**Delivered:**
- `KyselyCashBankRepository` now implements `PostingRepository` alongside `CashBankRepository`
- All DB operations route through `_activeExecutor` (transaction-aware)
- `withTransaction()` sets `_executor` so posting uses same DB connection as status update
- `postingServiceFactory` now passes the passed `repository` directly to `PostingService` (instead of creating separate `KyselyPostingRepository` with independent executor)
- Resolves P0 partial-posting risk

### Scope G: Missing FiscalYearNotOpenError handler in void route (P1 fix)
**Agent:** bmad-agent-dev  
**Status:** ✅ DONE  
**Files changed:**
- `apps/api/src/routes/cash-bank-transactions.ts`

**Delivered:**
- Added `FiscalYearNotOpenError` handler to void route with same `errorResponse("FISCAL_YEAR_CLOSED", error.message, 400)` mapping as post route

### Scope H: cash-bank.ts → thin re-export shim (cleanup)
**Agent:** bmad-agent-dev (direct)  
**Status:** ✅ DONE  
**Files changed:**
- `apps/api/src/lib/cash-bank.ts` (766 lines → 52 lines)

**Delivered:**
- Removed all duplicate domain logic (types, helpers, repository, posting, operations)
- Kept only named re-exports from `@jurnapod/modules-treasury`
- Preserved `__cashBankTestables` pointing to treasury functions (maintains test compatibility)
- All 16 existing tests still pass (16/16)

---

## Validation Snapshot

- ✅ `npm run typecheck -w @jurnapod/modules-treasury`
- ✅ `npm run build -w @jurnapod/modules-treasury`
- ✅ `npm run typecheck -w @jurnapod/api`
- ✅ `npm run build -w @jurnapod/api`
- ✅ `npm run test:unit:single -w @jurnapod/api src/lib/cash-bank.test.ts`
- ✅ `npm run test:unit:critical -w @jurnapod/api`
- ✅ `npm run test:unit -w @jurnapod/api` (1619 tests pass, 0 fail)
- ⚠️ `npm run lint -w @jurnapod/api` — fails due to pre-existing repo-wide lint backlog (not scoped to Epic 25)
- ✅ Shim validation: `cash-bank.test.ts` 16/16 pass via treasury re-exports

---

## Open Items

- ✅ `apps/api/src/lib/cash-bank.ts` reduced to thin re-export shim (766 lines → 52 lines)
- ✅ All Epic 25 stories complete — epic status: `done`

## Risk Notes

- P1 risk if posting placeholder remains: post/void can fail at runtime.
- P2 risk if tests remain uncompilable: Story 25.4 cannot be marked done.
