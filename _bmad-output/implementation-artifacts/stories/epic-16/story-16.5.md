# Story 16.5: Migrate ADR-0001-critical call sites to `date-helpers`

Status: ready-for-dev

## Story

As a developer,
I want the sync and reservation paths affected by ADR-0001 to use `date-helpers`,
so that the new `_ts` and time-semantics work sits on a consistent foundation.

## Acceptance Criteria

1. ADR-0001-related reservation and sync code paths use `date-helpers` instead of inline `Date`/raw Temporal logic for timezone/epoch normalization.
2. API handlers in the impacted scope do not depend on server local timezone.
3. Inline timezone logic is removed or reduced in the targeted call sites without regressing behavior.

## Tasks / Subtasks

- [x] Task 1: Migrate reservation-focused time normalization to `date-helpers` (AC: 1, 2)
  - [x] Subtask 1.1: Audit `apps/api/src/lib/reservations.ts` for inline time normalization and conversion. → found toIso, toUnixMs, mapRow uses
  - [x] Subtask 1.2: Refactor canonical start/end timestamp preparation to use helper APIs where appropriate. → toUnixMs uses toEpochMs; mapRow uses fromEpochMs for ts→ISO
  - [x] Subtask 1.3: Preserve current canonical reservation boundary behavior. → DB layer toIso keeps Date parsing for MySQL DATETIME compat; not changed
- [x] Task 2: Migrate sync-related normalization to `date-helpers` (AC: 1, 2, 3)
  - [x] Subtask 2.1: Audit `apps/api/src/routes/sync/push.ts` for `new Date(...).getTime()` conversions. → found normalizeTrxAtForHash
  - [x] Subtask 2.2: Refactor targeted event/snapshot/cancellation normalization to helper APIs. → normalizeTrxAtForHash uses toEpochMs+toUtcInstant; added date-helpers import
- [x] Task 3: Add regression coverage for migrated paths (AC: 1, 2, 3)
  - [x] Subtask 3.1: Update sync push tests. → 31/31 sync push tests passing
  - [x] Subtask 3.2: Update reservation tests. → 12/12 reservation tests passing

## Dev Notes

### Developer Context

- `apps/api/src/routes/sync/push.ts` currently performs inline `new Date(...).getTime()` conversions for `opened_at_ts`, `closed_at_ts`, `updated_at_ts`, `event_at_ts`, `created_at_ts`, and `cancelled_at_ts`. [Source: `apps/api/src/routes/sync/push.ts`]
- `apps/api/src/lib/reservations.ts` already uses canonical `reservation_start_ts`/`reservation_end_ts` logic and must not regress overlap/filter behavior. [Source: `apps/api/src/lib/reservations.ts`]

### Technical Requirements

- Preserve reservation overlap rule: `a_start < b_end && b_start < a_end`.
- Preserve compatibility behavior where legacy reservation fields still exist.
- Do not silently change client-authoritative vs server-authoritative semantics in this story; set up helper usage only where consistent with current contract.

### Architecture Compliance

- Centralize time normalization through `date-helpers`.
- Keep query/index-friendly reservation timestamp usage intact. [Source: `AGENTS.md#Reservation time schema (canonical)`]

### Library / Framework Requirements

- Reuse helper APIs created in Stories 16.1–16.4.
- Avoid direct raw Temporal use in route/business code.

### File Structure Requirements

- Likely implementation files:
  - `apps/api/src/routes/sync/push.ts`
  - `apps/api/src/lib/reservations.ts`
  - `apps/api/src/lib/reservation-groups.ts` (if shared reservation logic is touched)
- Likely tests:
  - `apps/api/src/routes/sync/push.test.ts`
  - `apps/api/src/lib/reservations.test.ts`

### Testing Requirements

- Verify no sync ordering/reservation regressions after migration.
- If DB-based tests are touched, preserve required pool cleanup hooks.

### Previous Story Intelligence

- This story depends on Stories 16.1–16.4 being complete enough to expose stable helper APIs and behavior.

### Project Structure Notes

- Keep scope limited to ADR-0001-critical paths, not repo-wide Date cleanup.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 16.5: Migrate ADR-0001-critical call sites to date-helpers`
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/reservations.ts`
- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/routes/sync/push.test.ts`
- `apps/api/src/lib/reservations.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from ADR-0001-critical sync/reservation call-site migration scope.

### Completion Notes List

- Story 16.5 migrations applied:
  - reservations.ts: toUnixMs now uses toEpochMs(toUtcInstant()) with ReservationValidationError on failure
  - reservations.ts: mapRow uses fromEpochMs for ts→ISO conversion; toIso kept as Date→ISO for DB layer compat
  - sync/push.ts: normalizeTrxAtForHash uses toEpochMs(toUtcInstant()) instead of raw new Date().getTime()
  - Both files import from date-helpers.ts
- 677 API unit tests passing (677 total), 12 reservations tests, 31 sync push tests
- Note: DB layer toIso keeps Date parsing (not toUtcInstant) for MySQL DATETIME format compat ('YYYY-MM-DD HH:MM:SS'). API-layer (user input) functions use date-helpers validation.

### File List

- `apps/api/src/lib/reservations.ts`  (date-helpers import, toUnixMs uses toEpochMs, mapRow uses fromEpochMs)
- `apps/api/src/routes/sync/push.ts`  (date-helpers import, normalizeTrxAtForHash uses toEpochMs+toUtcInstant)
- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/routes/sync/push.test.ts`  (31/31 tests pass)
- `apps/api/src/lib/reservations.test.ts`  (12/12 tests pass)
