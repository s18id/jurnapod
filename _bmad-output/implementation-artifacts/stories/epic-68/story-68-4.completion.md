# Story 68-4 Completion Report

**Story:** Audit Timeline View + Dedicated `platform.audit` ACL Resource  
**Epic:** 68 — Backoffice Async Workflows — Operations, SSE, Notifications, Audit  
**Status:** Review complete; owner sign-off pending  
**Reviewer:** Independent review + targeted re-reviews — GO  
**Date:** 2026-05-19

---

## Summary

Story 68-4 resolved E66-A1 by introducing the dedicated `platform.audit` ACL resource and built a reusable audit timeline UI with before/after diffs, entity-scoped filtering, and deep-link support.

---

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|---|---|---|
| AC1: `platform.audit` ACL resource | Complete | Migration `0211_acl_platform_audit.sql` seeds permissions for all canonical roles with correct masks. `roles.defaults.json` updated for new-company provisioning. |
| AC2: API route ACL migration | Complete | `audit-logs.ts` and `audit.ts` both use `requireAccess({ module: 'platform', resource: 'audit', permission: 'READ' })`. `/audit-logs` route metadata updated to `platform.audit`. |
| AC3: Audit timeline rendering | Complete | `AuditTimeline` renders entries in reverse chronological order with action badges, actor ID, timestamp, and entity info. |
| AC4: Before/after diff | Complete | `AuditDiff` shows changed fields in a table with old/new values, formatted by type. `maxFields` truncation with overflow message. |
| AC5: Filter | Complete | `AuditExplorerPage` supports action type, actor user ID, from date, and to date filters. Date range uses canonical half-open interval helpers. |
| AC6: Empty state | Complete | `AuditTimeline` shows "No changes recorded for this entity" when no entries exist. |
| AC7: Deep-linking | Complete | `#/audit?objectType=X&objectId=Y` format supported. URL params sync bidirectionally with filter state. |
| AC8: Reusable component | Complete | `AuditTimeline` accepts `entries`, `loading`, and `emptyMessage` props. `useAuditEntityLog` hook accepts `objectType`, `objectId`, `companyId`, plus optional filters. |
| AC9: Integration with notifications | Complete | Story 68-3 audit deep-links target `#/audit?objectType=X&objectId=Y`, which `AuditExplorerPage` reads and renders. |
| AC10: Permission gating | Complete | `/audit` route uses `requiresExplicitPermission` with `platform.audit.READ`. Integration tests verify 403 for CASHIER and 200 for OWNER/ADMIN/ACCOUNTANT. |

---

## Validation Evidence

- `npm run lint -w @jurnapod/backoffice` — passed
- `npm run typecheck -w @jurnapod/backoffice` — passed
- `npm run build -w @jurnapod/backoffice` — passed with existing Vite warnings
- `npm run lint -w @jurnapod/api` — passed (0 errors, 157 pre-existing warnings)
- `npm run typecheck -w @jurnapod/api` — passed
- `npm run build -w @jurnapod/api` — passed
- Backoffice unit tests: 2 files, 18 tests passed
- API integration tests: 1 file, 6 tests passed
- DB migration `0211_acl_platform_audit.sql` applied successfully
- `npx tsx scripts/validate-sprint-status.ts` — passed

---

## Review Result

Independent review result: **NO-GO** → fixes applied → targeted re-reviews: **GO**

Final severity table:

| Severity | Findings |
|---|---|
| P0 | None |
| P1 | None |
| P2 | None |
| P3 | None |

Resolved review items:

- `/audit-logs` route permission metadata updated to `platform.audit.READ` (F-01)
- ACL integration tests expanded to cover ADMIN and ACCOUNTANT positive access (F-02)
- Audit Explorer UI added actor user ID, from date, and to date filters (F-03)
- `AuditTimeline` sort comparator guards against `NaN` from `Date.parse` (F-04)
- `AuditDiff` rendering tests strengthened with DOM assertions and `maxFields` overflow (F-05/F-06)
- `roles.defaults.json` updated with `platform.audit` for all canonical roles (F-07)
- `AuditExplorerPage` uses Mantine `TextInput` and `Select` consistently (F-09)
- Date-range filters use canonical `dateStringToEpochMs` and `nextDayEpochMs` for half-open intervals (N-01)

---

## Files Modified / Created

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/stories/epic-68/story-68-4.md`
- `_bmad-output/implementation-artifacts/action-items.md`
- `AGENTS.md`
- `packages/db/migrations/0211_acl_platform_audit.sql`
- `packages/shared/src/constants/roles.defaults.json`
- `apps/api/src/routes/audit-logs.ts`
- `apps/api/src/routes/audit.ts`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/features/audit/audit-timeline.tsx`
- `apps/backoffice/src/features/audit/audit-diff.tsx`
- `apps/backoffice/src/features/audit/audit-explorer.tsx`
- `apps/backoffice/src/hooks/use-audit-entity-log.ts`
- `apps/backoffice/__test__/unit/features/audit-timeline.test.tsx`
- `apps/backoffice/__test__/unit/features/audit-diff.test.tsx`
- `apps/api/__test__/integration/audit/audit-acl-permissions.test.ts`

---

## Remaining Gates

- Owner sign-off from Ahmad is required before marking Story 68-4 `done`.
- No commit has been made for Story 68-4 yet.

---

_Last Updated: 2026-05-19_
