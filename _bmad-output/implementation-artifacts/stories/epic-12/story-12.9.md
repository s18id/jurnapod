# Story 12.9: Reservation Calendar Hourly Granularity

Status: done

## Story

As a backoffice user,
I want the reservation calendar to show hour-level detail per table,
so that I can schedule multiple sequential reservations on the same table with confidence.

## Acceptance Criteria

1. Calendar provides hour-level granularity and positions reservations by start/end time.
2. Sequential same-table reservations (`end == next start`) are not marked as overlapping.
3. Multiple reservations per table are shown in chronological order with visible gaps.
4. Off-hour starts (for example `10:30`) render in correct partial time slot.
5. Layout remains usable on desktop/mobile and keeps day/week navigation behavior.
6. Existing reservation actions (create/edit/cancel/check-in/reminder) remain functional.

## Tasks / Subtasks

- [x] Task 1: Hour-slot helper and overlap safety updates in hook layer
- [x] Task 2: Day-mode hourly timeline UI (week overview retained)
- [x] Task 3: Preserve existing reservation action workflows
- [x] Task 4: Add focused tests for timeline, timezone boundaries, and overlap semantics
- [x] Task 5: Run validation checks (test, typecheck, lint)

## Completion Notes

- Implemented strict day-mode boundary handling by mapping API-filtered rows directly to selected day key.
- Added timezone source visibility in UI and aligned resolver to outlet/company boundaries.
- Added company-configurable default duration setting and applied it for null reservation durations.
- Added unlisted-table rendering support and hide-empty-table behavior in day timeline.
- Added safe API-envelope parsing for reservations hook and tests for malformed payload resilience.
- Enforced strict timezone requirement for date-only reservation filtering API path (no UTC fallback when timezone missing).
- Added endpoint-level API tests for reservations date-only filtering and company-config setting read/update validation.

## Test Evidence

- `npm run test -w @jurnapod/backoffice` ✅
- `npm run typecheck -w @jurnapod/backoffice` ✅
- `npm run lint -w @jurnapod/backoffice` ✅
- `npm run test:unit -w @jurnapod/api` ✅
- `npm run typecheck -w @jurnapod/api` ✅
- `npm run lint -w @jurnapod/api` ✅

## References

- `_bmad-output/implementation-artifacts/12-9-reservation-calendar-hourly-granularity.md`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/hooks/use-reservation-calendar.ts`
- `apps/backoffice/src/hooks/use-reservations.ts`
- `apps/api/app/api/reservations/route.ts`
- `apps/api/app/api/reservations/route.test.ts`
- `apps/api/app/api/settings/company-config/route.test.ts`
