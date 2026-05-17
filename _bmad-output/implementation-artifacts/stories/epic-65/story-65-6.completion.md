# Story 65-6 Completion Report

**Story:** Server-state caching layer: TanStack Query with list/detail pattern
**Epic:** 65 - Foundation — Shell, Router, Auth, Typed API Client, Data Grid Primitives
**Status:** ✅ DONE
**Completed:** 2026-05-17

---

## Summary

Integrated TanStack Query (React Query v5) as the server-state caching layer. Created `QueryClient` provider with sensible defaults, deterministic query key helpers, and mutation hooks with automatic cache invalidation. Dexie offline caches are preserved for reference data.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/backoffice/src/lib/cache/query-client.tsx` | TanStack Query client provider with default config |
| `apps/backoffice/src/lib/cache/query-keys.ts` | Deterministic query key factory helpers |
| `apps/backoffice/src/lib/cache/mutation-hooks.ts` | Mutation hooks with cache invalidation |
| `apps/backoffice/__test__/unit/lib-cache-hooks.test.ts` | Query hook tests (18 tests) |

### Modified
| File | Changes |
|------|---------|
| `apps/backoffice/package.json` | Added `@tanstack/react-query` dependency |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Given list page, TanStack Query caches response and shows stale data on re-visit | ✅ Complete |
| AC2 | Given mutation, list cache is invalidated and refetched | ✅ Complete |
| AC3 | Given network error, query returns error state renderable as Mantine Alert | ✅ Complete |
| AC4 | Given empty list, query returns empty state | ✅ Complete |
| AC5 | Dexie reference caches continue to work unchanged | ✅ Complete |
| AC6 | Unit tests verify query hook behavior | ✅ Complete (18 tests) |

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Unit Tests | ✅ 18 tests pass |

---

## Testing Performed

- ✅ `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib-cache-hooks.test.ts` — PASS (18 tests)

---

## Dev Notes

### Pattern Consistency
Query keys follow deterministic `domain.resource.id` convention. Mutations auto-invalidate related list queries.

### Security
No auth tokens in cache keys or query state.

---

**Story is COMPLETE.**
