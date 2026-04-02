# API Detachment Sprint Backlog (Story-Sized, 2–4h)

Date: 2026-04-02  
Source Plan: `_bmad-output/planning-artifacts/api-detachment-plan.md`  
Lane: BMAD Architect  
Scope: Planning only (no code changes in this artifact)

---

## Backlog Conventions

- Story ID format: `ADB-{phase}.{story}`
- Priority: `P1` (do first), `P2` (next), `P3` (later in phase)
- Estimates are solo-dev implementation effort (excluding PR wait time)
- “Files” are intended create/modify targets
- Every story must preserve invariants: GL correctness, sync idempotency, tenant isolation

---

## Phase 0 — Pre-flight Boundary Setup

### ADB-0.1 (P1) — Author package dependency policy ADR
**Estimate:** 2h  
**Dependencies:** None

**Acceptance Criteria**
- ADR created with allowed/forbidden dependency directions for `apps/api` and `packages/*`.
- Explicit anti-cycle rules included:
  - `modules-accounting` must not import `modules-sales`.
  - `packages/**` must not import `apps/**`.
  - Domain packages must not import API route/middleware/auth helpers.
- Includes migration guard for sync protocol invariants (`since_version`, `data_version`, `sync_versions`).

**Files (create/modify)**
- `docs/adr/adr-0014-api-detachment-boundary-policy.md` (new)
- `_bmad-output/planning-artifacts/api-detachment-plan.md` (link/reference update, optional)

**Validation Commands**
- Manual ADR checklist review against section 5 of detachment plan.

---

### ADB-0.2 (P1) — Add import-boundary lint constraints
**Estimate:** 3h  
**Dependencies:** ADB-0.1

**Acceptance Criteria**
- Lint rule(s) enforce no `apps/**` imports from `packages/**`.
- Lint rule(s) enforce no forbidden cross-package edge (`modules-accounting` -> `modules-sales`).
- At least one negative test fixture/example proves rule catches violations.

**Files (create/modify)**
- Root ESLint config(s) (e.g., `.eslintrc.*` or workspace ESLint config files)
- `tsconfig.base.json` or workspace TS path config (if needed for boundary checks)
- `docs/tech-specs/api-detachment-boundaries.md` (new/updated rules doc)

**Validation Commands**
- `npm run lint -ws --if-present`
- `npm run typecheck -ws --if-present`

---

### ADB-0.3 (P2) — Scaffold new domain package workspaces
**Estimate:** 3h  
**Dependencies:** ADB-0.1

**Acceptance Criteria**
- New package shells created: `modules-sales`, `modules-inventory`, `modules-reservations`, `modules-reporting`.
- Each package has build/typecheck scripts and minimal public export entrypoint.
- Packages compile in workspace without runtime logic yet.

**Files (create/modify)**
- `packages/modules/sales/package.json`, `tsconfig.json`, `src/index.ts`
- `packages/modules/inventory/package.json`, `tsconfig.json`, `src/index.ts`
- `packages/modules/reservations/package.json`, `tsconfig.json`, `src/index.ts`
- `packages/modules/reporting/package.json`, `tsconfig.json`, `src/index.ts`
- Root workspace config (`package.json`, `tsconfig` refs) as needed

**Validation Commands**
- `npm run typecheck -ws --if-present`
- `npm run build -ws --if-present`

---

### ADB-0.4 (P2) — Create extraction checklist template for all phases
**Estimate:** 2h  
**Dependencies:** ADB-0.1

**Acceptance Criteria**
- Checklist template created for every migration PR:
  - package owns runtime implementation
  - API route is thin adapter
  - no `packages -> apps` imports
  - contract tests pass
- Template includes required risk checks for posting, sync idempotency, tenant scope.

**Files (create/modify)**
- `_bmad-output/planning-artifacts/api-detachment-pr-checklist.md` (new)

**Validation Commands**
- Manual checklist dry-run against one pilot module.

---

