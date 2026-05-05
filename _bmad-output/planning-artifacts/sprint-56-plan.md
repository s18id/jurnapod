# Sprint 56 Plan — Correctness Infrastructure

**Generated:** 2026-05-05
**Epic:** [56 — Correctness Infrastructure](../implementation-artifacts/stories/epic-56/epic-56.md)

---

## Sprint Scope

| Story | Title | Risk | Owner | Priority |
|-------|-------|------|-------|----------|
| 56.1 | Archive Flow Trigger Constraint Resolution | P1 | @bmad-dev | **1** (must run first) |
| 56.2 | CI Lint Gate for No-Business-Trigger Rule | P1 | @bmad-dev + @bmad-testarch | 2 |

## Execution Order

```
Sprint Start
    │
    ├── Story 56.1 — Archive Flow Trigger
    │    1. Read existing trigger definition (Migration 0191)
    │    2. Create Migration 0193: modify trigger to allow status='ARCHIVED' transitions
    │    3. Add archive-path integration tests
    │    4. Update existing error-message assertions
    │    5. Verify MariaDB DELIMITER compatibility
    │    6. 3× consecutive green, code review
    │
    └── Story 56.2 — CI Lint Gate (parallel-safe after 56.1 migration is annotated)
         1. Create scripts/lint-migrations.ts with --stdin + pure function mode
         2. Add -- lint:allow-business-trigger annotation to Migration 0191
         3. Add lint:migrations npm script + CI pipeline wiring
         4. Add test fixtures (synthetic migrations)
         5. Update AGENTS.md §C + run against current codebase
         6. 3× consecutive green, code review
```

**Dependency note:** Stories 56.1 and 56.2 are largely parallel. The only coupling: Migration 0191 must be annotated (`-- lint:allow-business-trigger`) BEFORE `npm run lint:migrations` is run for the first time. This can be done in the first task of 56.2 (annotation is a single-line comment, no migration needed).

## Risk Ownership

| Risk | Severity | Owner | Mitigation |
|------|----------|-------|------------|
| R56-001: Trigger modification breaks existing append-only behavior | P0 | @bmad-dev | Story 56.1 AC1 — non-archive paths proven blocked in integration tests |
| R56-002: CI lint gate false positives on legitimate triggers | P1 | @bmad-dev + @bmad-testarch | Story 56.2 AC4 — annotation-based allowlist; audit-only trigger test case |
| R56-003: Archive flow still blocked after trigger change | P1 | @bmad-dev | Story 56.1 AC2–AC3 — integration tests prove archiving works |
| R56-004: Migration 0191 grandfathering forgotten → CI fails | P2 | @bmad-dev | Story 56.2 AC6 explicit; annotation applied before first `lint:migrations` run |
| R56-005: MariaDB DELIMITER syntax incompatibility | P2 | @bmad-dev | Verified in Dev Notes; test on MariaDB 11.x before marking done |

## Sprint Status Updates

```yaml
development_status:
  epic-56: in-progress                    # ← set now
  56-1-archive-flow-trigger-resolution: ready-for-dev   # → in-progress when picked
  56-2-ci-lint-gate-business-triggers: ready-for-dev    # → in-progress when picked
```

## Completion Criteria

1. ✅ Story 56.1: Archive trigger modified, existing tests pass, 3× consecutive green, code review GO
2. ✅ Story 56.2: CI lint gate detects bad migrations, Migration 0191 grandfathered, 3× green, code review GO
3. ✅ E55-A1 and E55-A2 closed in `action-items.md` with evidence
4. ✅ `validate-sprint-status.ts --epic 56` exits 0
5. ✅ No unresolved P0/P1 in Epic 56 scope
