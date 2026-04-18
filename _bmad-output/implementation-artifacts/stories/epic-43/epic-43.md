# Epic 43: Action Item Completion + Production Hardening

**Status:** done
**Theme:** Close Epic 41/42 action items + fix production safety gaps + fix package lint
**Started:** 2026-04-14
**Completed:** 2026-04-15

## Blocker (RESOLVED 2026-04-15)

~~`npm run lint -w @jurnapod/api` exits with 2 errors in `apps/api/src/lib/sync-modules.ts`~~
~~- Line 126: `catch (_)` — `_` is defined but never used~~
~~- Line 129: `catch (_)` — `_` is defined but never used~~

✅ **RESOLVED**: Changed `catch (_)` → `catch` (empty catch) at lines 126 and 129 in `sync-modules.ts`. This is a minimal, purely stylistic fix — no functional change, best-effort cleanup semantics preserved.

## Context

Epic 41 (Backoffice Auth Token Centralization) and Epic 42 (Test Infrastructure Hardening) closed with several follow-through items:

- **E42-A2** (P2): Fix pre-existing intermittent failures in `import/apply.test.ts` and `inventory/items/update.test.ts`
- **E42-A3** (P2): Document canonical `beforeAll` seedCtx fixture pattern in `project-context.md`
- **E42-A1** (P2): Require "production impact" review in infrastructure epic plans
- **Production TODOs**: `stock.ts` lacks outlet validation against company's outlets; `sales/invoices.ts` uses a TODO'd update schema
- **Package lint**: `@jurnapod/telemetry` has duplicate `exports` key in `package.json`

Epic 43 addresses these cleanly scoped items with no new feature work.

## Goals

1. Fix pre-existing intermittent test failures to achieve consistent green CI
2. Harden stock and invoice routes against incorrect outlet access
3. Fix package.json lint error in telemetry package
4. Document the canonical `beforeAll` seedCtx fixture pattern
5. Run full validation gate

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| [43.1](./story-43.1.md) | Fix intermittent test failures | done | 2h | |
| [43.2](./story-43.2.md) | Stock outlet validation + invoice update schema | done | 2h | |
| [43.3](./story-43.3.md) | Fix telemetry package.json duplicate exports | done | 30m | |
| [43.4](./story-43.4.md) | Document canonical beforeAll seedCtx pattern | done | 1h | |
| [43.5](./story-43.5.md) | Validation & final verification | done | 30m | |

## Success Criteria

- [x] `npm test -w @jurnapod/api` — 135 files pass, 940 passed, 3 skipped (fresh evidence: 2026-04-15)
- [x] `npm run lint -w @jurnapod/api` — **0 errors** (fixed: `catch (_)` → `catch` at lines 126, 129 in sync-modules.ts; 2026-04-15)
- [x] `npm run lint -w @jurnapod/telemetry` — 0 errors (fresh evidence: 2026-04-15)
- [x] `npm run typecheck -w @jurnapod/api` — clean output (fresh evidence: 2026-04-15)
- [x] `stock.ts` validates outlet belongs to authenticated company before stock operations
- [x] `sales/invoices.ts` uses proper `SalesInvoiceUpdateRequestSchema` (current invoicing fields; future customer-based fields deferred)
- [x] `project-context.md` Testing Rules section documents canonical `beforeAll` seedCtx pattern
- [x] Focused auth tests added: stock 403 and invoice PATCH outlet access
  - `apps/api/__test__/integration/stock/outlet-access.test.ts` — 2 passed
  - `apps/api/__test__/integration/sales/invoices-update.test.ts` — 6 passed
- [x] `sprint-status.yaml` — Epic 43 and all stories marked done ✅

## Dependencies

None — all items are self-contained.

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `import/apply.test.ts` deadlock under parallel load | Medium | Low-Medium | Increase deadlock retry backoff (10 attempts × 200ms) |
| `inventory/items/update.test.ts` pollution source unclear | Medium | Low | Isolate test state, run file alone to confirm |
| ~~Missing focused stock 403 test~~ | — | — | ✅ RESOLVED: `stock/outlet-access.test.ts` (2 tests) |
| ~~Missing focused invoice PATCH test~~ | — | — | ✅ RESOLVED: `sales/invoices-update.test.ts` (6 tests) |
| Telemetry export subpath strategy inconsistent with `files: ["dist"]` | Low | Low | P2 follow-up: normalize all exports to `dist/` |
| ~~PRE-EXISTING lint errors in sync-modules.ts~~ | — | — | ✅ **RESOLVED**: `catch (_)` → `catch` (lines 126, 129) |

## Notes

Items addressed from Epic 41/42 retrospectives:
- E42-A2: Intermittent test failures (P2) — ✅ resolved
- E42-A3: Document beforeAll seedCtx pattern (P2) — ✅ resolved
- E42-A1: Production impact review (P2 — applied to Story 43.2) — ✅ resolved
- `stock.ts` TODO: Add outlet validation against company's outlets (P2) — ✅ resolved
- `sales/invoices.ts` TODO: Create proper update schema (P2) — ✅ resolved
- Package lint: duplicate `exports` in telemetry (P3) — ✅ resolved

**Closeout status (2026-04-15):** Stories 43.1–43.5 fully implemented and tested. All validation gates now PASS:
- ✅ Test suite: 135 files, 940 passed, 3 skipped
- ✅ API lint: 0 errors (fixed `catch (_)` → `catch` in sync-modules.ts lines 126, 129)
- ✅ Telemetry lint: 0 errors
- ✅ Typecheck: clean
- ✅ Focused auth tests: present and passing

## Retrospective

See: [Epic 43 Retrospective](./epic-43.retrospective.md)
