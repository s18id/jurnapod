# Technical Specification: API Detachment Domain Packages

**Status:** Draft  
**Date:** 2026-04-02  
**Owner:** BMAD Architect  
**Scope:** New domain packages extracted from `apps/api/src`:
- `@jurnapod/modules-sales`
- `@jurnapod/modules-inventory`
- `@jurnapod/modules-reservations`
- `@jurnapod/modules-reporting`

---

## 1. Overview

### 1.1 Objective

Define the architecture, boundaries, and contracts for four new domain packages being extracted from the API so that:
- business logic moves to `packages/`
- API routes become thin HTTP adapters
- tenant isolation, accounting correctness, and sync invariants remain intact.

### 1.2 Non-Goals

- No runtime implementation in this document.
- No DB schema redesign.
- No sync protocol field changes (`since_version`, `data_version` remain canonical).
- No change to accounting authority (journal/GL remains financial source of truth).

### 1.3 Canonical Package Layout

All four packages should use this structure:

```text
packages/modules/{domain}/
  src/
    index.ts          # public exports only
    interfaces/       # injected seams (e.g., AccessScopeChecker)
    services/         # business logic
    types/            # domain types
    contracts/        # external DTO/Zod contracts
```

---

## 2. Global Architectural Rules

1. **No reverse dependency to API**
   - `packages/**` MUST NOT import from `apps/api/**`.

2. **Tenant isolation is mandatory**
   - Every mutation/read path enforces `company_id`.
   - Enforce `outlet_id` wherever domain data is outlet-scoped.

3. **Injected access seam**
   - Access checks use injected interfaces (`AccessScopeChecker`), not route-layer/auth helpers.

4. **Boundary validation**
   - External inputs/outputs exposed by package APIs use shared contracts (TypeScript + Zod where applicable).

5. **Financial invariants**
   - Finalized financial records are immutable; corrections use explicit `VOID`/`REFUND` flows.

6. **Sync invariants**
   - Do not introduce protocol aliases (no `sync_data_version`, etc.).
   - Continue using canonical cursor semantics and `sync_versions` storage policy.

---

## 3. Shared Injection Interfaces

These interfaces are shared patterns across domain packages.

### 3.1 `AccessScopeChecker` (required seam)

```ts
export interface AccessScopeChecker {
  assertCompanyAccess(input: {
    actorUserId: number;
    companyId: number;
    permission: string;
  }): Promise<void>;

  assertOutletAccess(input: {
    actorUserId: number;
    companyId: number;
    outletId: number;
    permission: string;
  }): Promise<void>;
}
```

**Rules**
- Throws typed authorization errors on deny.
- Domain services never import `@jurnapod/auth` route adapters directly.
- API composes concrete checker implementation and injects it.

### 3.2 `Clock` / temporal seam (recommended)

- Provide current time via injectable abstraction.
- Business logic uses Temporal-compatible epoch milliseconds, not native `Date` for domain decisions.

### 3.3 `TransactionRunner` seam (recommended)

- Domain workflows that must be atomic use package-internal transaction orchestration over `@jurnapod/db`.

---

## 4. Package Specifications

## 4.1 `@jurnapod/modules-sales`

### 4.1.1 Package Purpose

Own sales-domain workflows:
- orders
- invoices
- payments
- credit-notes

while preserving finalized-record immutability and integrating accounting posting through `@jurnapod/modules-accounting` only.

### 4.1.2 Public API Surface

Export (representative shape):
- `services/orders/*`
- `services/invoices/*`
- `services/payments/*`
- `services/credit-notes/*`
- `types/*` for aggregate/domain records and statuses
- `contracts/*` for request/response DTOs and validation schemas
- factory function:

```ts
export interface SalesModuleDeps {
  db: SalesDb;
  accessScopeChecker: AccessScopeChecker;
  accountingPoster: AccountingPostingPort;
}

export function createSalesServices(deps: SalesModuleDeps): SalesServices;
```

### 4.1.3 Key Interfaces

- `AccessScopeChecker` (required).
- `AccountingPostingPort` from `@jurnapod/modules-accounting` boundary.

```ts
export interface AccountingPostingPort {
  postSalesDocument(input: PostSalesDocumentInput): Promise<PostingResult>;
  postVoid(input: PostVoidInput): Promise<PostingResult>;
  postRefund(input: PostRefundInput): Promise<PostingResult>;
}
```

### 4.1.4 Canonical Data Models

- Sales document statuses must encode lifecycle transitions explicitly.
- Finalized records (`POSTED`/`COMPLETED`) are immutable.
- Corrections only through `VOID` / `REFUND` domain actions.

### 4.1.5 Tenant Scoping Rules

- All document operations scoped by `company_id`.
- Outlet-scoped documents must require and validate `outlet_id`.
- Any cross-document operation (e.g., payment against invoice) must assert same-tenant ownership before mutation.

