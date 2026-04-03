# story-29.1: Scope freeze + parity matrix + boundary contracts

## Description

Establish explicit decisions on idempotency, voidability, book/run consistency, and transaction boundaries for the fixed-assets extraction. This story produces a written decision log and parity matrix that all subsequent stories reference.

## Context

This is the foundation story for Epic 29. Before any code is written, the team needs explicit agreement on:

1. **Idempotency contract** — Is `idempotency_key` required or optional on mutation endpoints?
2. **Void semantics** — Which lifecycle events are voidable? What does voiding actually do (reversal journal + book update)?
3. **Book/run consistency** — When a depreciation run executes, are `fixed_asset_books` and `asset_depreciation_runs` updated in the same DB transaction?
4. **Transaction atomicity** — For each mutation type, what is the atomic unit?
5. **Module placement** — Confirm we are extending `modules-accounting`, not creating a new package.

## Approach

1. Read all three source files: `fixed-assets/index.ts`, `depreciation.ts`, `fixed-assets-lifecycle.ts`
2. For each endpoint, document:
   - Current idempotency behavior (if any)
   - Current transaction scope (single write? multi-write?)
   - Current void behavior
   - Current journal posting behavior
3. Cross-reference with existing tests in `accounts.fixed-assets.test.ts`
4. Write explicit decisions to story completion note

## Acceptance Criteria

- [ ] Decision log produced covering all 5 decision points above
- [ ] Parity matrix documenting current behavior for each of the 18 endpoints
- [ ] Confirmed: extend `modules-accounting` (not new package)
- [ ] Confirmed: idempotency_key remains optional (current behavior)
- [ ] Confirmed: void creates reversal journal in same transaction
- [ ] Confirmed: depreciation run updates book + runs in same transaction
- [ ] `npm run typecheck -w @jurnapod/modules-accounting`
- [ ] `npm run typecheck -w @jurnapod/api`

## Files to Read

```
apps/api/src/lib/fixed-assets/index.ts         # 648 LOC - categories + assets CRUD
apps/api/src/lib/depreciation.ts               # 704 LOC - plan/run orchestration
apps/api/src/lib/fixed-assets-lifecycle.ts      # 1868 LOC - lifecycle events
apps/api/src/routes/accounts.fixed-assets.test.ts  # existing test coverage
apps/api/src/routes/accounts.ts                 # all 18 endpoint signatures
packages/modules/accounting/src/posting/depreciation.ts  # existing posting hook
packages/shared/src/schemas/fixed-assets.ts     # existing schemas
packages/shared/src/schemas/depreciation.ts     # existing schemas
```

## Dependency

- None — story 29.1 is the foundation

## Output

Create `_bmad-output/implementation-artifacts/stories/epic-29/story-29.1.completion.md` with:
1. Decision log (one entry per decision)
2. Parity matrix table (endpoint | idempotency | voidable | journal | tx_scope)
3. Confirmed architectural direction

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
```

## Status

**Status:** review