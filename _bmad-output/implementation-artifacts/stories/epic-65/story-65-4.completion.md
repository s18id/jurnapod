# Story 65-4 Completion Report

**Story:** Role-aware app shell: company context, outlet switcher, navigation, jobs badge, online/sync status
**Epic:** 65 - Foundation — Shell, Router, Auth, Typed API Client, Data Grid Primitives
**Status:** ✅ DONE
**Completed:** 2026-05-17

---

## Summary

Built the role-aware app shell with company context, outlet switcher (persisted to sessionStorage), permission-filtered navigation, pending jobs badge, sync health indicator, and online/offline status. Integrated into existing `AppLayout` via `ShellProvider` and `useShell()` hook.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/backoffice/src/app/shell/model.ts` | Shell navigation types and permission helpers |
| `apps/backoffice/src/app/shell/use-nav-filtering.ts` | Navigation filtering by roles, modules, and permissions |
| `apps/backoffice/src/app/shell/use-outlet-switcher.ts` | Outlet selection with sessionStorage persistence |
| `apps/backoffice/src/app/shell/use-pending-jobs.ts` | Pending sync jobs count hook |
| `apps/backoffice/src/app/shell/use-sync-health.ts` | Sync health and last sync timestamp hook |
| `apps/backoffice/src/app/shell/shell-context.tsx` | Shell context provider |
| `apps/backoffice/src/app/shell/index.ts` | Shell barrel exports |
| `apps/backoffice/__test__/unit/app-shell-model.test.ts` | Shell model tests (23 tests) |
| `apps/backoffice/__test__/unit/app-shell-layout.test.ts` | Shell layout tests (13 tests) |

### Modified
| File | Changes |
|------|---------|
| `apps/backoffice/src/app/layout.tsx` | Integrated `useShell()` for outlet switcher, sync health, and pending jobs display |
| `apps/backoffice/src/app/router.tsx` | Integrated shell hooks; removed duplicate shellState computation |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Given OWNER role, all navigation items visible | ✅ Complete |
| AC2 | Given CASHIER role, navigation items for unauthorized modules hidden | ✅ Complete |
| AC3 | Given multiple outlets, outlet switcher changes `outlet_id` context | ✅ Complete |
| AC4 | Given no jobs, jobs badge shows 0 or hidden | ✅ Complete |
| AC5 | Given running/failed jobs, jobs badge shows count and links to operations | ✅ Complete |
| AC6 | Outlet switcher persists selected outlet in sessionStorage | ✅ Complete |
| AC7 | Shell always shows online/offline, sync health, last sync timestamp | ✅ Complete |
| AC8 | Shell renders within 2 seconds on dev machine | ✅ Complete (no blocking async on shell render) |

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Unit Tests | ✅ 36 tests pass (23 + 13) |

---

## Testing Performed

- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-shell-model.test.ts` — PASS (23 tests)
- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-shell-layout.test.ts` — PASS (13 tests)

---

## Dev Notes

### Pattern Consistency
Uses React context for shell state distribution. Hooks follow React best practices (mount refs, cleanup intervals).

### Security
Permission filtering uses Epic 39 canonical `module.resource` format. Backend deny-by-default is preserved; client-side filtering is UX-only.

---

**Story is COMPLETE.**
