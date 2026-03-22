# Epic 13: Large Party Reservations (Multi-Table Support)

**Status:** done
**Completed:** 2026-03-21
**Stories:** 6 (13-1, 13-2, 13-2.1, 13-2.2, 13-3 + related sub-stories)

---

## Epic Overview

Epic 13 delivers comprehensive multi-table reservation support for large parties, enabling backoffice operators to create, edit, and manage reservation groups that span multiple tables with automatic table suggestions, conflict detection, and unified group management. The epic also includes significant performance improvements to the reservations list page with pagination, date filtering defaults, and shared modal components.

## Stories Summary

### Story 13.1: Large Party Reservation Groups (Multi-Table Support)
- **Status:** done
- **Summary:** Enables backoffice operators to create and manage reservations for large parties spanning multiple tables with automatic table suggestions based on guest count and availability, purple "Group" badge display in calendar view, and one-action group cancellation.
- **Key Files:**
  - `packages/db/migrations/0111_create_reservation_groups.sql`
  - `packages/db/migrations/0112_add_reservation_group_id.sql`
  - `apps/api/src/lib/reservation-groups.ts`
  - `apps/backoffice/src/components/TableMultiSelect.tsx`
  - `apps/backoffice/src/features/reservation-calendar-page.tsx`

### Story 13.2: Reservation Group Editing
- **Status:** done
- **Summary:** Adds update capability for existing reservation groups, allowing operators to modify customer details, guest count, time/duration, and table assignments atomically with conflict detection and proper tenant scoping.
- **Key Files:**
  - `apps/api/src/lib/reservation-groups.ts` (updateReservationGroup function)
  - `apps/api/app/api/reservation-groups/[id]/route.ts` (PATCH endpoint)
  - `packages/shared/src/schemas/reservation-groups.ts`
  - `apps/backoffice/src/hooks/use-reservation-groups.ts`
  - `apps/backoffice/src/features/reservation-calendar-page.tsx`

### Story 13.2.1: Reservation Group Editing - Critical Fixes
- **Status:** done
- **Summary:** Fixed 3 CRITICAL and 2 MEDIUM severity bugs including customer name pre-population from wrong field (table_name vs customer_name), missing outlet_id tenant isolation verification, silent fallback on empty group, HTTP status code alignment, and UX improvements.
- **Key Files:**
  - `apps/api/src/lib/reservation-groups.ts`
  - `apps/api/app/api/reservation-groups/[id]/route.ts`
  - `apps/backoffice/src/features/reservation-calendar-page.tsx`

### Story 13.2.2: Reservation Group Editing - Test Coverage
- **Status:** done
- **Summary:** Added comprehensive unit tests for updateReservationGroup() including happy path, error paths, tenant isolation verification, and transaction rollback tests. Added frontend tests for group edit modal pre-population and form validation.
- **Key Files:**
  - `apps/api/src/lib/reservation-groups.test.ts`
  - `apps/backoffice/src/features/reservation-calendar-page.test.ts`

### Story 13.3: Reservations List Improvements
- **Status:** done
- **Summary:** Implemented pagination system with configurable page sizes (10/25/50/100/200), fixed date filtering defaults to use local timezone instead of UTC, added auto-select first outlet, cross-page reservation sync via events, and created shared ReservationFormModal component for consistency.
- **Key Files:**
  - `apps/api/src/lib/pagination.ts`
  - `apps/api/app/api/reservations/route.ts`
  - `apps/backoffice/src/components/UniversalPaginator.tsx`
  - `apps/backoffice/src/components/ReservationFormModal.tsx`
  - `apps/backoffice/src/features/reservations-page.tsx`

---

## Technical Highlights

### Multi-Table Reservation Support

Large parties spanning multiple tables are handled through the `reservation_groups` table which stores group metadata (company_id, outlet_id, total_guest_count) with `reservations.reservation_group_id` FK linking individual reservations. The `createReservationGroupWithTables()` function uses atomic transactions with `FOR UPDATE` locks to prevent race conditions. Table suggestions are scored algorithmically (lower score = fewer tables + less excess capacity).