## Phase 1 — Foundation Extraction (Lowest Risk)

### ADB-1.1 (P1) — Move correlation primitives to `@jurnapod/telemetry`
**Estimate:** 3h  
**Dependencies:** ADB-0.2

**Acceptance Criteria**
- Correlation ID generation/propagation utilities are hosted in telemetry package.
- API telemetry middleware imports package utility (no duplicated logic remains).
- Behavior compatibility verified for request correlation IDs.

**Files (create/modify)**
- `packages/telemetry/src/*` (new/updated correlation utility)
- `apps/api/src/lib/correlation-id.ts` (replaced with adapter or removed)
- `apps/api/src/middleware/telemetry.ts` (updated imports)

**Validation Commands**
- `npm run typecheck -w @jurnapod/telemetry`
- `npm run build -w @jurnapod/telemetry`
- `npm run typecheck -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/middleware/telemetry.test.ts`

---

### ADB-1.2 (P1) — Extract email templates/link-builder into `@jurnapod/notifications`
**Estimate:** 4h  
**Dependencies:** ADB-0.2

**Acceptance Criteria**
- Template rendering and link-builder functions live in notifications package.
- API mailer uses package exports; API-local duplicate helpers removed/deprecated.
- Existing email payload contract remains unchanged.

**Files (create/modify)**
- `packages/notifications/src/templates/*`
- `packages/notifications/src/link-builder/*`
- `apps/api/src/lib/email-templates.ts` (adapter/removal)
- `apps/api/src/lib/email-link-builder.ts` (adapter/removal)
- `apps/api/src/lib/mailer.ts` (updated package usage)

**Validation Commands**
- `npm run typecheck -w @jurnapod/notifications`
- `npm run build -w @jurnapod/notifications`
- `npm run test:unit:single -w @jurnapod/api src/lib/mailer.test.ts`

---

### ADB-1.3 (P2) — Move feature flags/settings core to `@jurnapod/modules-platform`
**Estimate:** 4h  
**Dependencies:** ADB-0.2

**Acceptance Criteria**
- Platform settings core APIs are exposed from platform package.
- API keeps thin adapter only (validation/auth at route boundary, no business logic duplication).
- Tenant scoping checks preserved in package service interfaces.

