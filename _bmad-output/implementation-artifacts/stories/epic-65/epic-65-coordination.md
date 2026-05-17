# Epic 65 Implementation Coordination

**Status:** active
**Scope approval:** Ahmad explicitly selected `Epic 65 only`, lifting the `apps/backoffice` freeze for Epic 65 scope only.
**Date:** 2026-05-17

---

## Pre-flight Evidence

| Gate | Result | Notes |
|------|--------|-------|
| `npm run lint -w @jurnapod/api` | PASS with warnings | 0 errors; 155 pre-existing `no-explicit-any` warnings |
| `npm run build:libs` | PASS | TypeScript build completed |
| `npm run typecheck -w @jurnapod/api` | PASS | TypeScript check completed |

---

## Coordination Rules

- All implementation work MUST remain inside Epic 65 scope.
- `apps/backoffice` changes are allowed only for Epic 65 foundation work.
- `apps/pos` MUST NOT be modified.
- Backend API behavior MUST NOT be changed for this epic.
- Domain screens from Epics 66–70 MUST NOT be implemented.
- Existing production behavior MUST be preserved unless the story explicitly replaces the foundation path.
- New code MUST use `@/` imports where supported by the app tooling.
- Business timestamps MUST NOT use native `Date` for business logic.

---

## Batch Plan

### Batch A — Tooling + Scaffolding + OpenAPI Decision

Stories: 65-0, 65-1

Allowed files:
- `apps/backoffice/package.json`
- `package-lock.json`
- `apps/backoffice/vite.config.ts`
- `apps/backoffice/tsconfig.json`
- `apps/backoffice/eslint.config.mjs`
- `apps/backoffice/src/app/**`
- `apps/backoffice/src/lib/**`
- `apps/backoffice/src/components/**`
- `_bmad-output/implementation-artifacts/stories/epic-65/**`

Outputs:
- Standard scripts: `test:unit`, `test:single`, `build:report`
- Alias support for `@/`
- Folder structure present
- OpenAPI generation decision note

### Batch B — Typed API Client + Auth Session + Query Cache

Stories: 65-2, 65-3, 65-6

Dependencies: Batch A

Allowed files:
- `apps/backoffice/src/lib/api/**`
- `apps/backoffice/src/lib/auth/**`
- `apps/backoffice/src/lib/cache/**`
- Transitional adapters in `apps/backoffice/src/lib/api-client.ts`, `auth-storage.ts`, `auth-refresh.ts`, `session.ts` only when needed for compatibility
- Tests in `apps/backoffice/__test__/unit/**`

Outputs:
- MVP typed API client for auth/users/roles/companies/outlets/inventory items/operations
- Deferred typed endpoint backlog note
- Auth session refresh + expiry affordance helpers
- QueryClient + list/detail hooks

### Batch C — Shell + Router + Shared Primitives

Stories: 65-4, 65-5, 65-7

Dependencies: Batch B

Allowed files:
- `apps/backoffice/src/app/shell/**`
- `apps/backoffice/src/app/router/**`
- Transitional adapters in `apps/backoffice/src/app/router.tsx`, `routes.ts`, `layout.tsx`
- `apps/backoffice/src/components/data-grid/**`
- `apps/backoffice/src/components/navigation/**`
- `apps/backoffice/src/components/feedback/**`
- Tests in `apps/backoffice/__test__/unit/**`

Outputs:
- Role-aware shell with online/sync status
- React Router v6 route tree or compatibility bridge if full replacement exceeds safe batch size
- Shared `EntityTable`, `FilterBar`, `DetailDrawer`, `ScopeBadge`

### Batch D — Validation + Completion Evidence

Stories: Epic 65 gate

Dependencies: Batch A–C

Outputs:
- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:unit -w @jurnapod/backoffice`
- Focused `test:single` commands for new units
- Completion notes with AC evidence

---

## Shared File Ownership

| File/Area | Owner Batch | Notes |
|-----------|-------------|-------|
| `apps/backoffice/package.json` | A | Later batches MUST NOT add scripts without updating this coordination file |
| `apps/backoffice/src/lib/api-client.ts` | B | Preserve existing API client semantics during migration |
| `apps/backoffice/src/app/router.tsx` | C | Avoid wholesale replacement unless tests prove route compatibility |
| `apps/backoffice/src/app/layout.tsx` | C | Preserve existing alert UX while adding shell requirements |
| `apps/backoffice/src/components/ui/*` | C | Shared primitive work MUST use adapters instead of duplicate components |

---

## Validation Evidence

| Gate | Result | Evidence |
|------|--------|----------|
| `npm run lint -w @jurnapod/backoffice` | PASS | Final rerun completed with 0 errors |
| `npm run typecheck -w @jurnapod/backoffice` | PASS | Final rerun completed with 0 errors |
| `npm run build -w @jurnapod/backoffice` | PASS | Final rerun completed after review fixes |
| `npm run test:unit -w @jurnapod/backoffice` | PASS | `logs/backoffice-epic65-unit-r3.log`; 10 files, 154 tests |
| `npm run build:report -w @jurnapod/backoffice` | PASS | Final rerun completed after review fixes |

---

## Review Findings

Independent review returned GO with no P0/P1 blockers.
Targeted review-fix verification returned GO with no P0/P1/P2 blockers.

Resolved before final validation:
- P2: Navigation permission filtering was a no-op. Resolution: route metadata with `permission` now invokes `userSatisfiesPermission(...)`; regression test added.
- P2: Sync health clock fallback returned `0`. Resolution: fallback now uses UI-only `Date.now()` with explicit non-persistence boundary comment.
- P2: Outlet switcher used a callback reference as a lazy initializer. Resolution: initializer now uses an explicit `useState(() => resolveOutlet())` function.

Tracked follow-ups:
- P2: Story 65-2 owner MUST add an OpenAPI schema freshness gate before Epic 65 close or document a blocking reason in the completion report.
- P2: Story 65-5 owner MUST document the BrowserRouter + legacy hash redirect naming boundary before React Router v6 cutover.
- P2: Architecture owner MUST document `@/lib/*` path precedence risk before the next backoffice foundation batch.

Tracked P3 item:
- P3: Story 65-4 owner MUST remove the transitional `AppRoute & { permission?: NavPermissionRequirement }` cast after `AppRoute` formally includes permission metadata.

---

## Known Baseline Notes

- Existing backoffice test script uses Node's built-in test runner through `src/tests/all.test.ts`.
- Existing unit test files already live under `apps/backoffice/__test__/unit`.
- Existing app uses hash routing; route migration MUST preserve legacy hash URLs or provide redirects.
- Existing layout already shows online/offline status and sync alert count, but last sync timestamp and pending jobs count require verification.

---

_Last Updated: 2026-05-17_
