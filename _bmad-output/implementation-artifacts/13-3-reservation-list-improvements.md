# Story 13-3: Reservations List Page Improvements

**Epic:** Epic 13: Large Party Reservations (Multi-Table Support)  
**Status:** done  
**Date:** 2026-03-21

---

## User Story

As a restaurant staff, I want a performant and user-friendly reservations list page with pagination, date filtering, and consistent modal forms, so I can efficiently manage reservations across the entire month.

---

## Implementation Summary

### 1. Pagination System

**API Changes:**
- Created `apps/api/src/lib/pagination.ts` with reusable pagination helpers:
  - `parsePagination()` - supports `page`, `page_size`, `limit`, `offset` params
  - `buildPaginationMeta()` - returns `{ total, page, page_size, total_pages, has_next, has_prev }`
  - `executePaginatedQuery()` - helper for paginated DB queries
  - `DEFAULT_PAGE_SIZE = 50`, `MAX_PAGE_SIZE = 200`, `ALLOWED_PAGE_SIZES = [10, 25, 50, 100, 200]`

**API Route Changes:**
- Updated `apps/api/app/api/reservations/route.ts` to:
  - Use `listReservationsV2` which returns `{ reservations, total }`
  - Serialize BigInt fields to strings for JSON
  - Return response format: `{ data: reservations[], meta: { total, page, page_size, total_pages, has_next, has_prev } }`

**UI Changes:**
- Created `apps/backoffice/src/components/UniversalPaginator.tsx`:
  ```tsx
  <UniversalPaginator
    total={reservations.total}
    pageSize={PAGE_SIZE}
    page={page}
    onPageChange={setPage}
    loading={reservations.loading}
  />
  ```
- Updated `useReservations` hook to extract `total` from `meta`
- Added pagination controls to reservations list page

### 2. Date Filtering Defaults

**Changes in `reservations-page.tsx`:**
- Added `getThisMonthRange()` helper:
  ```typescript
  function getThisMonthRange(): { dateFrom: string; dateTo: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { dateFrom: formatDate(firstDay), dateTo: formatDate(lastDay) };
  }
  ```
- **Fixed bug**: Use local date components instead of `toISOString()` which shifts date by timezone offset
- Date filter defaults to current month on page load
- "Clear Dates" button resets to no date filter

### 3. Auto-Select First Outlet

**Changes in `reservations-page.tsx`:**
```typescript
useEffect(() => {
  if (!selectedOutletId && outlets.data.length > 0) {
    setSelectedOutletId(Number(outlets.data[0].id));
  }
}, [outlets.data, selectedOutletId]);
```

### 4. Cross-Page Reservation Sync

**Changes:**
- `use-reservations.ts` broadcasts `reservation-invalidation` event after mutations
- Both `reservations-page.tsx` and `reservation-calendar-page.tsx` listen for invalidation and refetch

### 5. Performance Fixes

**Focus Event Handler (use-header-alerts.ts):**
- Added 1-second debounce to `window.focus` event handler
- Prevents rapid-fire refreshes when tab switches

**Table Options Lookup (reservations-page.tsx):**
- Changed from O(n*m) `.some()` per row to O(n) `Set.has()` lookup
- Added memoized `getTableOptionsForReservation()` function

**DOM Nesting Fix:**
- Fixed `<h4>` inside `<h2>` in Modal titles
- Changed `title={<Title order={4}>...</Title>}` to `title="..."` string

### 6. Shared ReservationFormModal

**Created `apps/backoffice/src/components/ReservationFormModal.tsx`:**
- Props:
  - `opened`, `onClose`, `mode: "create" | "edit" | "edit-group"`
  - `reservation`, `outletId`, `accessToken`
  - `enableMultiTable?: boolean` - enables large party support
  - `showTableSuggestions?: boolean` - shows table suggestions
  - `defaultDurationMinutes?: number`
  - `onSuccess?: () => void`, `onRefetchTables?: () => void`

- Uses `useTableSuggestions` hook from `use-reservation-groups.ts`
- TableMultiSelect and TableSuggestions components for multi-table mode

**Both pages now use shared modal:**
- `reservations-page.tsx`: `enableMultiTable={true}`, `showTableSuggestions={true}`
- `reservation-calendar-page.tsx`: Can use same modal with all features enabled

---

## Files Created/Modified

| File | Change |
|------|--------|
| `apps/api/src/lib/pagination.ts` | **CREATED** - Pagination helpers |
| `apps/api/app/api/reservations/route.ts` | MODIFIED - Use listReservationsV2, serialize BigInt, return meta |
| `apps/backoffice/src/components/UniversalPaginator.tsx` | **CREATED** - Reusable pagination UI |
| `apps/backoffice/src/hooks/use-reservations.ts` | MODIFIED - Extract total from meta |
| `apps/backoffice/src/features/reservations-page.tsx` | MODIFIED - Pagination, date defaults, auto-select outlet, use shared modal |
| `apps/backoffice/src/components/ReservationFormModal.tsx` | **CREATED** - Shared reservation form modal |
| `apps/backoffice/src/hooks/use-header-alerts.ts` | MODIFIED - Debounce focus handler |

---

## Testing

- TypeScript typecheck passes for all workspaces
- Build succeeds for backoffice and API
- No new ESLint errors introduced

---

## Dev Notes

- Pagination uses `page_size` param (10, 25, 50, 100, 200) in addition to `limit`/`offset`
- API returns `{ data: [], meta: { total, page, page_size, total_pages, has_next, has_prev } }`
- Date formatting bug: `toISOString()` returns UTC date, not local date - always use manual formatting
- Auto-select outlet effect depends on `outlets.data` loading - ensure hook data is loaded before effect runs
- Shared modal currently supports `create` and `edit` modes; `edit-group` mode needs additional work for full calendar integration