**Files (create/modify)**
- `packages/modules/platform/src/settings/*`
- `packages/modules/platform/src/feature-flags/*`
- `apps/api/src/lib/platform-settings.ts` (adapter/removal)
- `apps/api/src/lib/feature-flags.ts` (adapter/removal)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-platform`
- `npm run build -w @jurnapod/modules-platform`
- `npm run test:unit:single -w @jurnapod/api src/routes/platform/*.test.ts`

---

### ADB-1.4 (P2) — Consolidate audit utilities into `@jurnapod/modules-platform`
**Estimate:** 3h  
**Dependencies:** ADB-1.3

**Acceptance Criteria**
- Audit write/read helpers move to platform package.
- API audit modules become route-facing adapters only.
- Audit query filters retain canonical `success` semantics (not `result`).

**Files (create/modify)**
- `packages/modules/platform/src/audit/*`
- `apps/api/src/lib/audit.ts`
- `apps/api/src/lib/audit-logs.ts`
- `apps/api/src/lib/super-admin-audit.ts`

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-platform`
- `npm run test:unit:single -w @jurnapod/api src/lib/audit*.test.ts`

---

## Phase 2 — Accounting-Centric Consolidation

### ADB-2.1 (P1) — Move posting engines into `@jurnapod/modules-accounting`
**Estimate:** 4h  
**Dependencies:** ADB-1.4

**Acceptance Criteria**
- `sales-posting`, `cogs-posting`, `depreciation-posting`, `sync-push-posting` runtime logic moved to accounting package.
- Accounting package exports stable posting interfaces for API/domain callers.
- No financial behavior drift in journal balancing and posting idempotency tests.

**Files (create/modify)**
- `packages/modules/accounting/src/posting/*`
- `apps/api/src/lib/sales-posting.ts` (adapter/removal)
- `apps/api/src/lib/cogs-posting.ts` (adapter/removal)
- `apps/api/src/lib/depreciation-posting.ts` (adapter/removal)
- `apps/api/src/lib/sync-push-posting.ts` (adapter/removal)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-accounting`
- `npm run build -w @jurnapod/modules-accounting`
- `npm run test:unit:critical -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`

---

### ADB-2.2 (P1) — Move reconciliation service to accounting package
**Estimate:** 3h  
**Dependencies:** ADB-2.1

**Acceptance Criteria**
- Reconciliation logic hosted in accounting package.
- API invokes reconciliation through package interface only.
- Reconciliation outputs still tie to GL source-of-truth semantics.

**Files (create/modify)**
- `packages/modules/accounting/src/reconciliation/*`
- `apps/api/src/lib/reconciliation-service.ts` (adapter/removal)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-accounting`
- `npm run test:unit:single -w @jurnapod/api src/lib/reconciliation-service.test.ts`

---

### ADB-2.3 (P2) — Thin API accounting adapters to composition-only
**Estimate:** 3h  
**Dependencies:** ADB-2.2

**Acceptance Criteria**
- API `accounts/account-types/journals` libs perform composition/IO boundary only.
- Service construction duplication removed from API.
- Public API behavior unchanged (status codes, envelopes, validations).

**Files (create/modify)**
- `apps/api/src/lib/accounts.ts`
- `apps/api/src/lib/account-types.ts`
- `apps/api/src/lib/journals.ts`
- related route files in `apps/api/src/routes/**` (minimal wiring updates)

**Validation Commands**
- `npm run test:unit:critical -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/routes/accounts/*.test.ts`

---

## Phase 3 — Domain Package Extraction

### ADB-3.1 (P1) — `modules-sales` bootstrap + ACL interface seam
**Estimate:** 3h  
**Dependencies:** ADB-0.3, ADB-2.3

**Acceptance Criteria**
- `modules-sales` defines service interfaces and `AccessScopeChecker` injection boundary.
- No direct `@/lib/auth` import inside `modules-sales`.
- One pilot flow (e.g., order creation orchestration skeleton) compiles via injected ACL.

**Files (create/modify)**
- `packages/modules/sales/src/interfaces/access-scope-checker.ts`
- `packages/modules/sales/src/services/*`
- `apps/api/src/lib/orders/*` (inject adapter)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-sales`
- `npm run typecheck -w @jurnapod/api`

---

### ADB-3.2 (P1) — Extract orders/invoices services to `modules-sales`
**Estimate:** 4h  
**Dependencies:** ADB-3.1

**Acceptance Criteria**
- Core order + invoice business logic moved to `modules-sales`.
- API route/libs remain HTTP adapters with Zod/auth/response only.
- Posting integration uses accounting package interfaces (no reverse dependency).

**Files (create/modify)**
- `packages/modules/sales/src/orders/*`
- `packages/modules/sales/src/invoices/*`
- `apps/api/src/lib/orders/*` (adapter/removal)
- `apps/api/src/lib/invoices/*` (adapter/removal)

**Validation Commands**
- `npm run test:unit:sales -w @jurnapod/api`
- `npm run typecheck -w @jurnapod/modules-sales`

---

### ADB-3.3 (P2) — Extract payments/credit-notes services to `modules-sales`
**Estimate:** 4h  
**Dependencies:** ADB-3.2

**Acceptance Criteria**
- Payment and credit-note workflows moved to `modules-sales`.
- Finalized record immutability semantics preserved (VOID/REFUND paths intact).
- No tenant scope regression (`company_id`, `outlet_id` checks remain).

**Files (create/modify)**
- `packages/modules/sales/src/payments/*`
- `packages/modules/sales/src/credit-notes/*`
- `apps/api/src/lib/payments/*` (adapter/removal)
- `apps/api/src/lib/credit-notes/*` (adapter/removal)

**Validation Commands**
- `npm run test:unit:sales -w @jurnapod/api`
- `npm run test:unit:critical -w @jurnapod/api`

---

### ADB-3.4 (P1) — `modules-inventory` bootstrap + shared scoping guards
**Estimate:** 3h  
**Dependencies:** ADB-0.3

**Acceptance Criteria**
- Inventory package exports company/outlet scoped service entrypoints.
- Shared validation/seams for item/group/price services are established.
- API imports package interfaces without route behavior change.

**Files (create/modify)**
- `packages/modules/inventory/src/index.ts`
- `packages/modules/inventory/src/interfaces/*`
- `apps/api/src/lib/items/*` (initial adapter wiring)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-inventory`
- `npm run typecheck -w @jurnapod/api`

---

### ADB-3.5 (P1) — Extract item catalog services (items/groups/prices/variants)
**Estimate:** 4h  
**Dependencies:** ADB-3.4

**Acceptance Criteria**
- Item, group, price, and variant business logic moved to inventory package.
- Company/outlet scoping retained and covered by tests.
- API lib files reduced to adapter-level logic.

**Files (create/modify)**
- `packages/modules/inventory/src/items/*`
- `packages/modules/inventory/src/item-groups/*`
- `packages/modules/inventory/src/item-prices/*`
- `packages/modules/inventory/src/item-variants/*`
- `apps/api/src/lib/items/*`
- `apps/api/src/lib/item-groups/*`
- `apps/api/src/lib/item-prices/*`
- `apps/api/src/lib/item-variants.ts`

**Validation Commands**
- `npm run test:unit:single -w @jurnapod/api src/routes/items/*.test.ts`
- `npm run test:unit:single -w @jurnapod/api src/routes/item-groups/*.test.ts`
- `npm run typecheck -w @jurnapod/modules-inventory`

---

### ADB-3.6 (P2) — Extract stock/recipe/supplies services
**Estimate:** 4h  
**Dependencies:** ADB-3.5

**Acceptance Criteria**
- Stock and recipe/supplies business workflows moved to inventory package.
- No cross-domain cycles introduced with accounting/sales.
- Batch operations remain correct where used.

**Files (create/modify)**
- `packages/modules/inventory/src/stock/*`
- `packages/modules/inventory/src/recipes/*`
- `packages/modules/inventory/src/supplies/*`
- `apps/api/src/lib/stock.ts`
- `apps/api/src/lib/recipe-*`
- `apps/api/src/lib/supplies/*`

**Validation Commands**
- `npm run test:unit:single -w @jurnapod/api src/routes/inventory/*.test.ts`
- `npm run typecheck -w @jurnapod/modules-inventory`

---

### ADB-3.7 (P1) — `modules-reservations` bootstrap with canonical time model
**Estimate:** 3h  
**Dependencies:** ADB-0.3

**Acceptance Criteria**
- Reservation package defines canonical timestamp contract (`reservation_start_ts`, `reservation_end_ts`).
- Overlap rule captured in package-level test/spec (`a_start < b_end && b_start < a_end`).
- Timezone resolution policy preserved (`outlet -> company`, no UTC fallback).

**Files (create/modify)**
- `packages/modules/reservations/src/index.ts`
- `packages/modules/reservations/src/time/*`
- `docs/tech-specs/reservations-detachment-notes.md` (optional)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-reservations`
- `npm run test:unit:single -w @jurnapod/api src/lib/reservations/*.test.ts`

---

### ADB-3.8 (P1) — Extract reservations/table occupancy/outlet table services
**Estimate:** 4h  
**Dependencies:** ADB-3.7

**Acceptance Criteria**
- Reservations, table occupancy, and outlet table workflows moved to package.
- Canonical reservation timestamp semantics unchanged.
- API route logic is adapter-only after extraction.

**Files (create/modify)**
- `packages/modules/reservations/src/reservations/*`
- `packages/modules/reservations/src/table-occupancy/*`
- `packages/modules/reservations/src/outlet-tables/*`
- `apps/api/src/lib/reservations/*`
- `apps/api/src/lib/table-occupancy.ts`
- `apps/api/src/lib/outlet-tables.ts`

**Validation Commands**
- `npm run test:unit:single -w @jurnapod/api src/routes/reservations/*.test.ts`
- `npm run typecheck -w @jurnapod/modules-reservations`

---

### ADB-3.9 (P2) — Extract service-session + table-sync services
**Estimate:** 3h  
**Dependencies:** ADB-3.8

**Acceptance Criteria**
- Service-session and table-sync domain logic moved to reservations package.
- Sync-facing integration points are interface-based (no transport coupling).
- Tenant scoping tests pass.

**Files (create/modify)**
- `packages/modules/reservations/src/service-sessions/*`
- `packages/modules/reservations/src/table-sync/*`
- `apps/api/src/lib/service-sessions/*`
- `apps/api/src/lib/table-sync.ts`

**Validation Commands**
- `npm run test:unit:single -w @jurnapod/api src/routes/service-sessions/*.test.ts`
- `npm run test:unit:sync -w @jurnapod/api`

---

### ADB-3.10 (P1) — `modules-reporting` bootstrap + report classification seam
**Estimate:** 3h  
**Dependencies:** ADB-0.3, ADB-2.3

**Acceptance Criteria**
- Reporting package exposes report service interfaces and classification/timeout helpers.
- Journal source-of-truth assumptions explicitly documented in package API.
- API reports adapter compiles against package exports.

**Files (create/modify)**
- `packages/modules/reporting/src/index.ts`
- `packages/modules/reporting/src/classification/*`
- `packages/modules/reporting/src/contracts/*`
- `apps/api/src/lib/report-telemetry.ts` (adapter split)

**Validation Commands**
- `npm run typecheck -w @jurnapod/modules-reporting`
- `npm run typecheck -w @jurnapod/api`

---

### ADB-3.11 (P1) — Extract report query/services to `modules-reporting`
**Estimate:** 4h  
**Dependencies:** ADB-3.10

**Acceptance Criteria**
- Report query and service logic moved to reporting package.
- API report routes remain boundary-only with same response contracts.
- Financial report tests continue to reconcile with GL logic.

**Files (create/modify)**
- `packages/modules/reporting/src/reports/*`
- `apps/api/src/lib/reports.ts` (adapter/removal)
- `apps/api/src/routes/reports/*` (wiring updates)

**Validation Commands**
- `npm run test:unit:single -w @jurnapod/api src/routes/reports/*.test.ts`
- `npm run test:unit:critical -w @jurnapod/api`

---

## Phase 4 — Sync and Route Thinning

### ADB-4.1 (P1) — Extract residual sync push business logic to packages
**Estimate:** 4h  
**Dependencies:** ADB-2.1, ADB-3.2, ADB-3.5, ADB-3.8

**Acceptance Criteria**
- `routes/sync/push.ts` retains only auth/validation/response orchestration.
- Push domain handling delegated to package services.
- `client_tx_id` idempotency behavior unchanged.

**Files (create/modify)**
- `apps/api/src/routes/sync/push.ts`
- `packages/sync-core/src/*` and/or affected domain package sync adapters
- `apps/api/src/lib/sync/*` (adapter cleanup)

**Validation Commands**
- `npm run test:unit:sync -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`

---

### ADB-4.2 (P1) — Extract residual sync pull business logic to packages
**Estimate:** 4h  
**Dependencies:** ADB-4.1

**Acceptance Criteria**
- `routes/sync/pull.ts` contains only route adapter concerns.
- Cursor contract unchanged (`since_version` in request, `data_version` in response).
- Sync version store invariant preserved (`sync_versions`, no legacy table dependencies).

**Files (create/modify)**
- `apps/api/src/routes/sync/pull.ts`
- `packages/sync-core/src/*` and/or domain sync handlers
- `apps/api/src/lib/sync/*` (adapter cleanup)

**Validation Commands**
- `npm run test:unit:sync -w @jurnapod/api`
- `npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts`

---

### ADB-4.3 (P2) — Add route-thinness enforcement checklist + CI lint gate
**Estimate:** 2h  
**Dependencies:** ADB-4.1

**Acceptance Criteria**
- CI or lint guard documents/enforces that route files avoid business workflows/DB write logic.
- Pull request template/checklist includes route-thinness check.

**Files (create/modify)**
- CI workflow/check scripts under `.github/workflows/*` or tooling scripts
- `_bmad-output/planning-artifacts/api-detachment-pr-checklist.md`

**Validation Commands**
- `npm run lint -ws --if-present`
- CI dry run (if available in repo tooling)

---

## Phase 5 — Cleanup and Hardening

### ADB-5.1 (P1) — Remove deprecated API lib implementations post-cutover
**Estimate:** 3h  
**Dependencies:** Completion of Phase 1–4 relevant extraction stories

**Acceptance Criteria**
- Deprecated duplicate implementations removed from `apps/api/src/lib`.
- Remaining API lib files are adapters or boundary glue only.
- No orphan imports/exports remain.

**Files (create/modify)**
- `apps/api/src/lib/**` (targeted deletions/cleanup)
- `apps/api/src/lib/index.ts` or route imports (if applicable)

**Validation Commands**
- `npm run typecheck -w @jurnapod/api`
- `npm run build -w @jurnapod/api`
- `npm run test:unit:critical -w @jurnapod/api`

---

### ADB-5.2 (P1) — Freeze package public APIs and document contracts
**Estimate:** 3h  
**Dependencies:** ADB-5.1

**Acceptance Criteria**
- Public exports for each migrated package are explicit and documented.
- Contract doc includes versioning guidance and anti-breaking-change policy.
- API adapters reference only public package exports.

**Files (create/modify)**
- `packages/*/src/index.ts` (export cleanup)
- `docs/tech-specs/api-detachment-public-contracts.md` (new)

**Validation Commands**
- `npm run typecheck -ws --if-present`
- `npm run build -ws --if-present`

---

### ADB-5.3 (P1) — Run full workspace validation gate + detachment audit
**Estimate:** 4h  
**Dependencies:** ADB-5.2

**Acceptance Criteria**
- Workspace typecheck/build pass.
- API critical suites pass (auth/sync/posting + touched domains).
- Import audit confirms no `packages/**` importing `apps/api/**`.
- Final detachment report generated with open risks/follow-ups.

**Files (create/modify)**
- `_bmad-output/planning-artifacts/api-detachment-validation-report.md` (new)
- `_bmad-output/planning-artifacts/api-detachment-plan.md` (status notes optional)

**Validation Commands**
- `npm run typecheck -ws --if-present`
- `npm run build -ws --if-present`
- `npm run test:unit:critical -w @jurnapod/api`
- `npm run test:unit:sync -w @jurnapod/api`
- `npm run test:unit:sales -w @jurnapod/api`

---

## Suggested Execution Order (Critical Path)

1. Phase 0: ADB-0.1 → 0.2 → 0.3 → 0.4  
2. Phase 1: ADB-1.1 → 1.2 → 1.3 → 1.4  
3. Phase 2: ADB-2.1 → 2.2 → 2.3  
4. Phase 3 (parallelizable by domain after bootstraps):
   - Sales: 3.1 → 3.2 → 3.3
   - Inventory: 3.4 → 3.5 → 3.6
   - Reservations: 3.7 → 3.8 → 3.9
   - Reporting: 3.10 → 3.11
5. Phase 4: ADB-4.1 → 4.2 → 4.3  
6. Phase 5: ADB-5.1 → 5.2 → 5.3

---

## Effort Summary

- Story count: **25**
- Estimated total: **84 hours**
- Typical throughput: **3–5 stories/week** for one solo dev (depending on test debt and review cycles)
