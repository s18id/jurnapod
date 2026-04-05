# Story 31-3 Technical Design: Reservations Consolidation

## Status

- **Status:** Approved for implementation
- **Story:** 31-3
- **Owner:** BMAD Architect
- **Date:** 2026-04-05
- **Decisions finalized:** 2026-04-05

## Context

Story 31-3 consolidates reservation logic by moving reservation-group and outlet-table orchestration from API libs into `@jurnapod/modules-reservations`, while preserving compatibility for existing API consumers.

Current state shows three risks that this design resolves:

1. **Status model drift**
   - Multiple status representations exist (`ReservationStatusId`, `ReservationStatusV2`, legacy string status values).
   - Several call sites still use magic literals and mixed predicates across `status` and `status_id`.

2. **Boundary and transaction fragility**
   - API-layer logic (`apps/api/src/lib/reservation-groups.ts`, `apps/api/src/lib/outlet-tables.ts`) contains business workflows that should be package-owned.
   - Some flows are split across separate transactions (or partially outside a transaction), creating inconsistency windows between main write, occupancy sync, and audit logging.

3. **Date parsing violations**
   - Reservation group code currently parses with native `Date` (`new Date(...).getTime()`), conflicting with Temporal-first policy and canonical reservation timestamp handling.

This design adopts:
- canonical package behavior on `status_id`
- temporary dual-read/dual-write compatibility
- optional audit port (no hard dependency on `@jurnapod/modules-platform`)
- full reservation-group service in package (not API orchestration)
- deprecate-first wrappers in API, then remove after one sprint.

## Finalized Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `SEATED` legacy mapping | Map to `CHECKED_IN` (v2) | Avoids ongoing dual-state complexity, aligns with v2 |
| Unknown legacy status fallback | **Hard-fail** on write | Data integrity over silent forgiveness |
| Wrapper removal milestone | **1 sprint** | Aggressive cleanup, avoid tech debt accumulation |
| Kill-switch control | **API env/config only** | Simpler, sufficient control |

## Architecture Decisions

1. **Canonical reservation status in package is `status_id`**
   - Package internals evaluate lifecycle/blocking using status IDs.
   - Legacy `status` text remains compatibility-only during migration.

2. **Introduce `status-policy.ts` in reservations package**
   - Single policy surface for mapping, semantic sets, and dual-read fallback helpers.
   - Eliminates spread of magic literals and inconsistent status checks.

3. **Add optional `ReservationAuditPort`**
   - Package emits audit events through an injected interface.
   - API adapter composes concrete `AuditService` implementation when available.
   - Package remains usable without platform module coupling.

4. **Move reservation-group workflows into package service**
   - Create/check/suggest/get/update/delete group operations implemented in package with DB-first signatures.
   - API libs become compatibility wrappers only.

5. **Deprecate API wrappers first, remove after one release**
   - Existing function names remain callable for one release cycle.
   - Wrappers forward to package services and warn on deprecation.

6. **Unify transaction boundaries for atomic business outcomes**
   - Reservation writes, occupancy effects, and audit emission are coordinated inside one transaction boundary.
   - No post-commit side effects for same workflow outcome.

## Phases

### Phase 0 — Preflight alignment
- Confirm story acceptance criteria and public API compatibility expectations.
- Confirm status mapping policy for legacy edge statuses (`SEATED`, unexpected text values).

### Phase 1 — Package foundations
- Add `reservation-groups/` service implementation in `@jurnapod/modules-reservations`.
- Add `status-policy.ts` and export from package index.
- Add audit port interface and no-op-safe invocation pattern.

### Phase 2 — API adapter + compatibility shims
- Replace API business logic with wrappers that call package functions.
- Mark wrappers deprecated and document removal target.
- Keep route-level behavior stable.

### Phase 3 — Hardening
- Add integration tests for transaction atomicity, status dual-read fallbacks, and reservation-group edge cases.
- Validate no native `Date` usage in reservation-group logic.

### Phase 4 — Removal (next release)
- Remove deprecated API wrappers.
- Remove temporary dual-write (if telemetry/error signals are clean).

## Tasks (detailed)

1. **Create status policy utility**
   - File: `packages/modules/reservations/src/reservations/status-policy.ts`
   - Implement:
     - bi-directional mapping helpers (`status_id` <-> legacy string)
     - semantic status sets (active/blocking/terminal)
     - fallback resolver for rows with missing/null status_id.

