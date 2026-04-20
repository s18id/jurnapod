# File Structure Gap Register — Epic 48

> **Baseline Date:** 2026-04-21  
> **Scope:** Active scope (enforced) + Deferred scope (policy)  
> **Status:** Known violations at time of Story 48.7/48.8 creation

---

## Active Scope Violations (Enforced by CI Ratchet)

The following violations exist in active scope. They are captured in `file-structure-baseline.json` as tolerated debt. CI will NOT fail on these. CI WILL fail on new violations not in this baseline.

| Violation ID | Rule ID | File Path | Description | Severity |
|-------------|---------|----------|-------------|----------|
| V-001 | FS-FORBIDDEN-003 | `apps/api/src/routes/companies.ts.bak2` | Backup file in source tree | P2 |
| V-002 | FS-FORBIDDEN-002 | `apps/api/src/middleware/telemetry.test.ts` | Test file alongside source | P2 |
| V-003 | FS-FORBIDDEN-002 | `apps/api/src/lib/cogs-posting.test.ts` | Test file alongside source | P2 |
| V-004 | FS-FORBIDDEN-002 | `packages/modules/accounting/src/posting.test.ts` | Test file alongside source | P2 |
| V-005 | FS-FORBIDDEN-002 | `packages/modules/treasury/src/helpers.test.ts` | Test file alongside source | P2 |
| V-006 | FS-FORBIDDEN-002 | `packages/modules/treasury/src/cash-bank-service.test.ts` | Test file alongside source | P2 |
| V-007 | FS-FORBIDDEN-002 | `packages/modules/treasury/src/journal-builder.test.ts` | Test file alongside source | P2 |
| V-008 | FS-FORBIDDEN-002 | `packages/modules/reservations/src/time/timestamp.test.ts` | Test file alongside source | P2 |
| V-009 | FS-FORBIDDEN-002 | `packages/modules/reservations/src/time/overlap.test.ts` | Test file alongside source | P2 |

**Total active-scope violations: 9**

---

## Deferred Scope Violations (Policy Only — Not Enforced)

These violations exist in `apps/backoffice` and `apps/pos` (scope-frozen). They are documented here for visibility but are NOT subject to CI failure until the freeze lifts.

| Violation ID | Rule ID | File Path | Description | Severity |
|-------------|---------|----------|-------------|----------|
| D-001 | FS-FORBIDDEN-002 | `apps/pos/**/__tests__/*.test.ts` | Tests inside src/ directories | P2 (deferred) |
| D-002 | FS-FORBIDDEN-002 | `apps/backoffice/**/__tests__/*.test.ts` | Tests inside src/ directories | P2 (deferred) |

**Note:** Full enumeration of deferred scope violations deferred until freeze lifts.

---

## Violation Remediation Guidelines

### V-001: Backup File (`companies.ts.bak2`)
**Fix:** Delete `apps/api/src/routes/companies.ts.bak2`  
**Risk:** None — this is a stale backup  
**Rule:** FS-FORBIDDEN-003

### V-002, V-003: API Tests Alongside Source
**Fix:** Move `telemetry.test.ts` to `apps/api/__test__/unit/middleware/telemetry.test.ts`  
**Fix:** Move `cogs-posting.test.ts` to appropriate `__test__/` location  
**Risk:** Low — these are existing tests that should be in canonical locations  
**Rule:** FS-FORBIDDEN-002

### V-004 through V-009: Module Tests Alongside Source
**Fix:** Move each `*.test.ts` from `src/` to `packages/modules/{name}/__test__/unit/`  
**Risk:** Low — existing tests in wrong location  
**Rule:** FS-FORBIDDEN-002

---

## Baseline Stability Policy

- This baseline is **frozen** after Story 48.8 creation.
- Violations removed via intentional cleanup stories may be removed from the baseline.
- New violations added after this point WILL be flagged by CI ratchet (Story 48.9).
- Baseline must be manually updated when violations are intentionally fixed.

---

## Companion Artifacts

| Artifact | Path |
|----------|------|
| Structure rules | `_bmad-output/planning-artifacts/file-structure-standard-v1.md` |
| Baseline JSON | `_bmad-output/planning-artifacts/file-structure-baseline.json` |
| Validation script | `scripts/validate-structure-conformance.ts` |
| Story 48.7 | `_bmad-output/implementation-artifacts/stories/epic-48/story-48.7.md` |
| Story 48.8 | `_bmad-output/implementation-artifacts/stories/epic-48/story-48.8.md` |