### 4.1.6 Allowed Dependencies

- `@jurnapod/shared`
- `@jurnapod/db`
- `@jurnapod/modules-accounting`
- `@jurnapod/telemetry` (framework-agnostic only)

### 4.1.7 Must NOT Depend On

- `apps/api/**`
- `@jurnapod/modules-reporting`
- `@jurnapod/pos-sync` / `@jurnapod/backoffice-sync`
- direct route/middleware auth modules

### 4.1.8 Sync Considerations

- Sales entities remain syncable through existing sync protocol.
- Write side must preserve idempotent behavior (especially via upstream `client_tx_id` orchestration in sync/app layers).
- Module outputs should include deterministic `updated_at`/version-relevant fields to support stable delta sync.

---

## 4.2 `@jurnapod/modules-inventory`

### 4.2.1 Package Purpose

Own inventory domain behavior for:
- items
- item prices
- item groups
- variants
- stock
- recipes
- supplies

including cross-table consistency logic currently concentrated in API libs.

### 4.2.2 Public API Surface

Export (representative):
- `services/items/*`
- `services/item-prices/*`
- `services/item-groups/*`
- `services/variants/*`
- `services/stock/*`
- `services/recipes/*`
- `services/supplies/*`
- `types/*`, `contracts/*`
- factory:

```ts
export interface InventoryModuleDeps {
  db: InventoryDb;
  accessScopeChecker: AccessScopeChecker;
}

export function createInventoryServices(deps: InventoryModuleDeps): InventoryServices;
```

### 4.2.3 Key Interfaces

- `AccessScopeChecker` required for company/outlet authorization.
- Optional `StockMovementAuditPort` if platform audit integration is needed without hard coupling.

### 4.2.4 Canonical Data Models

- Item and stock models keep integer/decimal-safe inventory quantities and monetary precision rules.
- Cross-table relations (item↔variant↔price, recipe↔component, supply↔stock) must be validated atomically in workflows that change more than one table.

### 4.2.5 Tenant Scoping Rules

- Strict `company_id` enforcement across all item master tables.
- Outlet-specific tables (e.g., outlet pricing/stock where applicable) must enforce `outlet_id` and prevent cross-outlet leakage.
- Bulk operations must verify scope per row group before write.

### 4.2.6 Allowed Dependencies

- `@jurnapod/shared`
- `@jurnapod/db`
- `@jurnapod/telemetry` (optional, framework-neutral)

### 4.2.7 Must NOT Depend On

- `apps/api/**`
- `@jurnapod/modules-sales` (avoid hidden bidirectional coupling)
- `@jurnapod/modules-reporting`
- sync transport packages

### 4.2.8 Sync Considerations

- Inventory masters and operational stock changes must remain delta-sync friendly.
- Writes must be deterministic and retry-safe under unstable network-driven replay from upstream sync processes.
- Sync mapping remains in sync packages/adapters; this module stays transport-agnostic.

---

## 4.3 `@jurnapod/modules-reservations`

### 4.3.1 Package Purpose

Own reservation and seating/session workflows:
- reservations
- tables/outlet tables
- service sessions
- table occupancy

with canonical timestamp and overlap semantics preserved.

### 4.3.2 Public API Surface

Export (representative):
- `services/reservations/*`
- `services/tables/*`
- `services/service-sessions/*`
- `services/table-occupancy/*`
- `types/*`, `contracts/*`
- factory:

```ts
export interface ReservationsModuleDeps {
  db: ReservationsDb;
  accessScopeChecker: AccessScopeChecker;
  timezoneResolver: ReservationTimezoneResolver;
}

export function createReservationsServices(
  deps: ReservationsModuleDeps
): ReservationsServices;
```

### 4.3.3 Key Interfaces

- `AccessScopeChecker` required.
- `ReservationTimezoneResolver` required seam:

```ts
export interface ReservationTimezoneResolver {
  resolveTimezone(input: { companyId: number; outletId?: number }): Promise<string>;
}
```

Resolution policy is fixed:
- `outlet -> company`
- **no UTC fallback** when timezone data is missing.

### 4.3.4 Canonical Data Models

Reservation time source-of-truth fields:
- `reservation_start_ts: BIGINT` (unix ms)
- `reservation_end_ts: BIGINT` (unix ms)

Compatibility field:
- `reservation_at` allowed as derived compatibility output only; not canonical source.

Overlap invariant (must remain unchanged):

```text
a_start < b_end && b_start < a_end
```

`end == next start` is non-overlap.

### 4.3.5 Tenant Scoping Rules

- `company_id` always required.
- `outlet_id` required for outlet resources and time-window checks.
- Occupancy and session operations must reject table references outside tenant/outlet scope.

### 4.3.6 Allowed Dependencies

- `@jurnapod/shared`
- `@jurnapod/db`
- `@jurnapod/telemetry` (optional)

### 4.3.7 Must NOT Depend On

