# API Detachment Plan: `apps/api/src` → `packages/`

Date: 2026-04-02  
Owner Lane: BMAD Architect  
Scope: Planning only (no runtime/code changes)

---

## 1) Objective and Constraints

### Objective
Detach reusable business/domain logic from `apps/api/src` into workspace packages under `packages/`, while keeping API routes as HTTP adapters.

### Hard constraints from project context
- Accounting/GL remains financial source of truth.
- POS remains offline-first and retry-safe/idempotent.
- Tenant isolation (`company_id`, `outlet_id`) is mandatory at all boundaries.
- Avoid circular dependencies between packages.
- Prefer existing packages first; create new packages only when domain fit is poor or cycle risk is high.

---

## 2) Current State Summary (Observed)

## Existing package landscape (relevant)
- `@jurnapod/shared` (schemas/contracts/constants)
- `@jurnapod/db` (Kysely/db infra)
- `@jurnapod/auth` (token/password/rbac/throttle/email-token core)
- `@jurnapod/modules-accounting` (posting/accounts/account-types/journals)
- `@jurnapod/modules-platform` (audit + sync audit)
- `@jurnapod/sync-core`, `@jurnapod/pos-sync`, `@jurnapod/backoffice-sync`
- `@jurnapod/telemetry` (SLO/correlation/metrics metadata)
- `@jurnapod/notifications` (email provider/template engine package exists but not integrated in API)

## API code characteristics
- `apps/api/src/lib` still contains large domain logic clusters (inventory, sales, reservations, settings, reports, import/export, etc.).
- Several adapter layers already exist (e.g., accounts/account-types/journals wrapping `@jurnapod/modules-accounting`).
- Sync is partially modularized, but route-level sync files still contain non-trivial business logic (not thin enough).
- Duplication exists between API telemetry/correlation utilities and `@jurnapod/telemetry` package capabilities.

---

## 3) Target Architecture (Package Boundaries)

## Guiding layering (target)
```
@jurnapod/shared
        ↑
@jurnapod/db, @jurnapod/telemetry
        ↑
@jurnapod/auth, @jurnapod/modules-platform, @jurnapod/modules-accounting,
@jurnapod/sync-core, @jurnapod/notifications,
@jurnapod/modules-sales, @jurnapod/modules-inventory,
@jurnapod/modules-reservations, @jurnapod/modules-reporting
        ↑
apps/api (HTTP composition/adapters only)
```

Design rule: `packages/*` must never import from `apps/api/*`.

---

## 4) Extraction Map

## 4.1 Move to **existing packages**

| Source in `apps/api/src/lib` | Target package | Why |
|---|---|---|
| `accounts.ts`, `account-types.ts`, `journals.ts` adapter internals | `@jurnapod/modules-accounting` (enhance factory/adapters there) | Already accounting package; remove API-side service construction duplication |
| `sales-posting.ts`, `cogs-posting.ts`, `depreciation-posting.ts`, `sync-push-posting.ts` | `@jurnapod/modules-accounting` | Posting logic is accounting-centric and should sit with posting primitives |
| `reconciliation-service.ts` | `@jurnapod/modules-accounting` | Journal reconciliation belongs with GL integrity |
| `audit.ts`, `audit-logs.ts`, `super-admin-audit.ts` | `@jurnapod/modules-platform` | Platform audit responsibility already established |
| `platform-settings.ts`, `feature-flags.ts` | `@jurnapod/modules-platform` | Cross-cutting platform config/flags |
| `sync/audit-adapter.ts` | `@jurnapod/sync-core` or `@jurnapod/modules-platform/sync` | Sync audit adapter is sync infrastructure concern |
| `correlation-id.ts`, reusable telemetry primitives from `middleware/telemetry.ts` | `@jurnapod/telemetry` | Prevent duplicated correlation logic |
| `mailer.ts`, `email-templates.ts`, `email-link-builder.ts` | `@jurnapod/notifications` | Existing notifications package is the natural recipient |
| auth wrappers that duplicate package capabilities (`auth-throttle.ts` thin wrappers) | keep thin in API or move helper wrappers into `@jurnapod/auth` | reduce adapter sprawl |

## 4.2 **New packages required**

These domains are too large/independent to force-fit into existing packages without coupling/cycles.

1. `@jurnapod/modules-sales`
   - Move: `lib/orders/*`, `lib/invoices/*`, `lib/payments/*`, `lib/credit-notes/*`, `lib/sales.ts` compatibility exports.
   - Keep accounting posting integration through dependency on `@jurnapod/modules-accounting`.

