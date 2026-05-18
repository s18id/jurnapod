# Story 68-1 Completion Report

**Story:** AsyncJobDrawer Component — Lifecycle, SSE Progress, Completion  
**Epic:** 68 — Backoffice Async Workflows — Operations, SSE, Notifications, Audit  
**Status:** Review complete; owner sign-off pending  
**Reviewer:** Architecture review — GO  
**Date:** 2026-05-19

---

## Summary

Story 68-1 implemented the authorization-safe backend prerequisite and the backoffice AsyncJobDrawer UI/client foundation against the verified Story 68-0 backend contract.

The implementation is polling-first, supports optional bearer-capable fetch-stream SSE, uses only backend-supported statuses, and avoids `/ws`, generic retry controls, and generic cancel controls.

---

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|---|---|---|
| AC0: `platform.operations` ACL resource | Complete | AC0 committed in `eab4c685`; backend operations/progress routes enforce `platform.operations.READ`; migration `0210_acl_platform_operations.sql`; integration tests cover authorized access, CASHIER denial, and tenant scoping. |
| AC1: Drawer trigger and context | Complete | `useAsyncJobDrawer` provider/hook and `AsyncJobDrawerHost` added to authenticated backoffice shell. |
| AC2: Job lifecycle display | Complete | `OperationStepper` supports `running`, `completed`, `failed`, `cancelled` only. |
| AC3: SSE-driven progress | Complete within source-contract constraints | Optional bearer-capable fetch-stream SSE path exists; default UI policy remains polling-first because staging/proxy evidence is still unavailable. `/ws` is not used. |
| AC4: Polling fallback | Complete | `useOperationProgress` polls `/operations/:operationId/progress`, stops on terminal statuses, and cleans timers/streams on close/unmount. |
| AC5: Completion state | Complete | Drawer shows completed totals, completion timestamp, and opaque details when present. |
| AC6: Failure state details | Complete | Drawer shows backend-provided failure details from opaque `details`; no unsupported result schema is assumed. |
| AC7: Full failure state | Complete | No generic retry button is rendered because backend retry endpoint does not exist. |
| AC8: Cancelled state | Complete | Drawer shows cancelled state and timestamp; no generic retry control is rendered. |
| AC9: Drawer close and reopen | Complete | Keyed progress content and operation-id-aware state selection prevent stale progress exposure; reopen fetches latest state. |
| AC10: Permission gating | Complete | Drawer uses explicit backend-provided `user.permissions` for `platform.operations.READ`; role-name fallback is denied. |

---

## Validation Evidence

### AC0 backend/API validation

- `npm run db:migrate -w @jurnapod/db` — passed.
- `npm run lint:migrations` — passed.
- `npm run build:libs` — passed.
- `npm run typecheck -w @jurnapod/api` — passed.
- `npm run lint:fixture-flow` — passed.
- `npm run lint -w @jurnapod/api` — passed with existing warning baseline; no errors.
- `npm run test:single -w @jurnapod/api -- __test__/integration/operations/status.test.ts` — passed; 9 tests.

### UI/client validation

- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/async-job-drawer.test.tsx` — passed; 9 tests.
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/use-operation-progress.test.ts` — passed; 12 tests.
- `npm run lint -w @jurnapod/backoffice` — passed.
- `npm run typecheck -w @jurnapod/backoffice` — passed.
- `npm run build -w @jurnapod/backoffice` — passed with existing Vite chunk-size/dynamic-import warnings only.
- `npx tsx scripts/validate-sprint-status.ts` — passed.

---

## Review Result

Architecture review result: **GO**.

Resolved review findings:

- **P1:** Removed role-derived permission fallback; drawer now requires explicit `platform.operations.READ` in `user.permissions`.
- **P2:** Added runtime validation for progress payload shape/status and requested `operationId` match.
- **P2:** Prevented stale progress exposure on operation switch/reopen.
- **P2:** Preserved same-operation 403/404/load error state so `ErrorState` renders correctly.

Final severity table:

| Severity | Findings |
|---|---|
| P0 | None |
| P1 | None |
| P2 | None |
| P3 | None |

---

## Files Modified / Created

- `AGENTS.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/stories/epic-68/story-68-1.md`
- `apps/api/src/routes/progress.ts`
- `apps/api/__test__/integration/operations/status.test.ts`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/components/async-job-drawer.tsx`
- `apps/backoffice/src/components/operation-stepper.tsx`
- `apps/backoffice/src/hooks/index.ts`
- `apps/backoffice/src/hooks/use-async-job-drawer.ts`
- `apps/backoffice/src/hooks/use-operation-progress.ts`
- `apps/backoffice/src/lib/auth/permissions.ts`
- `apps/backoffice/vitest.config.ts`
- `apps/backoffice/__test__/unit/components/async-job-drawer.test.tsx`
- `apps/backoffice/__test__/unit/hooks/use-operation-progress.test.ts`
- `docs/acl-permissions.md`
- `packages/db/migrations/0210_acl_platform_operations.sql`
- `packages/shared/src/constants/resources.ts`
- `packages/shared/src/constants/roles.defaults.json`

---

## Remaining Gates

- Owner sign-off from Ahmad is required before marking Story 68-1 `done`.
- SSE runtime deployment evidence remains a downstream deployment gate from Story 68-0; this story remains safe because polling is the default and `/ws` is unused.

---

_Last Updated: 2026-05-19_
