# Story 31.3: Consolidate Reservations Duplicate Logic

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.3 |
| Title | Consolidate Reservations Duplicate Logic |
| Status | pending |
| Type | Consolidation |
| Sprint | 1 of 2 |
| Priority | P1 |
| Estimate | 8h |

---

## Story

As a Reservations Engineer,
I want the table-occupancy, reservation-groups, and outlet-tables logic to live in one place in `@jurnapod/modules-reservations`,
So that there is a single source of truth and no duplicate implementations drift apart.

---

## Background

`@jurnapod/modules-reservations` has `table-occupancy/service.ts` (698 lines). However, `apps/api/src/lib/` has its own copies:
- `table-occupancy.ts` (841 lines)
- `reservation-groups.ts` (836 lines)
- `outlet-tables.ts` (707 lines)

These are duplicates. The API versions must be consolidated into the package, and the API must use the package.

**Duplicate Locations:**
| File | LOC | Status |
|------|-----|--------|
| `packages/modules/reservations/src/table-occupancy/service.ts` | 698 | Package — canonical going forward |
| `apps/api/src/lib/table-occupancy.ts` | 841 | Duplicate — delete after consolidation |
| `apps/api/src/lib/reservation-groups.ts` | 836 | Duplicate — move to package |
| `apps/api/src/lib/outlet-tables.ts` | 707 | Duplicate — move to package |

---

## Acceptance Criteria

1. `table-occupancy.ts`, `reservation-groups.ts`, `outlet-tables.ts` consolidated into `@jurnapod/modules-reservations`
2. API uses `@jurnapod/modules-reservations` — no local duplicates
3. `@jurnapod/modules-reservations` exports all three domain services
4. No `packages/modules/reservations` importing from `apps/api/**`
5. All tenant-scoped operations enforce `company_id` and `outlet_id`
6. `npm run typecheck -w @jurnapod/modules-reservations` passes
7. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Target Structure

```
packages/modules/reservations/src/
  table-occupancy/
    service.ts       # Existing (698 LOC) — canonical
    types/
  reservation-groups/
    service.ts       # Move from API lib
    types/
  outlet-tables/
    service.ts       # Move from API lib
    types/
```

### Key Domain Logic

- **Table Occupancy**: Hold, seat, release operations with optimistic locking
- **Reservation Groups**: Multi-table group creation with FOR UPDATE locking, availability checking
- **Outlet Tables**: Table CRUD, status management

### Architecture Rules

- No package imports from `apps/api/**`
- Enforce `outlet_id` membership for all table operations
- NO MOCK DB for DB-backed business logic tests

---

## Tasks

- [ ] Read all three API lib files + existing package service
- [ ] Map existing package service to API implementations
- [ ] Move `reservation-groups.ts` → `packages/modules/reservations/src/reservation-groups/`
- [ ] Move `outlet-tables.ts` → `packages/modules/reservations/src/outlet-tables/`
- [ ] Merge/align with existing `table-occupancy/service.ts`
- [ ] Update API routes to delegate to package services
- [ ] Delete duplicate files from `apps/api/src/lib/`
- [ ] Run typecheck + build
- [ ] Add integration tests

---

## Validation

```bash
npm run typecheck -w @jurnapod/modules-reservations
npm run typecheck -w @jurnapod/api
npm run test -w @jurnapod/modules-reservations
npm run build -w @jurnapod/api
```
