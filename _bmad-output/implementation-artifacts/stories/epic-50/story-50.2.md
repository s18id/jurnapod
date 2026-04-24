# Story 50.2: Q49-001 Fixture Extraction (Pass 1)

> **HARD GATE (E49-A1):** Implementation of this story MUST NOT begin until:
> 1. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
> 2. E49-A1 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** ready-for-dev

---

## Story Context

**Epic:** Epic 50 — Ledger Correctness Hardening
**Owner:** @bmad-dev
**Type:** Architecture/correctness (mandatory program requirement)
**Module:** `@jurnapod/db`, `@jurnapod/modules-platform`, `@jurnapod/modules-accounting`, `@jurnapod/modules-purchasing`
**Sprint:** 50 (2026-04-27 to 2026-05-08)

---

## Problem Statement

Q49-001 is a follow-on from Epic 49's fixture extraction work. The initial plan emphasized extraction into `@jurnapod/db/test-fixtures`, but that model is not ownership-correct for domain fixtures.

For Epic 50, fixture extraction MUST follow owner-package boundaries:

- `@jurnapod/db/test-fixtures` MUST contain only DB-generic primitives/assertions
- Domain fixtures MUST live in domain owner packages (`modules-platform`, `modules-accounting`, `modules-purchasing`)
- `apps/api/src/lib/test-fixtures.ts` MUST remain a transitional re-export during migration

This story also introduces `@jurnapod/modules-purchasing` to remove purchasing fixture ownership ambiguity.

---

## E49-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for fixture extraction because:
> - Fixture extraction can inadvertently break existing consumer paths (consumer flip verification required)
> - Canonical fixture patterns must be verified deterministic (no `Date.now()`, `Math.random()` leaks)
> - Epic 49's Q49-001 Pass 1 required consumer-path integrity verification at each step

**When required:** This story extracts and moves fixtures between packages. Second-pass review is **MANDATORY** because fixture changes affect all downstream consumers.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] Owner-package fixture scaffolds verified deterministic (`modules-platform`, `modules-accounting`, `modules-purchasing`) with no `Date.now()`/`Math.random()` in business-identifying defaults
- [ ] Existing-consumer contract verified: existing tests pass without changes
- [ ] Consumer flip (`apps/api/__test__/fixtures/index.ts`) verified working
- [ ] `npm run build -w @jurnapod/db` passes
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] Representative suites (fiscal-year-close, ap-reconciliation) verified 3× green
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Ownership model is enforced in implementation:

- `@jurnapod/db/test-fixtures` contains DB-generic fixtures only
- Domain fixtures are created in owner packages

**AC2:** `@jurnapod/modules-purchasing` package scaffold is created with `src/test-fixtures/*` export surface

**AC3:** Portable domain fixture core is extracted to owner packages:

- Platform: company/outlet fixtures
- Accounting: fiscal/AP-accounting fixtures
- Purchasing: supplier/purchasing fixtures

**AC4:** API wrapper existing-consumer contract is preserved (`apps/api/src/lib/test-fixtures.ts` remains functional)

**AC5:** Consumer flip is implemented (`apps/api/__test__/fixtures/index.ts` imports moved fixture symbols from owner packages)

**AC6:** `npm run build -w @jurnapod/db` passes

**AC7:** `npm run build -w @jurnapod/modules-platform` passes

**AC8:** `npm run build -w @jurnapod/modules-accounting` passes

**AC9:** `npm run build -w @jurnapod/modules-purchasing` passes

**AC10:** `npm run typecheck -w @jurnapod/api` passes

**AC11:** Representative suites pass (fiscal-year-close, ap-reconciliation)

---

## Ownership Matrix (MANDATORY)

| Fixture Domain | Owner Package | Rule |
|---|---|---|
| DB primitives/assertions | `@jurnapod/db/test-fixtures` | MUST remain domain-agnostic |
| Company/Outlet | `@jurnapod/modules-platform` | MUST NOT be implemented in `@jurnapod/db` |
| Fiscal/AP-accounting | `@jurnapod/modules-accounting` | MUST follow accounting invariants |
| Supplier/Purchasing | `@jurnapod/modules-purchasing` | MUST be owned by purchasing package |
| API login/token/http fixtures | `apps/api/src/lib/test-fixtures.ts` | MAY remain API-runtime only |

`@jurnapod/db` MUST NOT import from `@jurnapod/modules-*`.

---

## Execution Plan Reference

Primary baseline: `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`

Epic 50 correction for this story: extraction destination MUST follow the Ownership Matrix above. Any step in the baseline that conflicts with ownership MUST be treated as superseded by this story spec.

**Batch migration execution:** Epic 50 purchasing migration execution MUST follow `_bmad-output/planning-artifacts/epic-50-purchasing-migration-batch-runbook.md`. Q49-001 Pass 1 remains the baseline for fixture extraction patterns only — it does not govern batch execution steps.

---

## Exit Criteria

- All validation commands pass:
  ```bash
  npm run build -w @jurnapod/db
  npm run build -w @jurnapod/modules-platform
  npm run build -w @jurnapod/modules-accounting
  npm run build -w @jurnapod/modules-purchasing
  npm run typecheck -w @jurnapod/api
  npm run test:single -- "apps/api/__test__/integration/accounting/fiscal-year-close.test.ts" -w @jurnapod/api
  npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api
  npm run lint:fixture-flow
  ```

- Story cannot be marked done without reviewer GO and story-owner sign-off.