- `apps/api/**`
- `@jurnapod/modules-sales` / `@jurnapod/modules-inventory` (except explicit contract-level imports if formally approved later)
- sync transport packages

### 4.3.8 Sync Considerations

- Sync payloads must carry canonical ts fields (`reservation_start_ts`, `reservation_end_ts`).
- Domain services must not depend on sync protocol transport concerns; adapters map to/from protocol contracts.
- Time filtering behavior for sync/report reads must honor resolved timezone policy (`outlet -> company`, no UTC fallback).

---

## 4.4 `@jurnapod/modules-reporting`

### 4.4.1 Package Purpose

Own report-domain query orchestration and report service utilities while preserving:
- journal/GL as financial source of truth
- report classification and timeout behavior.

### 4.4.2 Public API Surface

Export (representative):
- `services/report-service.ts`
- `services/query/*` grouped by report family
- `services/classification/*`
- `services/timeout/*`
- `types/*`, `contracts/*`
- factory:

```ts
export interface ReportingModuleDeps {
  db: ReportingDb;
  accessScopeChecker: AccessScopeChecker;
  timeoutPolicy: ReportTimeoutPolicy;
}

export function createReportingServices(deps: ReportingModuleDeps): ReportingServices;
```

### 4.4.3 Key Interfaces

- `AccessScopeChecker` for tenant/report authorization.
- `ReportTimeoutPolicy` and `ReportClassificationPolicy` interfaces for configurable behavior without API coupling.

### 4.4.4 Canonical Data Models

- Financial reports must derive from journal/accounting views, not mutable operational shortcuts.
- Reporting DTOs distinguish:
  - operational summaries
  - accounting-truth summaries
- Any mixed report must document reconciliation source explicitly.

### 4.4.5 Tenant Scoping Rules

- Every report query scoped by `company_id`.
- Outlet-filtered reports must enforce `outlet_id` membership and avoid cross-tenant joins.

### 4.4.6 Allowed Dependencies

- `@jurnapod/shared`
- `@jurnapod/db`
- `@jurnapod/modules-accounting` (read-oriented integrations only)
- `@jurnapod/telemetry`

### 4.4.7 Must NOT Depend On

- `apps/api/**`
- `@jurnapod/modules-sales` direct write paths
- sync transport packages

### 4.4.8 Sync Considerations

- Reporting package is not sync transport owner.
- Where reports consume sync-fed data, they use persisted canonical tables and versioned data state exposed by storage, not protocol internals.
- Maintain compatibility with canonical cursors and `sync_versions` model indirectly through storage abstractions.

---

## 5. Inter-Package Dependency Policy (Detachment Guardrails)

## 5.1 Allowed Direction

```text
shared/db/telemetry -> domain modules -> apps/api adapters
```

`@jurnapod/modules-accounting` may be consumed by Sales/Reporting as defined above.

## 5.2 Forbidden Direction

- Any domain package importing API routes/middleware/lib.
- `@jurnapod/modules-accounting` importing `@jurnapod/modules-sales`.
- Domain packages importing sync transport libraries (`pos-sync`, `backoffice-sync`) to avoid cycle and transport leakage.

## 5.3 Enforcement

- Add eslint import-boundary rules + TS path constraints:
  - `packages/**` cannot import `apps/**`
  - explicit deny-list for known cycle risks.

---

## 6. Sync & Data Contract Alignment

1. Keep protocol canon:
   - pull request cursor: `since_version`
   - pull response cursor: `data_version`
2. Keep storage canon:
   - `sync_versions` only (tiered and non-tiered semantics unchanged)
3. Domain packages expose deterministic state transitions and canonical timestamps, enabling sync adapters to remain thin and idempotent.

---

## 7. Rollout Sequence (Package-Level)

1. Create package skeletons + base interfaces (`AccessScopeChecker`, deps factories).
2. Extract `modules-sales` first (highest coupling with accounting; validates posting port).
3. Extract `modules-inventory` (cross-table complexity).
4. Extract `modules-reservations` (timestamp/timezone invariants).
5. Extract `modules-reporting` (journal-truth report paths + timeout/classification helpers).
6. Convert API routes to thin adapters and delete duplicate API-lib implementations per slice.

---

## 8. Definition of Done for Each Package Extraction Slice

- Package owns runtime logic for its domain scope.
- API route layer only does auth/validation/response shaping.
- Access enforced through injected `AccessScopeChecker` seam.
- Tenant scoping assertions covered in tests (`company_id`, `outlet_id`).
- No forbidden imports/cycles.
- Sync and accounting invariants validated for touched flows.

---

## 9. Open Decisions

1. Whether to centralize common domain seam interfaces in a tiny shared internal package (or duplicate per package initially).
2. Whether reservations timezone resolver should live in `modules-platform` as reusable settings facade.
3. Exact report classification taxonomy ownership (`modules-reporting` vs `telemetry`).
