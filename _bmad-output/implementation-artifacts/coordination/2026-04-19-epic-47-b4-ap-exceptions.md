# Coordination: Epic 47 B4 — Story 47.4 AP Exception Worklist

**Date:** 2026-04-19  
**Owner:** BMAD build agent  
**Implementation delegates:** `@bmad-dev`, `@bmad-qa`  
**Review delegate:** `@bmad-review`

## Decision Lock

- Keep `ap_exceptions` DB schema from migration `0188_ap_exceptions.sql` (no rewrite migration in this story).
- Use **int enum** (`type`, `status`) as canonical internal representation.
- Use API compatibility mapping for story-facing labels.
- AC8 trigger implemented as **on-demand detection in GET worklist**.

## Detailed Checklist (Execution Guardrail)

1. [ ] Add shared int-enum constants + schema/mapping helpers for AP exceptions.
2. [ ] Fix `createTestAPException()` fixture to match real `ap_exceptions` schema columns.
3. [ ] Implement AP exception service:
   - [ ] detection (idempotent by `company_id + exception_key`)
   - [ ] worklist filters/sort/pagination
   - [ ] assign workflow
   - [ ] resolve workflow with required note
4. [ ] Implement API routes with ACL and OR-policy for GET worklist.
5. [ ] Add integration tests (real DB) for workflow, ACL, and tenant isolation.
6. [ ] Run targeted validation (`test:single`, `typecheck`) via nohup+pid logs.
7. [ ] Run `@bmad-review` final gate (no unresolved P0/P1).

## Work Package Locks

### WP-A (parallel) — Shared contracts/mappers
- Owner: `@bmad-dev`
- Files:
  - `packages/shared/src/constants/purchasing.ts`
  - `packages/shared/src/schemas/purchasing.ts`
  - `packages/shared/src/index.ts`
- Requirements:
  - Add AP exception int enums and mapper helpers.
  - Add schema for query/assign/resolve payloads.
  - Add inline fix comments: `FIX(47.4-WP-A): ...`

### WP-B (parallel) — Fixture schema alignment
- Owner: `@bmad-dev`
- Files:
  - `apps/api/src/lib/test-fixtures.ts`
- Requirements:
  - Align `createTestAPException()` with migration 0188 columns.
  - Keep canonical fixture style and safe cleanup semantics.
  - Add inline fix comments: `FIX(47.4-WP-B): ...`

### WP-C (sequential after A/B) — Service implementation
- Owner: `@bmad-dev`
- Files:
  - `apps/api/src/lib/accounting/ap-exceptions.ts` (new)
- Requirements:
  - idempotent detection via `exception_key`
  - on-demand `detectThenList` entry point
  - assign/resolve mutations (tenant-scoped)
  - inline fix comments: `FIX(47.4-WP-C): ...`

### WP-D (sequential after C) — Route implementation
- Owner: `@bmad-dev`
- Files:
  - `apps/api/src/routes/accounting/ap-exceptions.ts` (new)
  - `apps/api/src/routes/accounting/index.ts` (route registration)
- Requirements:
  - GET worklist performs ACL OR check:
    - `accounting.journals` + `ANALYZE` OR
    - `purchasing.suppliers` + `ANALYZE`
  - PUT assign/resolve require `accounting.journals` + `UPDATE`
  - route uses shared schemas
  - inline fix comments: `FIX(47.4-WP-D): ...`

### WP-E (sequential after D) — Integration tests
- Owner: `@bmad-qa`
- Files:
  - `apps/api/__test__/integration/accounting/ap-exceptions.test.ts` (new)
- Requirements:
  - CRUD workflow: list + assign + resolve
  - on-demand detection behavior
  - tenant isolation (cross-company denied)
  - ACL: allow via either analyze path, deny for under-privileged role
  - no ad-hoc SQL setup when canonical helper exists
  - inline fix comments: `FIX(47.4-WP-E): ...`

## Validation Commands

- `npm run test:single -w @jurnapod/api -- __test__/integration/accounting/ap-exceptions.test.ts`
- `npm run typecheck -w @jurnapod/api`

> Run tests using `nohup + pid + logs` policy.

## Exit Criteria

- Story 47.4 implementation complete with passing targeted integration tests and typecheck.
- `@bmad-review` reports **No unresolved P0/P1 blockers**.
