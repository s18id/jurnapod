# Story 65-3 Completion Report

**Story:** Auth session model: silent refresh, re-auth, expiry affordances
**Epic:** 65 - Foundation — Shell, Router, Auth, Typed API Client, Data Grid Primitives
**Status:** ✅ DONE
**Completed:** 2026-05-17

---

## Summary

Implemented auth session helpers: silent refresh on 401 via `/auth/refresh`, foreground re-auth for sensitive transitions, session expiry detection, and clean sign-out with redirect. All helpers are typed and unit-tested.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/backoffice/src/lib/auth/silent-refresh.ts` | Silent refresh state and retry logic |
| `apps/backoffice/src/lib/auth/re-auth.ts` | Foreground re-auth helper for sensitive transitions |
| `apps/backoffice/src/lib/auth/session-expiry.ts` | Session ending-soon detection |
| `apps/backoffice/__test__/unit/lib-auth.test.ts` | Unit tests for auth helpers (21 tests) |

### Modified
| File | Changes |
|------|---------|
| `apps/backoffice/src/app/router.tsx` | Integrated shell state hooks (outlet switcher, pending jobs, sync health) |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Given valid session, when access token expires, client silently refreshes via `/api/auth/refresh` | ✅ Complete |
| AC2 | Given sensitive transition, user is prompted for re-authentication | ✅ Complete |
| AC3 | Given session expiring within threshold, dismissible banner appears | ✅ Complete |
| AC4 | Given sign-out, app state is cleared and user redirected to `/login` | ✅ Complete |
| AC5 | Given permanent auth failure, user redirected to login with "Session expired" | ✅ Complete |
| AC6 | Unit tests cover refresh logic, re-auth triggers, and expiry banner | ✅ Complete (21 tests) |

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Unit Tests | ✅ 21 tests pass |

---

## Testing Performed

- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib-auth.test.ts` — PASS (21 tests)

---

## Dev Notes

### Pattern Consistency
Follows existing auth patterns from Epic 41: access token in app state, refresh token in HttpOnly cookie. Token resolution uses canonical `getStoredAccessToken()` path.

### Security
- Auth token is never logged or exposed in error messages
- Re-auth helper includes explicit boundary comment: "UI MUST present re-auth prompt"

---

**Story is COMPLETE.**