### Reservation Group Management

Groups are first-class entities with full CRUD lifecycle:
- **Create**: Atomic creation of group + linked reservations with capacity validation
- **Read**: Group detail endpoint returns all linked tables and reservation details
- **Update**: Partial updates via PATCH with table add/remove logic and conflict re-checking
- **Delete**: Cancellation unlinks reservations (sets CANCELLED status, cancelled_at timestamp) then deletes group

Overlap detection uses canonical Unix milliseconds: `a_start < b_end && b_start < a_end` (end == next start is non-overlap).

### Performance Improvements

Story 13-3 delivers significant performance and UX improvements:
- **Pagination**: Configurable page sizes up to 200 records per page with metadata (total, has_next, has_prev)
- **Date Defaults**: Filter defaults to current month on page load with "Clear Dates" option
- **Debounced Focus Handler**: 1-second debounce prevents rapid-fire refreshes on tab switch
- **Optimized Table Lookup**: O(n) Set.has() instead of O(n*m) .some() per row
- **Cross-Page Sync**: Broadcast invalidation events keep list and calendar pages synchronized

---

## Key Files by Category

### API
- `apps/api/src/lib/reservation-groups.ts` - CRUD functions for reservation groups
- `apps/api/src/lib/pagination.ts` - Pagination helpers (parsePagination, buildPaginationMeta, executePaginatedQuery)
- `apps/api/app/api/reservation-groups/route.ts` - POST create group
- `apps/api/app/api/reservation-groups/[id]/route.ts` - GET/DELETE/PATCH group
- `apps/api/app/api/reservation-groups/suggest-tables/route.ts` - GET table suggestions
- `apps/api/app/api/reservations/route.ts` - List reservations with pagination

### Backoffice
- `apps/backoffice/src/hooks/use-reservation-groups.ts` - Hook with all CRUD operations
- `apps/backoffice/src/hooks/use-reservation-groups.test.ts` - Unit tests for hook
- `apps/backoffice/src/components/TableMultiSelect.tsx` - Multi-select with capacity validation
- `apps/backoffice/src/components/TableSuggestions.tsx` - Scored suggestion display
- `apps/backoffice/src/components/UniversalPaginator.tsx` - Reusable pagination controls
- `apps/backoffice/src/components/ReservationFormModal.tsx` - Shared form modal
- `apps/backoffice/src/features/reservation-calendar-page.tsx` - Calendar view with group badges
- `apps/backoffice/src/features/reservation-calendar-page.test.ts` - Calendar page tests
- `apps/backoffice/src/features/reservations-page.tsx` - List page with pagination
- `apps/backoffice/src/hooks/use-reservations.ts` - Reservations hook with meta extraction
- `apps/backoffice/src/hooks/use-header-alerts.ts` - Debounced focus handler

### Shared Contracts
- `packages/shared/src/schemas/reservation-groups.ts` - All group schemas (create, update, detail)
- `packages/shared/src/schemas/reservations.ts` - ReservationRow with reservation_group_id

### Database
- `packages/db/migrations/0111_create_reservation_groups.sql` - reservation_groups table
- `packages/db/migrations/0112_add_reservation_group_id.sql` - FK column in reservations (rerunnable, MySQL/MariaDB-safe)
- `packages/db/scripts/one-time/backfill-outlet-timezones.sql` - Backfill outlet timezone from company

---

## Test Summary

- API Tests: 424 pass, 0 fail
- Backoffice Tests: 162 pass, 0 fail
- Total: 586 tests passing

---

## Dependencies

Epic 13 depends on:
- Epic 12 (Table Reservations and POS Sync) - for base reservation and table APIs

---

## Related Documentation

- Epic 12 Retrospective: `epic-12-retro-2026-03-21.md`
- Stories: `stories/epic-13/`
