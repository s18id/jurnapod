# Story 56.2: CI Lint Gate for No-Business-Trigger Rule

**Status:** ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic N --story N-X --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only

---

## Story

As a **code reviewer**,  
I want **a CI lint gate that detects new business-logic DB triggers in migrations**,  
So that **violations of the "no new business DB triggers" rule (AGENTS.md §C) are caught before merging**.

## Context

**Source:** Epic 55 Retrospective action item E55-A1.

During Epic 55 Story 55.1, Migration 0191's `ap_reconciliation_snapshots_append_only` trigger was discovered to be blocking `INSERT ... ON DUPLICATE KEY`. This trigger violated AGENTS.md §C ("No new business DB triggers") — but there was no CI enforcement to catch it. The migration passed review.

The rule existed but was unenforceable. This story adds enforcement.

### E55-A1 Closure Criteria

> **From action-items.md:**
> - `npm run lint:migrations` exits 0
> - Any new migration adding a business-logic trigger (UPDATE/DELETE blocking, validation in trigger body) fails CI with clear error message

### What Constitutes a "Business-Logic Trigger"

A trigger that enforces business invariants in the database engine rather than in application code. Examples:
- Blocking UPDATE/DELETE on a table (the `ap_reconciliation_snapshots_append_only` trigger)
- Validating field values or relationships in trigger body
- Enforcing state machine transitions at the DB level

NOT a business-logic trigger:
- Audit timestamp triggers (`SET NEW.updated_at = NOW()`)
- Generated column triggers without business invariants

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** 2 (no-trigger migration passes, annotation-allowed trigger passes)
- [x] **Error paths identified:** 2 (unannotated trigger fails, business-logic trigger fails)
- [x] **Edge cases identified:** false positives on audit-only triggers, trigger in function body
- [x] **Test fixture needs identified:** Synthetic bad migration for test
- [x] **Integration test scope defined:** Lint script testable as CI command — real file scan
- [x] **Negative auth test role selected:** N/A — infra story

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Migration with no triggers passes | Happy | Unit + CI |
| Migration with annotation-allowed trigger passes | Happy | Unit + CI |
| Migration with unannotated business-logic trigger fails | Error | Unit + CI |
| Migration with unannotated audit-only trigger (`SET NEW.updated_at`) passes | Edge | Unit |
| Existing business-logic trigger (Migration 0191) flagged | Edge | Unit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY)

### Pre-Implementation Checklist

- [x] **Modules touched:** `scripts/` (new lint script), `packages/db` (migration scan target)
- [x] **Cross-module decisions identified:** Trigger detection approach — regex vs SQL parsing
- [x] **Decision: Detection pattern** — regex `CREATE TRIGGER` + `SIGNAL` or `BEGIN` blocks with validation logic (pragmatic, not perfect)
- [x] **Decision: Annotation mechanism** — code comment `-- lint:allow-business-trigger` in the migration file before the CREATE TRIGGER statement
- [x] **Decision: Script location** — `scripts/lint-migrations.ts` following existing script conventions

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Sign-Off |
|---|----------|-----------------|-----------|------------------------|----------|
| 1 | Regex-based detection (not SQL parser) | `scripts/` | Migrations follow predictable patterns; full SQL parser is overkill | `node-sql-parser` (heavier, slower for CI) | — |
| 2 | Annotation-based allowlist (`-- lint:allow-business-trigger`) | `scripts/` | Explicit developer intent; reviewer sees the annotation in diff | Config file allowlist (separate source of truth, easier to game) | — |
| 3 | Script in `scripts/` as `lint:migrations` npm script | `scripts/` | Follows existing script conventions (`update-sprint-status.ts`, `validate-sprint-status.ts`) | ESLint plugin (would require parser configuration) | — |

---

## Acceptance Criteria

**AC1: No-trigger migration passes**
**Given** a migration file with no `CREATE TRIGGER` statement
**When** `npm run lint:migrations` is run
**Then** it exits 0 with no warnings

**AC2: Unannotated business-logic trigger fails**
**Given** a migration file with a trigger containing `SIGNAL SQLSTATE` or similar business-enforcement
**When** `npm run lint:migrations` is run
**Then** it exits non-zero with a clear error message identifying the file and trigger name

**AC3: Annotated allowed trigger passes**
**Given** a migration file with a trigger preceded by `-- lint:allow-business-trigger`
**When** `npm run lint:migrations` is run
**Then** it exits 0 (the annotation explicitly authorizes the trigger)

**AC4: Integration test catches a synthetic bad migration**
**Given** a test migration file with a business-logic trigger
**When** the lint script is invoked programmatically
**Then** it detects the violation

**AC5: Documentation updated in AGENTS.md §C**
**Given** the CI gate is operational
**When** a developer reads AGENTS.md §C
**Then** they see a reference to `npm run lint:migrations` as the enforcement mechanism