2. **Refactor reservation-group operations into package**
   - Add package files:
     - `packages/modules/reservations/src/reservation-groups/service.ts`
     - `packages/modules/reservations/src/reservation-groups/index.ts`
   - Ensure signatures follow package pattern: `fn(db, input, deps?)`.
   - Reuse package reservations availability/status utilities where possible.

3. **Introduce audit port**
   - Add `interfaces/audit-port.ts` (or equivalent under `reservation-groups/`).
   - Add optional dependency parameter in mutating operations.
   - Emit structured events for create/update/delete group and group-table membership changes.

4. **Design API wrappers as adapters only**
   - Update:
     - `apps/api/src/lib/reservation-groups.ts`
     - (if needed for boundary cleanup) `apps/api/src/lib/outlet-tables.ts`
   - Wrapper responsibilities:
     - obtain db (`getDb()`)
     - map API input to package input
     - pass audit adapter
     - return existing response shape.

5. **Transaction boundary fixes**
   - Ensure operations execute in a single transaction for each business workflow:
     - group create with table locks + conflict checks + reservation inserts (+ audit)
     - group update with table changes + conflict checks + reservation re-shaping (+ audit)
     - group delete/cancel with reservation updates + unlink/delete group (+ audit)
     - outlet table status change with occupancy sync + audit in same transaction.

6. **Date/time policy fixes**
   - Replace `new Date(iso).getTime()` parsing with Temporal-based conversion helper from package time layer.
   - Keep canonical storage/query on `reservation_start_ts`/`reservation_end_ts`.

7. **Export surface and dependency cleanup**
   - Update `packages/modules/reservations/src/index.ts` to export reservation-groups module.
   - Preserve stable import paths for API adapter consumption.

8. **Deprecation + rollout artifacts**
   - Add `@deprecated` JSDoc on API wrappers.
   - Add release-note entry with planned removal version.

## Interfaces

### 1) Status Policy Utility

```ts
// packages/modules/reservations/src/reservations/status-policy.ts
export type LegacyReservationStatusText =
  | "BOOKED"
  | "CONFIRMED"
  | "ARRIVED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export const RESERVATION_STATUS = {
  PENDING: 1,
  CONFIRMED: 2,
  CHECKED_IN: 3,
  COMPLETED: 4,
  CANCELLED: 5,
  NO_SHOW: 6,
} as const;

export const ACTIVE_STATUS_IDS: ReadonlySet<number>;
export const BLOCKING_STATUS_IDS: ReadonlySet<number>;
export const TERMINAL_STATUS_IDS: ReadonlySet<number>;

export function statusIdToLegacyStatus(statusId: number): LegacyReservationStatusText;
export function legacyStatusToStatusId(status: string | null | undefined): number | undefined;

// canonical resolver for dual-read rows
export function resolveStatusId(row: {
  status_id?: number | null;
  status?: string | null;
}): number;

export function isBlockingStatusId(statusId: number): boolean;
export function isTerminalStatusId(statusId: number): boolean;
```

**Policy rules:**
- Package logic checks semantic sets (`isBlockingStatusId`, `TERMINAL_STATUS_IDS`), never inline literals.
- Dual-write during compatibility period updates both `status_id` and legacy `status`.

### 2) Audit Port Design

```ts
// packages/modules/reservations/src/interfaces/audit-port.ts
export interface ReservationAuditPort {
  log(input: {
    action:
      | "reservation_group.create"
      | "reservation_group.update"
      | "reservation_group.delete"
      | "reservation_group.tables_changed";
    companyId: number;
    outletId: number;
    actorUserId: number;
    entityId: number;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
```

**API adapter wiring:**
- API creates adapter around `AuditService`.
- Adapter maps `ReservationAuditPort.log(...)` to `logCreate/logUpdate/logDelete` semantics.
- If adapter not provided, package performs no-op (no failure due to missing platform module).

**Package service emission:**
- Emit after successful mutation inside same transaction context.
- Failures in mutation abort workflow; audit should not commit independently.

### 3) Reservation Groups Service Structure

```ts
// packages/modules/reservations/src/reservation-groups/service.ts
export async function createReservationGroupWithTables(
  db: KyselySchema,
  input: CreateReservationGroupInput,
  deps?: { audit?: ReservationAuditPort }
): Promise<CreateReservationGroupResult>;

export async function checkMultiTableAvailability(
  db: KyselySchema,
  input: CheckMultiTableAvailabilityInput
): Promise<CheckMultiTableAvailabilityResult>;

export async function suggestTableCombinations(
  db: KyselySchema,
  input: SuggestTableCombinationsInput
): Promise<TableSuggestion[]>;

export async function getReservationGroup(
  db: KyselySchema,
  input: GetReservationGroupInput
): Promise<ReservationGroupDetail | null>;

export async function updateReservationGroup(
  db: KyselySchema,
  input: UpdateReservationGroupInput,
  deps?: { audit?: ReservationAuditPort }
): Promise<UpdateReservationGroupResult>;

export async function deleteReservationGroupSafe(
  db: KyselySchema,
  input: DeleteReservationGroupInput,
  deps?: { audit?: ReservationAuditPort }
): Promise<DeleteReservationGroupResult>;
```

