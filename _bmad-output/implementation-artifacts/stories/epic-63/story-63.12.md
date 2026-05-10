# Story 63-12: Update remaining test files to use extracted fixtures

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-12 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **all remaining test files to use extracted fixtures from stories 63-5 through 63-11**,  
So that **no raw SQL INSERT remains in any integration test for setup**.

## Context

After fixtures are created in stories 63-5 through 63-11, remaining test files still use raw SQL that should be replaced.

**Remaining files:**
1. `apps/api/__test__/integration/audit/audit-log-filter.test.ts` -- needs `createTestAuditLog` fixture
2. `apps/api/__test__/integration/sales/ar-snapshot-trigger-compatibility.test.ts` -- needs `createTestReconciliationSnapshot` fixture
3. `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts` -- needs `createTestInventoryAccount` (TODO already present)
4. Any remaining reporting tests not covered by earlier stories

**Fix:**
1. Create `createTestAuditLog` fixture in `packages/modules/platform/test-fixtures/`
2. Create `createTestReconciliationSnapshot` fixture in owner package
3. Update all remaining test files
4. Run full test suite to verify

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Update remaining files, all tests pass, lint:fixture-flow passes
- [x] **Error paths identified:** Fixture not available for some edge case
- [x] **Edge cases identified:** Files that need multiple fixture types
- [x] **Test fixture needs identified:** `createTestAuditLog`, `createTestReconciliationSnapshot`
- [x] **Integration test scope defined:** All affected files are integration tests
- [x] **Negative auth test role selected:** N/A -- cleanup story

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Create audit log fixture | Happy | Integration |
| Create reconciliation snapshot fixture | Happy | Integration |
| Update audit-log-filter test | Happy | Integration |
| Update ar-snapshot test | Happy | Integration |
| Resolve inventory-subledger TODO | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no error boundary changes.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/modules-platform`, owner package for reconciliation snapshot
- [x] **Cross-module decisions identified:** None
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Create remaining fixtures in owner packages | platform, owner | Owner-package model | N/A | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: No raw INSERT INTO audit_logs for setup**
**Given** all test files
**When** searched
**Then** zero raw `INSERT INTO audit_logs` statements exist for test setup

**AC2: No raw INSERT INTO ap_reconciliation_snapshots for setup**
**Given** all test files
**When** searched
**Then** zero raw `INSERT INTO ap_reconciliation_snapshots` statements exist for test setup

**AC3: inventory-subledger-reconciliation TODO resolved**
**Given** `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts`
**When** inspected
**Then** the TODO comment for `createTestInventoryAccount` is resolved and the fixture is used

**AC4: Full test suite passes**
**Given** the full test suite
**When** executed
**Then** all tests pass

**AC5: lint:fixture-flow passes**
**Given** the fixture flow linter
**When** executed
**Then** `npm run lint:fixture-flow` exits 0 with no violations

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/audit/audit-log-filter.test.ts` | To be migrated |
| 2 | `apps/api/__test__/integration/sales/ar-snapshot-trigger-compatibility.test.ts` | To be migrated |
| 3 | `apps/api/__test__/integration/accounting/inventory-subledger-reconciliation.test.ts` | To be migrated |
| 4 | Any remaining reporting tests with raw SQL | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in remaining test suites
- [ ] Happy paths to test:
  - [ ] All remaining files use canonical fixtures
  - [ ] Full test suite passes
- [ ] Error paths to test:
  - [ ] lint:fixture-flow violations

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Audit log and reconciliation snapshot fixtures
- [x] Existing canonical fixtures reviewed: All fixtures from stories 63-5 through 63-11
- [x] Fixture location: `packages/modules/platform/test-fixtures/`, owner package

### Fixture Creation/Update
- [x] **New fixtures needed:**
  - [x] `createTestAuditLog(db, opts)`
  - [x] `createTestReconciliationSnapshot(db, opts)`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: All remaining files
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Wait for Stories 63-5 through 63-11 to complete
- [ ] Audit all remaining test files for raw SQL INSERT/UPDATE
- [ ] Create `createTestAuditLog` fixture
- [ ] Create `createTestReconciliationSnapshot` fixture
- [ ] Update `audit-log-filter.test.ts`
- [ ] Update `ar-snapshot-trigger-compatibility.test.ts`
- [ ] Resolve TODO in `inventory-subledger-reconciliation.test.ts`
- [ ] Update any other remaining files
- [ ] Run `npm run lint:fixture-flow`
- [ ] Run full test suite

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/platform/test-fixtures/audit-log-fixtures.ts` | Audit log fixture |
| Owner package test-fixtures file | Reconciliation snapshot fixture |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/platform/src/index.ts` | Modify | Export audit log fixture |
| Owner package index | Modify | Export reconciliation snapshot fixture |
| Remaining test files | Modify | Use canonical fixtures |

## Estimated Effort

1 day

## Risk Level

Medium (P1 -- depends on all previous fixture stories)

## Dev Notes

- **CRITICAL:** This story depends on Stories 63-5 through 63-11. Do not start until all previous fixture stories are complete.
- `createTestAuditLog` should create audit log entries through the production audit service if one exists, or through canonical DB insertion if not
- `createTestReconciliationSnapshot` should create snapshots through the production reconciliation service
- The `inventory-subledger-reconciliation.test.ts` TODO should be resolved using the `createTestAccount` fixture from Story 63-5
- Run `lint:fixture-flow` early and often to catch violations
- If any file cannot be updated due to missing fixtures, document it and create a follow-up story

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? No

### Idempotency
- [ ] Idempotency key field: N/A

### Feature Flags
- [ ] Feature flag required? No

### Validation Rules
- [ ] `company_id` must match authenticated company: N/A

### Error Handling
- [ ] Retryable errors: N/A
- [ ] Non-retryable errors: N/A

### Health Check
- [ ] Health check required? No

## File List

- `packages/modules/platform/test-fixtures/audit-log-fixtures.ts` (new)
- Reconciliation snapshot fixture file (new)
- Package index files
- Remaining test files

## Validation Evidence

```bash
# Verify no raw SQL remains in any integration test
grep -rn "INSERT INTO audit_logs" apps/api/__test__/integration/ || echo "PASS: no raw audit SQL"
grep -rn "INSERT INTO ap_reconciliation_snapshots" apps/api/__test__/integration/ || echo "PASS: no raw snapshot SQL"

# Run lint:fixture-flow
npm run lint:fixture-flow -w @jurnapod/api

# Run full suite
npm test -w @jurnapod/api -- --run
```

## Dependencies

- **Stories 63-5 through 63-11** -- MUST all be complete before starting

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A -- no contract changes.

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This is the cleanup story that ties together all fixture extractions. Its success is measured by `lint:fixture-flow` passing with zero violations. If violations remain after all updates, investigate whether:
1. A fixture is missing for a specific domain
2. The linter has false positives
3. Some raw SQL is genuinely needed (e.g., for read-only verification)

Only raw SQL for teardown, read-only verification, and schema introspection is allowed per project policy. All setup writes must use canonical fixtures.
