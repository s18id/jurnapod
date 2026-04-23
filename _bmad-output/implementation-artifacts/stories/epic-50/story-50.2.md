# Story 50.2: Q49-001 Fixture Extraction (Pass 1)

> **HARD GATE (E49-A1):** Implementation of this story MUST NOT begin until:
> 1. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
> 2. E49-A1 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** backlog

---

## Story Context

**Epic:** Epic 50 — Ledger Correctness Hardening
**Owner:** @bmad-dev
**Type:** Architecture/correctness (mandatory program requirement)
**Module:** `@jurnapod/db`
**Sprint:** 50 (2026-04-27 to 2026-05-08)

---

## Problem Statement

Q49-001 is a follow-on from Epic 49's fixture extraction work. The plan exists at `epic-49-q49-001-test-fixtures-execution-pass-1.md` and execution must begin in Sprint 50.

---

## E49-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for fixture extraction because:
> - Fixture extraction can inadvertently break backward compatibility (consumer flip verification required)
> - Canonical fixture patterns must be verified deterministic (no `Date.now()`, `Math.random()` leaks)
> - Epic 49's Q49-001 Pass 1 required backward-compatibility verification at each step

**When required:** This story extracts and moves fixtures between packages. Second-pass review is **MANDATORY** because fixture changes affect all downstream consumers.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] `packages/db/src/test-fixtures/*` scaffold verified deterministic (no `Date.now()`, no `Math.random()`)
- [ ] Backward-compatibility verified: existing tests pass without changes
- [ ] Consumer flip (`apps/api/__test__/fixtures/index.ts`) verified working
- [ ] `npm run build -w @jurnapod/db` passes
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] Representative suites (fiscal-year-close, ap-reconciliation) verified 3× green
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Package fixture scaffold created (`packages/db/src/test-fixtures/*`)

**AC2:** Portable fixture core moved (company/outlet/user/supplier/fiscal/AP settings + registry)

**AC3:** API wrapper backward-compatible (existing tests pass without changes)

**AC4:** Consumer flipped (`apps/api/__test__/fixtures/index.ts` imports from package)

**AC5:** `npm run build -w @jurnapod/db` passes

**AC6:** `npm run typecheck -w @jurnapod/api` passes

**AC7:** Representative suites pass (fiscal-year-close, ap-reconciliation)

---

## Execution Plan Reference

See: `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`

---

## Exit Criteria

- All validation commands pass:
  ```bash
  npm run build -w @jurnapod/db
  npm run typecheck -w @jurnapod/api
  npm run test:single -- "apps/api/__test__/integration/accounting/fiscal-year-close.test.ts" -w @jurnapod/api
  npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api
  ```