**Dependencies on other package services:**
- `reservations/availability.ts` for overlap checks.
- `reservations/status-policy.ts` for blocking/non-terminal semantics.
- `time/*` helpers for Temporal-safe timestamp conversion.

### 4) API Adapter Wrappers

```ts
/**
 * @deprecated Use @jurnapod/modules-reservations reservation-groups service directly.
 * Kept for one release cycle for compatibility.
 */
export async function createReservationGroupWithTables(input: ApiInput) {
  const db = getDb();
  return reservationsPkg.createReservationGroupWithTables(db, mapInput(input), {
    audit: buildReservationAuditAdapter(db, input.actor),
  });
}
```

**Retention policy:**
- Keep wrappers for **one release** after package service becomes default.
- Remove in next release after kill-switch criteria are green.

## Compatibility Shim Design

1. **Dual-read**
   - Read `status_id` first.
   - If null/missing, fallback from legacy `status` text via `legacyStatusToStatusId`.
   - Unknown legacy values map to safe fallback (`PENDING`) and emit warning metric.

2. **Dual-write (temporary)**
   - Every reservation status mutation writes both:
     - canonical `status_id`
     - legacy `status` text derived from mapping.

3. **Semantic status checks**
   - Replace literal checks like `status NOT IN ('COMPLETED','CANCELLED','NO_SHOW')` and `status_id IN (1,2,3,4)` with policy helpers.

4. **Hard-fail on unknown legacy status (write path)**
   - Unknown legacy text values throw `ReservationValidationError` — no silent PENDING fallback.
   - Read path: unknown legacy text emits warning metric and resolves to safest interpretation.

5. **Deprecation controls**
   - API wrappers log deprecation usage (counter metric) per function.
   - Removal gate: **one sprint** after wrapper introduction.

## Kill-Switch Criteria

### What could go wrong
- Incorrect status mapping causes false availability or blocked tables.
- Transaction refactor causes deadlocks/regressions under concurrent booking.
- Audit adapter failure blocks critical reservation mutations unexpectedly.
- Wrapper-to-package mapping drift changes API response shape.

### How to roll back
- Keep API wrapper compatibility path and previous package exports for one release.
- Feature-flag adapter routing (`RESERVATIONS_GROUPS_USE_PACKAGE=true/false`) at API composition layer.
- If severe issue detected:
  1. toggle flag off to route back to legacy API implementation,
  2. keep schema untouched,
  3. capture failing payload/trace IDs,
  4. patch package and re-enable gradually.

### When to abort rollout
- P1 tenant isolation issue.
- Duplicate booking or inconsistent reservation-group writes.
- Deadlock/error rate above agreed threshold during canary.
- Any mismatch in booking conflict detection vs baseline expected behavior.
- Hard-fail on unknown legacy status triggers unexpectedly in production (indicates unmapped status in wild).

## Test Matrix

| Area | Test Type | Scenarios |
|---|---|---|
| Status policy | Unit | legacy->id mapping, id->legacy mapping, unknown fallback, semantic set membership |
| Dual-read/write | Integration (real DB) | row with only `status`, row with only `status_id`, row with both; mutation writes both fields |
| Group create | Integration (real DB) | happy path, table lock contention, overlapping reservation rejection, capacity validation |
| Group update | Integration (real DB) | add/remove tables, time shift conflict detection, prohibited status transitions |
| Group delete | Integration (real DB) | allowed cancellation set, blocked when non-terminal started statuses present |
| Transaction atomicity | Integration (real DB) | forced error after partial writes ensures full rollback (group + reservations + occupancy + audit) |
| Audit port | Unit + integration | no-op behavior when absent, adapter mapping when present, mutation does not commit without main tx |
| API wrappers | Integration | response contract unchanged; deprecation annotations/usage telemetry emitted |
| Date handling | Unit + integration | Temporal conversion correctness; no native `Date` parser in reservation-group path |
| Concurrency | Integration/load | parallel creates/updates on same table set produce at most one winner |