2. `@jurnapod/modules-inventory`
   - Move: `lib/items/*`, `lib/item-groups/*`, `lib/item-prices/*`, `lib/item-variants.ts`, `lib/recipe-*`, `lib/supplies/*`, `lib/stock.ts`, `lib/inventory/*`.

3. `@jurnapod/modules-reservations`
   - Move: `lib/reservations/*`, `lib/reservation-groups.ts`, `lib/table-occupancy.ts`, `lib/service-sessions/*`, `lib/outlet-tables.ts`, `lib/table-sync.ts`.

4. `@jurnapod/modules-reporting`
   - Move: `lib/reports.ts`, report query support, report timeout/classification logic currently in `lib/report-telemetry.ts` (framework-neutral parts only).

5. (Optional if scope grows) `@jurnapod/modules-content`
   - Move: `lib/static-pages.ts`, `lib/static-pages-admin.ts`.
   - Can alternatively live in `@jurnapod/modules-platform` if team prefers fewer packages.

---

## 5) Circular Dependency Risk Analysis

## High-risk cycle candidates

1. **Sales ↔ Accounting cycle risk**
   - Risk: if accounting starts importing sales document logic while sales imports posting utilities.
   - Rule: accounting exposes posting interfaces/utilities; sales depends on accounting, never inverse.

2. **Inventory/Reservations ↔ Auth cycle risk**
   - Current API utils call `auth` directly (e.g., outlet access helper).
   - Rule: domain packages must use injected ACL interface (callback/service), not import API/auth route-layer modules.

3. **Sync ↔ Domain cycles**
   - Risk: `pos-sync` importing route-layer or API-only helpers.
   - Rule: `pos-sync` may depend on domain modules, but domain modules must not depend on `pos-sync`/`sync-core` transport concerns.

4. **Platform settings ↔ Notifications cycle**
   - Risk: notifications reading platform settings directly from platform module while platform needs notifications.
   - Rule: notifications receives resolved config via injection; platform/settings remain source of values.

5. **Telemetry middleware ↔ app framework cycle**
   - Rule: keep framework-agnostic telemetry in package; Hono middleware adapter remains in API app.

## Dependency guardrails
- Enforce import boundaries (eslint rule + TS path constraints):
  - `packages/**` cannot import `apps/**`
  - `@jurnapod/modules-accounting` cannot import `@jurnapod/modules-sales`
  - domain packages cannot import API route/middleware files

---

## 6) Migration Order (Actionable Sequence)

## Phase 0 — Pre-flight boundary setup
1. Define target package dependency policy document/ADR.
2. Add import-boundary lint rules.
3. Add package templates for new modules (`modules-sales`, `modules-inventory`, `modules-reservations`, `modules-reporting`).

## Phase 1 — Foundation extraction (lowest risk)
1. Move reusable telemetry/correlation primitives to `@jurnapod/telemetry`.
2. Move email provider/template/link logic into `@jurnapod/notifications`.
3. Move platform feature flag + settings core to `@jurnapod/modules-platform`.

## Phase 2 — Accounting-centric consolidation
1. Migrate posting/reconciliation logic (`sales-posting`, `cogs-posting`, `depreciation-posting`, `reconciliation-service`) into `@jurnapod/modules-accounting`.
2. Simplify API accounting libs into thin adapters/composers.

## Phase 3 — Domain package extraction
1. Extract `modules-sales` (orders/invoices/payments/credit-notes).
2. Extract `modules-inventory` (items/prices/groups/variants/stock/recipes/supplies).
3. Extract `modules-reservations` (reservations/tables/service-sessions).
4. Extract `modules-reporting` (report queries + report service).

## Phase 4 — Sync and route thinning
1. Remove residual sync business logic from API routes (`routes/sync/push.ts`, `routes/sync/pull.ts`) into package services.
2. API routes become strict HTTP adapters (auth, validation, response shaping only).

## Phase 5 — Cleanup and hardening
1. Delete deprecated API lib implementations after adapter cutover.
2. Freeze package public APIs (exports) and document contracts.
3. Validate workspace-wide typecheck/build/tests.

---

## 7) Detailed Worklist by Domain

## A. Sales domain (`modules-sales`)
- Inputs:
  - `lib/orders/*`, `lib/invoices/*`, `lib/payments/*`, `lib/credit-notes/*`, `lib/sales.ts`
- First split required:
  - Replace direct `@/lib/auth` access checks with injected `AccessScopeChecker` interface.
  - Replace internal `@/lib/numbering`/date helper dependencies with package-local or shared utility dependencies.

## B. Inventory domain (`modules-inventory`)
- Inputs:
  - `lib/items/*`, `lib/item-prices/*`, `lib/item-groups/*`, `lib/item-variants.ts`, `lib/inventory/*`, `lib/recipe-*`, `lib/supplies/*`, `lib/stock.ts`