**AC6: Existing trigger grandfathered**
**Given** the current codebase with Migration 0191 (existing business-logic trigger)
**When** `npm run lint:migrations` is run for the first time
**Then** it exits 0 — Migration 0191 is annotated with `-- lint:allow-business-trigger` and grandfathered

**AC7: Code review GO required**

---

## Test Coverage Criteria

- [x] Coverage target: all paths
- [x] Happy paths to test:
  - [x] No-trigger migration
  - [x] Annotated allowed trigger
- [x] Error paths to test:
  - [x] Unannotated business-logic trigger
  - [x] Multiple triggers in one migration (fail on first violation)

## Tasks / Subtasks

- [ ] Create `scripts/lint-migrations.ts` — scan `packages/db/src/migrations/` for `CREATE TRIGGER` patterns; expose pure function `lintMigrationsContent(content: string): LintResult[]` for unit testing without filesystem access; support `--stdin` flag for pipe-mode invocation
- [ ] Implement `-- lint:allow-business-trigger` annotation detection
- [ ] Add `"lint:migrations": "npx tsx scripts/lint-migrations.ts"` to root `package.json`
- [ ] Create test for the lint script with synthetic migrations
- [ ] Add `-- lint:allow-business-trigger` annotation to Migration 0191 (grandfather existing trigger)
- [ ] Update AGENTS.md §C to reference the CI gate
- [ ] Run `npm run lint:migrations` against current codebase — verify exit 0 (grandfathering works)

## Files to Create

| File | Description |
|------|-------------|
| `scripts/lint-migrations.ts` | CI lint script detecting business-logic triggers |
| `scripts/__test__/fixtures/bad-migration-with-trigger.ts` | Synthetic bad migration for test |
| `scripts/__test__/fixtures/good-migration-no-trigger.ts` | Synthetic clean migration for test |
| `scripts/__test__/fixtures/good-migration-annotated-trigger.ts` | Synthetic annotated migration for test |
| `scripts/__test__/unit/lint-migrations.test.ts` | Unit tests for the lint script |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `"lint:migrations"` script |
| `AGENTS.md` §C | Modify | Add reference to CI gate |
| `packages/db/src/migrations/0191-harden-reconciliation-snapshots.ts` | Modify | Add `-- lint:allow-business-trigger` annotation before the `CREATE TRIGGER` statement to grandfather existing trigger |
| `.github/workflows/ci.yml` (if exists) | Modify | Add `lint:migrations` to CI pipeline |

## Estimated Effort

Small (1 day)

## Risk Level

Low — standalone script, no production runtime impact

## Dev Notes

- Keep detection simple: regex `CREATE\s+TRIGGER` + check for `SIGNAL` or `BEGIN...END` blocks with validation logic
- Annotation format: `-- lint:allow-business-trigger` on the line immediately before `CREATE TRIGGER`
- The Migration 0191 trigger should be grandfathered — the annotation should already be added to it so the lint gate doesn't fail on existing codebase

### Detection Algorithm Sketch

```typescript
function lintMigrations(migrationsDir: string): LintResult[] {
  const results: LintResult[] = [];
  for (const file of readMigrationFiles(migrationsDir)) {
    const content = readFile(file);
    const triggers = findCreateTriggerStatements(content);
    for (const trigger of triggers) {
      const hasAnnotation = trigger.precedingLines.some(
        l => l.includes('-- lint:allow-business-trigger')
      );
      if (hasAnnotation) continue; // explicitly allowed
      if (isBusinessLogicTrigger(trigger.body)) {
        results.push({ file, triggerName: trigger.name, error: 'Business-logic trigger without annotation' });
      }
    }
  }
  return results;
}
```

### AGENTS.md §C Update

Add at end of §C:
> **Enforcement:** CI gate `npm run lint:migrations` scans all migration files for `CREATE TRIGGER` statements without explicit `-- lint:allow-business-trigger` annotation. Migrations introducing business-logic triggers MUST use this annotation, and the trigger MUST be reviewed by the Architecture team.

## Architecture Cleanup

- [x] Architecture Cleanup Policy (A) — new file, no debt in modified area
- [x] No new business DB triggers — this story detects them

## Validation Evidence

```bash
# Run lint against current codebase
npm run lint:migrations

# Run lint script unit tests
npm run test:single -- "scripts/__test__/unit/lint-migrations.test.ts"

# Typecheck
npx tsx --version && npm run typecheck -w @jurnapod/api
```

## Dependencies

- Node.js 22+ (already satisfied)
- Existing migration files in `packages/db/src/migrations/`

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] Integration tests included in ACs (not deferred)
- [x] All new debt items added to registry before story closes
