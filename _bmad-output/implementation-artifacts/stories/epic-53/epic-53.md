# Epic 53: Datetime API Consolidation Execution

## Context

Epic 52 (Datetime Standardization + Idempotency Hardening) established the canonical UTC ISO Z-string as the internal + API datetime format and completed the audit of all datetime utility layers. Story **52-1** produced two planning documents that define the consolidation:

- `_bmad-output/planning-artifacts/datetime-standardization-summary.md`
- `_bmad-output/planning-artifacts/datetime-api-consolidation-plan.md`

This epic executes the actual API consolidation: renaming ~26 functions to a namespaced `toUtcIso`/`fromUtcIso` API, updating ~100+ consumer files, fixing route validation, cleaning up raw `.toISOString()` patterns, removing deprecated wrappers, and adding test assertions.

## Scope

- `packages/shared/src/schemas/datetime.ts` — core rewrite
- `apps/api/src/lib/date-helpers.ts` — re-export update
- All `packages/modules/*` with datetime usage (8 module packages)
- `apps/api/src/lib/*` + `apps/api/src/routes/*` with datetime usage
- `packages/pos-sync`, `packages/sync-core`
- Unit + integration test files

## Architecture Program Baseline

This epic operates under the S48–S61 correctness-first program:

- **Priority:** `Correctness > Safety > Speed`
- **Scope rule:** No net-new feature scope — consolidation/renaming only
- **SOLID/DRY/KISS:** Applied at kickoff, midpoint, and pre-close

## Standards Declared

| Standard | Rule |
|----------|------|
| Canonical internal + API format | UTC ISO Z string — `z.string().datetime()` with NO `{offset: true}` |
| Business logic values | Z string only — conversions happen only at two DB boundary points |
| DB write (DATETIME) | `fromUtcIso.mysql(zStr)` — Z → YYYY-MM-DD HH:mm:ss |
| DB write (BIGINT) | `fromUtcIso.epochMs(zStr)` — Z → epoch ms |
| DB read (DATETIME) | `toUtcIso.dateLike(dbVal)` — Date/MySQL → Z |
| DB read (BIGINT) | `toUtcIso.epochMs(ms)` — epoch ms → Z |
| Namespaced API | `toUtcIso` (produce Z string), `fromUtcIso` (consume Z string) |
| Stale functions | Kept as deprecated wrappers during transition, removed in Phase 4 |
| YYYY-MM-DD | `DateOnlySchema` stays as-is — separate domain (business date, not UTC instant) |

## Stories

| Story | Title | Risk | Dependencies |
|-------|-------|------|-------------|
| 53-1 | Core API Surface + Route Validation | P1 | None |
| 53-2 | Accounting + Inventory Package Migration | P1 | 53-1 |
| 53-3 | Platform + Purchasing + Other Module Migration | P1 | 53-1 |
| 53-4 | API Lib + Sync Packages + Cross-cutting Touch-ups | P1 | 53-1 |
| 53-5 | Test Updates + Z$ Assertions | P2 | 53-1 through 53-4 |
| 53-6 | Cleanup — Remove Deprecated Wrappers | P2 | 53-5 |

## Execution Order

```
53-1 (core + routes)
  ├── 53-2 (accounting + inventory modules)
  ├── 53-3 (platform + purchasing + other modules)
  └── 53-4 (API lib + sync + cross-cutting)
        └── 53-5 (tests)
              └── 53-6 (final cleanup)
```

Stories 53-2, 53-3, and 53-4 can execute in parallel after 53-1 completes.

## Success Criteria

1. All datetime conversions use `toUtcIso`/`fromUtcIso` namespaced API from `packages/shared`
2. All route/schema validation uses strict `UtcIsoSchema` (Z only, no offset)
3. All raw `.toISOString()` patterns replaced with canonical functions
4. All old function names removed (no deprecated wrappers remain)
5. Build passes for all packages + API
6. Full test suite passes including new Z$ format assertions
7. `sprint-status.yaml` up to date

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Phase 2 sed creates `toUtcIso,toUtcIso` import duplications | Medium | Story 53-4 step for dedup cleanup |
| Nullable `toRfc3339(` callers missed — code returns `string\|null` but new API throws | Medium | Story 53-4: 4 known nullable callers reviewed manually |
| Import missing `toUtcIso` after rename — code won't compile | High | Import fixup script per-package; builds catch this |
| Route schema change from `{offset: true}` to strict Z-only breaks POS clients | Medium | Deployment order: POS app update first, then server. Documented as known risk. |
| Test fixture files use `.toISOString()` patterns | Low | Known scope; fixtures updated in 53-5 |
| Full build after all stories may reveal edge-case import issues | Low | Story 53-6 final build catches all |

## Reference Documents

- `_bmad-output/planning-artifacts/datetime-standardization-summary.md`
- `_bmad-output/planning-artifacts/datetime-api-consolidation-plan.md`
- `packages/shared/src/schemas/datetime.ts` (current, to be rewritten)
- `apps/api/src/lib/date-helpers.ts` (current re-export to be updated)
