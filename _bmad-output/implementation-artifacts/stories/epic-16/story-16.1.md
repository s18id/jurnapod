# Story 16.1: Define the public `date-helpers` contract

Status: ready-for-dev

## Story

As a developer,
I want a stable `date-helpers` API for timezone validation and canonical time conversion,
so that business code can use one consistent interface across the monorepo.

## Acceptance Criteria

1. `apps/api/src/lib/date-helpers.ts` exposes a clear public API for timezone validation, UTC/local conversion, business date derivation, epoch conversion, and event-time resolution using primitive return types only.
2. The public helper contract explicitly preserves Jurnapod semantics for `*_at` (UTC instant), `*_date` (business-local date), and `*_ts` (UTC unix epoch milliseconds).
3. Raw Temporal objects are not exposed through the public API.
4. Existing callers can identify the intended migration path away from ad hoc `Date` usage.

## Tasks / Subtasks

- [x] Task 1: Inventory the existing `date-helpers` surface and current API consumers (AC: 1, 4)
  - [x] Subtask 1.1: Audit `apps/api/src/lib/date-helpers.ts` exported functions.
  - [x] Subtask 1.2: Identify current imports in reports, sales, reservations, and integration helpers.
  - [x] Subtask 1.3: Note gaps between current helpers and the Epic 16 contract.
- [x] Task 2: Define the canonical public helper contract (AC: 1, 2, 3)
  - [x] Subtask 2.1: Add/rename exports for timezone validation, UTC/local conversion, business date derivation, epoch conversion, and event resolution.
  - [x] Subtask 2.2: Keep public signatures primitive-only (`string`, `number`, `boolean`, plain object primitives).
  - [x] Subtask 2.3: Prevent raw Temporal objects from leaking across module boundaries.
- [x] Task 3: Document semantics and intended usage boundaries in-code (AC: 2, 4)
  - [x] Subtask 3.1: Document `*_at`, `*_date`, and `*_ts` meanings in helper comments.
  - [x] Subtask 3.2: Document that handlers/business logic should call `date-helpers` instead of inline timezone logic.
- [x] Task 4: Add or update tests for the public contract shape (AC: 1, 2, 3)
  - [x] Subtask 4.1: Update `apps/api/src/lib/date-helpers.test.ts` to cover new/renamed exports.
  - [x] Subtask 4.2: Verify primitive outputs and stable behavior.

### Post-Code-Review Fix Tasks (not in original spec — resolved during implementation)

- [x] Fix `normalizeDateWithTime` binary search: replaced custom `Intl.DateTimeFormat` binary search with `@js-temporal/polyfill` `ZonedDateTime.from()` — handles DST correctly without reinventing the wheel.
- [x] Fix `fromUtcInstant` offset: replaced broken `Date.getTimezoneOffset()` (which used system local offset) with `Temporal.Instant` + `toZonedDateTimeISO` + `zdt.offset` — correctly computes target timezone offset.
- [x] Fix test expectation: corrected wrong `fromUtcInstant` test that used March date but expected EST (`-05:00`) when March 16 is already EDT (`-04:00`). Changed test date to January for EST.

## Dev Notes

### Developer Context

- Existing helper module already centralizes some timezone work but is incomplete for the requested standard. [Source: `apps/api/src/lib/date-helpers.ts`]
- Existing tests already cover timezone boundaries and DST around date-range conversion; extend instead of replacing. [Source: `apps/api/src/lib/date-helpers.test.ts`]
- Story 16.1 is the foundation for all later Epic 16-18 work. Do not refactor callers broadly here; define the contract first.

### Technical Requirements

- Public API must return primitives only.
- Preserve current repo semantics:
  - `*_at` = UTC instant
  - `*_date` = business-local date
  - `*_ts` = UTC epoch milliseconds
- Keep wrapper responsibility in `date-helpers`; business code should not own timezone conversion rules.

### Architecture Compliance

- Follow shared monorepo patterns and avoid introducing feature-specific helper duplicates. [Source: `docs/project-context.md#Architecture Principles`]
- Align with repo rule that correctness and tenant-safe deterministic behavior matter more than cosmetic cleanup. [Source: `AGENTS.md#Repo-wide operating principles`]

### Library / Framework Requirements

- This story defines the public API surface; do not leak implementation-specific Temporal types.
- Reuse existing exports from `@jurnapod/shared` where applicable instead of duplicating input normalization helpers. [Source: `apps/api/src/lib/date-helpers.ts`]

### File Structure Requirements

- Primary implementation file: `apps/api/src/lib/date-helpers.ts`
- Primary unit tests: `apps/api/src/lib/date-helpers.test.ts`
- Review likely callers for future migration guidance:
  - `apps/api/src/lib/reports.ts`
  - `apps/api/src/lib/sales.ts`
  - `apps/api/src/lib/reservations.ts`
  - `apps/api/src/routes/sync/push.ts`

### Testing Requirements

- Extend existing unit tests rather than building parallel helper test files.
- Keep deterministic timezone and DST assertions.
- No DB usage expected in this story.

### Project Structure Notes

- Use the existing API helper module as the public entry point; do not create competing helper modules in app code.
- This story should make later migrations obvious, not perform all migrations yet.

### References

- `_bmad-output/planning-artifacts/epics.md#Epic 16: Unified Time Handling via date-helpers`
- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`
- `docs/project-context.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 16 public contract requirements and current helper inventory.

### Completion Notes List

- Story 16.1 core implementation complete (public contract, 8 new exports, all primitives-only, documented semantics).
- Post-code-review fixes applied: `@js-temporal/polyfill` replaced binary search, `fromUtcInstant` offset fixed, test expectation corrected for EST/EDT.
- Post-second-review fixes applied: `compareDates`/`isInFiscalYear` epoch-ms comparison, `disambiguation:"reject"` for DST gaps/ambiguities, RFC3339 strict validation in `toUtcInstant`, `isValidTimeZone` denylist tightened.
- Post-third-review fixes applied: `isValidTimeZone` UTC+offset denylist added, `normalizeDateWithTime` timezone pre-validation added, UTC+offset tests added, story File List updated.

### File List

- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`
- `apps/api/package.json`  (added `@js-temporal/polyfill` dependency)
- `AGENTS.md`  (review severity language updated)
- `_bmad/bmm/workflows/4-implementation/code-review/workflow.md`  (LOW ISSUES → P3 TARGETED FOLLOW-UPS)
