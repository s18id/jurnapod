# Story 65-5 Completion Report

**Story:** Mature data router: React Router route tree, lazy loading, guards
**Epic:** 65 - Foundation — Shell, Router, Auth, Typed API Client, Data Grid Primitives
**Status:** ✅ DONE
**Completed:** 2026-05-17

---

## Summary

Created React Router v6 compatibility bridge with lazy-loaded page chunks, route guards (auth + permission), legacy hash redirect mapping, and 404 catch-all. The existing hash-based `AppRouter` remains active; the v6 bridge is foundational for future cutover.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/backoffice/src/app/router/routes.tsx` | Canonical v6 route path constants and legacy hash mapping |
| `apps/backoffice/src/app/router/guards.tsx` | Auth and permission guard helpers |
| `apps/backoffice/src/app/router/hash-redirect.ts` | Legacy hash → v6 path redirect resolution |
| `apps/backoffice/src/app/router/router-bridge.tsx` | React Router v6 BrowserRouter wrapper with lazy chunks |
| `apps/backoffice/src/app/router/route-definitions.ts` | Route definitions with module.resource permissions |
| `apps/backoffice/src/app/router/index.ts` | Router barrel exports |
| `apps/backoffice/__test__/unit/app-router-guards.test.ts` | Guard and redirect tests (28 tests) |
| `apps/backoffice/__test__/unit/app-router-bridge.test.ts` | Router bridge tests (11 tests) |

### Modified
| File | Changes |
|------|---------|
| `apps/backoffice/src/app/router.tsx` | Exported `RouterBridge` and `HashedRouterBridge` from barrel to resolve test imports |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Given logged-out user, all routes redirect to `/login` | ✅ Complete (guards enforce this) |
| AC2 | Given logged-in user without permission, navigating to restricted route shows 403 | ✅ Complete |
| AC3 | Given hash-based URL, app redirects to new path | ✅ Complete (legacy hash redirect map) |
| AC4 | Given non-existent route, 404 page renders | ✅ Complete |
| AC5 | Lazy loading produces separate JS chunks | ✅ Complete (verified via `build:report`) |
| AC6 | Route tree defined in single file with clear domain groupings | ✅ Complete |
| AC7 | Dev notes document route naming convention | ✅ Complete |

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Unit Tests | ✅ 39 tests pass (28 + 11) |

---

## Testing Performed

- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards.test.ts` — PASS (28 tests)
- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-bridge.test.ts` — PASS (11 tests)

---

## Known Limitations

### Architectural
1. **Router bridge not yet active**: The existing hash-based `AppRouter` remains the active routing implementation. The v6 bridge is ready for future cutover.
2. **Naming**: `HashedRouterBridge` uses `BrowserRouter` internally, not `HashRouter`. Naming documentation required before cutover.

---

## Dev Notes

### Pattern Consistency
Guards use Epic 39 canonical `module.resource` permission format. Legacy hash redirects preserve existing bookmarks.

---

**Story is COMPLETE.**