- Risk:
  - heavy cross-table behavior; ensure company/outlet scoping remains enforced in moved services.

## C. Reservations domain (`modules-reservations`)
- Inputs:
  - `lib/reservations/*`, `lib/reservation-groups.ts`, `lib/table-occupancy.ts`, `lib/outlet-tables.ts`, `lib/service-sessions/*`, `lib/table-sync.ts`
- Preserve canonical reservation timestamp semantics and overlap rule invariants.

## D. Reporting domain (`modules-reporting`)
- Inputs:
  - `lib/reports.ts`, relevant report telemetry classification helpers.
- Preserve journal-as-source-of-truth policy.

## E. Platform/Settings/Audit
- Move to `modules-platform`:
  - `platform-settings.ts`, `feature-flags.ts`, audit utilities.
- Optional content management (static pages) under platform or dedicated `modules-content`.

## F. Notifications
- Consolidate email sending + templates:
  - `mailer.ts`, `email-templates.ts`, `email-link-builder.ts` into `@jurnapod/notifications`.
- Keep outbox orchestration (`email-outbox.ts`) in API initially (depends on app scheduling/runtime).

---

## 8) Dependency Graph (Target)

```mermaid
graph TD
  SH[@jurnapod/shared]
  DB[@jurnapod/db]
  TEL[@jurnapod/telemetry]

  AUTH[@jurnapod/auth]
  PLAT[@jurnapod/modules-platform]
  ACC[@jurnapod/modules-accounting]
  SYNC[@jurnapod/sync-core]
  POSSYNC[@jurnapod/pos-sync]
  BOSYNC[@jurnapod/backoffice-sync]
  NOTIF[@jurnapod/notifications]

  SALES[@jurnapod/modules-sales]
  INV[@jurnapod/modules-inventory]
  RSV[@jurnapod/modules-reservations]
  RPT[@jurnapod/modules-reporting]

  API[apps/api]

  SH --> DB
  SH --> AUTH
  SH --> PLAT
  SH --> ACC
  SH --> SYNC
  SH --> SALES
  SH --> INV
  SH --> RSV
  SH --> RPT

  DB --> AUTH
  DB --> PLAT
  DB --> ACC
  DB --> SYNC
  DB --> SALES
  DB --> INV
  DB --> RSV
  DB --> RPT

  TEL --> API
  NOTIF --> API
  ACC --> SALES
  ACC --> RPT
  SYNC --> POSSYNC
  SYNC --> BOSYNC
  SALES --> API
  INV --> API
  RSV --> API
  RPT --> API
  AUTH --> API
  PLAT --> API
  POSSYNC --> API
  BOSYNC --> API
```

---

## 9) Risk Register

| Risk | Severity | Trigger | Mitigation |
|---|---|---|---|
| Financial regression during posting extraction | P1 | moving posting/cogs/depreciation logic | move accounting first, keep integration tests around journal balancing and posting idempotency |
| Sync idempotency drift | P1 | push/pull refactor while detaching domains | keep `client_tx_id` behavior contract tests as migration gate |
| Hidden cycles through utility imports | P1 | domain packages importing API helpers | enforce package boundary linting before extraction |
| Tenant scoping regressions | P1 | query refactors into new packages | mandatory test assertions for `company_id` and `outlet_id` constraints |
| Package sprawl / ownership ambiguity | P2 | too many small packages | start with four domain packages; avoid micro-packages until stable |
| Incomplete thin-route migration | P2 | route files retain business logic | PR checklist: route files may not contain DB writes/business workflows |

---

## 10) Validation Gates per Phase

- Typecheck/build target package(s) + API app.
- Run critical API suites (auth, sync, posting, reports, inventory).
- Ensure sync protocol invariants (`since_version`, `data_version`, `sync_versions`) remain unchanged.
- Ensure no new import from `apps/api/src` inside `packages/**`.

Suggested minimum command gate after each phase:
- `npm run typecheck -ws --if-present`
- `npm run build -ws --if-present`
- `npm run test:unit:critical -w @jurnapod/api`
- plus domain-specific suites touched by the phase.

---

## 11) Definition of “Detached” for This Plan

A module is considered detached only when:
1. Runtime implementation lives under `packages/`.
2. API route uses package service via thin adapter.
3. No package imports from `apps/api/src/*`.
4. Contract and behavior tests pass (especially accounting/sync/tenant scoping).

---

## 12) Recommended Execution Strategy

1. Execute in vertical slices per domain but in the phase order above.
2. Keep each migration PR narrowly scoped (foundation first, then accounting, then each domain).
3. After each slice, remove dead API lib code immediately to avoid dual-implementation drift.
