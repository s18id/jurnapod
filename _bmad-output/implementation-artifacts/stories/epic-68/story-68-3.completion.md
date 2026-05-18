# Story 68-3 Completion Report

**Story:** Notification System — Toast, Inbox, Banner  
**Epic:** 68 — Backoffice Async Workflows — Operations, SSE, Notifications, Audit  
**Status:** Review complete; owner sign-off pending  
**Reviewer:** Independent review + targeted re-review — GO  
**Date:** 2026-05-19

---

## Summary

Story 68-3 implemented a three-layer backoffice notification system:

1. Ephemeral toasts via Mantine Notifications.
2. Persistent inbox with unread badge, read/delete controls, scoped persistence, and deep-link support.
3. Blocking banner for critical system states.

The implementation is polling-first and does not use `/ws`. Optional SSE notification stream support remains disabled by default behind `VITE_BACKOFFICE_NOTIFICATION_SSE === "1"` and uses the canonical API base URL if enabled.

---

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|---|---|---|
| AC1: Ephemeral toast | Complete | `showToastNotification` wraps Mantine Notifications with 5s default auto-close and info/success/warning/error styling. |
| AC2: Persistent inbox | Complete | `NotificationInbox` renders shell bell icon, unread badge, notification list, read state, mark-all-read, and delete controls. |
| AC3: Inbox interaction | Complete | Notification open marks read, navigates to deep-link target, opens AsyncJobDrawer for operation links, supports mark-all-read and delete. |
| AC4: Inbox persistence | Complete | `NotificationProvider` stores sanitized notifications under `jurnapod.notifications.{companyId}.{userId}`, restores on load, removes previous key on logout/company/user switch, and caps persisted entries at 100. |
| AC5: Blocking banner | Complete | `NotificationBanner` renders backend unreachable/session/sync-style critical alerts with acknowledge action and `aria-live="assertive"`. |
| AC6: Notification sources | Complete | `useNotificationSource` polls health, operations, and audit sources; normalizes to canonical notification shape; deduplicates non-banner notifications; clears resolved backend-unreachable banner. `/ws` is unused. |
| AC7: Deep-linking | Complete | Operation links target `#/operations` and open AsyncJobDrawer when `operationId` is present; audit links target `#/audit?objectType=X&objectId=Y`; entity links use canonical hash builder. |
| AC8: Permission-aware notifications | Complete | Notifications use auth-scoped API calls and route-level access remains authoritative; inaccessible deep-links resolve through existing guarded routes. |

---

## Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/notification-inbox.test.tsx __test__/unit/features/notification-toast.test.tsx __test__/unit/features/notification-banner.test.tsx __test__/unit/hooks/use-notifications.test.ts __test__/unit/hooks/use-notification-source.test.ts` — passed; 5 files, 29 tests.
- `npm run lint -w @jurnapod/backoffice` — passed.
- `npm run typecheck -w @jurnapod/backoffice` — passed.
- `npm run build -w @jurnapod/backoffice` — passed with existing Vite chunk/dynamic-import warnings only.
- `npx tsx scripts/validate-sprint-status.ts` — passed.

---

## Review Result

Independent review result: **GO**.

Targeted re-review result after fixes: **GO**.

Final severity table:

| Severity | Findings |
|---|---|
| P0 | None |
| P1 | None |
| P2 | None |
| P3 | None |

Resolved review items:

- Added `use-notification-source.test.ts` for polling, SSE normalization, deduplication, and banner clear coordination.
- Extended inbox tests to cover handler wiring and operation deep-link/AsyncJobDrawer target behavior.
- Extended banner tests to cover acknowledge interaction.
- Used `getApiBaseUrl()` for the gated SSE URL.
- Sorted audit polling notifications newest-first before normalization.
- Reused one canonical `currentUiEpochMs` helper.
- Removed scoped localStorage entries on logout/company/user switch and explicit clear.
- Validated persisted enum fields and malformed deep-link fields.
- Added `aria-live="assertive"` to the blocking banner.

---

## Files Modified / Created

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/stories/epic-68/story-68-3.md`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/theme-provider.tsx`
- `apps/backoffice/src/main.tsx`
- `apps/backoffice/src/features/notifications/notification-types.ts`
- `apps/backoffice/src/features/notifications/notification-state.ts`
- `apps/backoffice/src/features/notifications/notification-provider.tsx`
- `apps/backoffice/src/features/notifications/notification-toast.tsx`
- `apps/backoffice/src/features/notifications/notification-inbox.tsx`
- `apps/backoffice/src/features/notifications/notification-banner.tsx`
- `apps/backoffice/src/hooks/use-notifications.ts`
- `apps/backoffice/src/hooks/use-notification-source.ts`
- `apps/backoffice/__test__/unit/features/notification-inbox.test.tsx`
- `apps/backoffice/__test__/unit/features/notification-toast.test.tsx`
- `apps/backoffice/__test__/unit/features/notification-banner.test.tsx`
- `apps/backoffice/__test__/unit/hooks/use-notifications.test.ts`
- `apps/backoffice/__test__/unit/hooks/use-notification-source.test.ts`

---

## Remaining Gates

- Owner sign-off from Ahmad is required before marking Story 68-3 `done`.
- No commit has been made for Story 68-3 yet.

---

_Last Updated: 2026-05-19_
