---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments: ["docs/prd/prd-jurnapod-overview.md", "docs/architecture.md", "_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md"]
---

# jurnapod - Epic Breakdown

## Overview

This document provides the epic and story breakdown for jurnapod, focused on tooling standards and process improvements carried forward from Epics 33 and 34.

## Program Baseline Reference (S48–S61)

Architecture and sprint execution for S48–S61 are governed by:

- `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`

Mandatory interpretation:

- Priority order: `Correctness > Safety > Speed`
- SOLID/DRY/KISS checklist applied at kickoff, midpoint, and pre-close each sprint
- No sprint closure with unresolved P0/P1 in sprint scope
- No net-new feature scope unless explicitly approved exception

## Requirements Inventory

### Functional Requirements

FR1: The system must support dead code audit as a documented step in consolidation/extraction stories to prevent accumulating unused code
FR2: The system must document canonical permission bit values (READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32) in shared/package README
FR3: The system must provide a pre-reorganization tool standardization checklist for use before code reorganization work begins
FR4: The system must provide an automated import path update script to remap `../../../../lib/` relative paths to `@/` aliases during refactoring
FR5: The system must document database fixture standards covering setup, teardown, and naming conventions
FR6: The system must provide vitest alias configuration templates (e.g., `@/` path alias) for all packages in the monorepo
FR7: The system must document database cleanup hook patterns for integration tests (beforeAll/afterAll lifecycle)
FR8: The system must provide a lint rule unit test template for creating and validating custom ESLint rules

### NonFunctional Requirements

NFR1: All tooling scripts must be idempotent and safe to re-run
NFR2: Documentation must be immediately usable by developers without requiring additional context
NFR3: Templates must follow existing project conventions (AGENTS.md, existing patterns)

### Additional Requirements

- Epic 45 must not modify any production code — only process documentation, scripts, and templates
- All outputs should be suitable for developer onboarding (discoverable in docs/)
- E41-A7 (accessToken arg sunset) should be tracked separately as a P3 follow-up item

### UX Design Requirements

(none — this epic covers internal developer tooling only)

### FR Coverage Map

| FR | Requirement | Story |
|----|-------------|-------|
| FR1 | Dead code audit step in consolidation stories | 45.1 |
| FR2 | Permission bit canonical values in shared/README | 45.2 |
| FR3 | Pre-reorganization tool standardization checklist | 45.3 |
| FR4 | Automated import path update script | 45.4 |
| FR5 | Database fixture standards documentation | 45.5 |
| FR6 | Vitest alias config template for all packages | 45.6 |
| FR7 | DB cleanup hook patterns documentation | 45.7 |
| FR8 | Lint rule unit test template | 45.8 |

## Epic List

| Epic | Title | Status | Sprint |
|------|-------|--------|--------|
| Epic 45 | Tooling Standards & Process Documentation | done | — |
| Epic 46 | Purchasing / Accounts Payable | done | — |
| Epic 47 | AP Reconciliation & Period Close Controls | done | — |
| Epic 48–51 | Correctness-First Architecture (Baseline, Determinism, Ledger, Fiscal) | done | 48–51 |
| Epic 52 | Datetime Standardization + Idempotency Hardening | done | 52 |
| Epic 53 | Datetime API Consolidation Execution | done | 53 |
| **Epic 54** | **AP Lifecycle Correctness** | **done** | **54** |
| **Epic 55** | **AP Reconciliation/Snapshot Correctness** | **done** | **55** |
| **Epic 56** | **Correctness Infrastructure** | **done** | **56** |
| **Epic 57** | **AR + Treasury Correctness** | **planned** | **57** |
| Epic 58 | Inventory/Costing Correctness | backlog | 58 |
| **Epic 59** | **POS Core Correctness Consolidation** | **done** | **59** |
| **Epic 60** | **Tenant + ACL Correctness Hardening** | **done** | **60** |
| **Epic 61** | **Sales & Purchasing Lifecycle Correctness** | **planned** | **61** |
| Epic 62 | Projection Correctness Hardening | backlog | 62 |

---

## Epic 45: Tooling Standards & Process Documentation

**Goal:** Complete the 6 open P2 action items from Epics 33 and 34, providing documented tooling standards, automation scripts, and process documentation that prevent debt accumulation in future consolidation work.

### Story 45.1: Dead Code Audit Step in Consolidation Stories

As a developer,
I want a documented dead code audit step in extraction/consolidation stories,
So that unused code is identified and removed during refactoring and does not accumulate as technical debt.

**Acceptance Criteria:**

**Given** an extraction or consolidation story is being executed,
**When** the adapter/implementation code is deleted after route flipping,
**Then** a dead code audit must be performed checking for:
- Any exported functions from the deleted module that are no longer referenced by any consumer
- Any type definitions that became orphaned after the deletion
- Any test files that only tested the deleted code (and should be removed)
**And** findings must be documented in the story completion report

**Given** dead code is found,
**When** the audit is complete,
**Then** the developer must either delete the orphaned code or create a tracked action item with owner and priority

---

### Story 45.2: Document Permission Bit Canonical Values in shared/README

As a developer,
I want the canonical permission bit values documented in `@jurnapod/shared/README.md`,
So that I can correctly interpret and implement ACL permissions without consulting multiple sources.

**Acceptance Criteria:**

**Given** a developer is implementing ACL permissions,
**When** they read `@jurnapod/shared/README.md`,
**Then** they must find a section titled "Canonical Permission Bits" that documents:
- READ = 1
- CREATE = 2
- UPDATE = 4
- DELETE = 8
- ANALYZE = 16
- MANAGE = 32
**And** includes the permission mask calculations (CRUD=15, CRUDA=31, CRUDAM=63)
**And** links to the ACL canonical model section in `AGENTS.md`

---

### Story 45.3: Pre-Reorganization Tool Standardization Checklist

As a release train engineer,
I want a pre-reorganization tool standardization checklist available before any code reorganization work,
So that teams follow consistent tooling standards and minimize ad-hoc tool creation.

**Acceptance Criteria:**

**Given** a developer is planning code reorganization,
**When** they consult the process documentation,
**Then** they must find a "Pre-Reorganization Tool Checklist" in `docs/process/tool-standardization-checklist.md` covering:
- ESLint rules to validate (no hardcoded IDs, no relative import paths)
- Vitest configuration requirements (alias paths, test directory structure)
- Import path conventions (`@/` alias enforcement)
- Test fixture usage requirements (library functions over raw SQL)
**And** the checklist is actionable without additional context

---

### Story 45.4: Automated Import Path Update Script

As a developer,
I want an automated script that remaps `../../../../lib/` relative paths to `@/` aliases during refactoring,
So that large-scale import path migrations are fast, consistent, and error-free.

**Acceptance Criteria:**

**Given** a developer is performing a large-scale refactor that moves code between directories,
**When** they run the import path update script,
**Then** the script must:
- Accept source and target directory paths as arguments
- Scan all `.ts` and `.tsx` files in the target directory
- Replace relative import paths that resolve to the source directory with `@/` aliases
- Preserve imports from external packages (`@jurnapod/*`, `node_modules`)
- Output a diff showing all changes before applying
- Be idempotent (safe to re-run with no changes on already-converted files)
**And** include usage instructions in `docs/process/tool-standardization-checklist.md`

---

### Story 45.5: Database Fixture Standards Documentation

As a developer,
I want database fixture standards documented,
So that I can create consistent, reliable test fixtures across all packages without bypassing domain invariants.

**Acceptance Criteria:**

**Given** a developer is writing integration tests,
**When** they consult the fixture standards,
**Then** they must find in `docs/testing/fixture-standards.md`:
- The canonical test fixture registry pattern (`createTestCompanyMinimal`, `createTestOutletMinimal`, etc.)
- Rules: when to use library functions vs raw SQL, when ad-hoc SQL is allowed (teardown, read-only verification only)
- Naming conventions for fixture functions (createTest* prefix)
- Lifecycle rules: `resetFixtureRegistry()` in `afterAll`, pool cleanup hooks required
- The `beforeAll` + cached `getSeedSyncContext()` pattern (zero-overhead wrapper)
**And** include examples from the canonical `apps/api/src/lib/test-fixtures.ts`

---

### Story 45.6: Vitest Alias Config Template for All Packages

As a developer,
I want a vitest alias configuration template that adds `@/` path alias support to all packages,
So that tests in any package can use the same import conventions as production code.

**Acceptance Criteria:**

**Given** a new package is being created or an existing package lacks `@/` path alias,
**When** the developer references the vitest config template,
**Then** they must be able to copy the alias configuration from `docs/templates/vitest-config-package.md` and apply it to their `vitest.config.ts`
**And** the template must show the exact `resolve.alias` entries for:
- `@/` → `<packageRoot>/src`
- `@jurnapod/*` → `<repoRoot>/packages/*/src`
**And** the template must include the standard test timeout configuration (testTimeout: 30000, hookTimeout: 30000, teardownTimeout: 10000)

---

### Story 45.7: DB Cleanup Hook Patterns Documentation

As a QA engineer,
I want database cleanup hook patterns documented,
So that integration tests reliably clean up database state and do not leave hanging connections or polluted data.

**Acceptance Criteria:**

**Given** a developer is writing integration tests with a real database,
**When** they consult the cleanup patterns documentation,
**Then** they must find in `docs/testing/cleanup-patterns.md`:
- The required `afterAll` cleanup calling `resetFixtureRegistry()` and pool cleanup
- The pattern for `beforeAll` with cached seed context
- How to handle cleanup when tests fail mid-execution (try/finally pattern)
- Tenant isolation cleanup (company_id/outlet_id scoping in DELETE statements)
- ACL cleanup rules: always scope by `company_id AND role_id` (never delete by role_id alone)
**And** include anti-pattern examples showing what happens without proper cleanup

---

### Story 45.8: Lint Rule Unit Test Template

As a developer,
I want a template for creating unit tests for custom ESLint rules,
So that custom lint rules are validated before introduction and do not regress.

**Acceptance Criteria:**

**Given** a developer is creating a new custom ESLint rule,
**When** they reference the lint rule unit test template,
**Then** they must find in `docs/process/tool-standardization-checklist.md` (or a linked template):
- A vitest-compatible test structure using `@typescript-eslint/rule-tester`
- Examples of valid and invalid code cases for a simple rule (no-floating-decimal, or similar)
- How to test both the rule implementation and the rule's meta schema
- The expected test file location (`__test__/unit/rules/` or similar)
**And** the template must be copy-paste ready with no additional context required

---

## Epic 45: Definition of Done

- [ ] All 8 stories implemented and documented
- [ ] All outputs discoverable in `docs/` (not buried in implementation)
- [ ] No production code modified
- [ ] Sprint retrospective captures any new action items
- [ ] `sprint-status.yaml` updated for Epic 45

---

## Epic 47: AP Reconciliation & Period Close Controls

**Goal:** Establish robust reconciliation between Accounts Payable subledger and General Ledger control accounts, with period‑close guardrails, supplier‑statement matching, and a complete audit trail for financial compliance.

### Story Summary

- **47.1 AP↔GL Reconciliation Summary:** Dashboard showing AP vs GL balance as of a company‑local cutoff date, using configurable AP control account set.
- **47.2 Reconciliation Drilldown & Variance Attribution:** Detailed breakdown of variances into timing differences, posting errors, missing transactions, and rounding.
- **47.3 Supplier Statement Matching (manual entry MVP):** Manual entry of supplier statement balances and comparison to AP subledger per supplier.
- **47.4 AP Exception Worklist:** Consolidated view of all reconciliation exceptions (variances, mismatches, disputes) with assignment and resolution tracking.
- **47.5 Period Close Guardrails for AP:** Block AP transactions in closed periods with high‑privilege override and audit trail.
- **47.6 Reconciliation Snapshot & Audit Trail:** Immutable snapshots of reconciliation results with versioned audit trail for historical verification.

**Key Decisions:**
- Cutoff semantics: company‑local business date (`as_of_date` local midnight)
- GL reconciliation source: configured AP control account set (not hardcoded single account)
- Closed period policy: blocked by default, explicit high‑privilege audited override path only
- Supplier statement ingestion: manual entry MVP (no file import)
- Status/state columns: use `TINYINT` for any new schema

---

## Epic 53: Datetime API Consolidation Execution

**Goal:** Execute the 5-phase consolidation plan from Epic 52 audit: rename ~26 functions to `toUtcIso`/`fromUtcIso` namespaced API, update ~100+ consumer files, fix route validation, clean raw `.toISOString()` patterns, add Z$ test assertions, and remove deprecated wrappers.

### Story Summary

| Story | Title | Risk | Dependencies |
|-------|-------|------|-------------|
| 53-1 | Core API Surface + Route Validation | P1 | None |
| 53-2 | Accounting + Inventory Package Migration | P1 | 53-1 |
| 53-3 | Platform + Purchasing + Other Module Migration | P1 | 53-1 |
| 53-4 | API Lib + Sync Packages + Cross-cutting Touch-ups | P1 | 53-1 |
| 53-5 | Test Updates + Z$ Assertions | P2 | 53-1 through 53-4 |
| 53-6 | Cleanup — Remove Deprecated Wrappers | P2 | 53-5 |

**Key Decisions:**
- UTC ISO Z string is the canonical internal + API format (strict — no `{offset: true}`)
- Namespaced API: `toUtcIso` (produce Z), `fromUtcIso` (consume Z)
- Execution: incremental per-package (shared → modules → API lib → tests → cleanup)
- Breaking change (reject offset at validation): documented as known risk with deployment order requirement

---

## Epic 54: AP Lifecycle Correctness

**Goal:** Prove that existing AP write paths (invoice create/post/void, payment create/post/allocate, state machine transitions, multi-currency handling, period-close enforcement) are correct, idempotent, and produce valid journal entries. No new features — this is a correctness-hardening epic following the Epic 50–51 pattern.

**Program Alignment:** Sprint 54 in the S48–S61 Correctness-First Architecture Blueprint (re-baselined 2026-05-28).

### Story Summary

| Story | Title | Risk | Dependencies |
|-------|-------|------|-------------|
| 54.1 | AP Invoice Write-Path Correctness Hardening | P0 | None |
| 54.2 | AP Payment Write-Path Correctness Hardening | P0 | 54.1 (or concurrent) |
| 54.3 | AP State Machine Integrity | P1 | 54.1, 54.2 |
| 54.4 | Multi-Currency AP Correctness | P1 | 54.1, 54.2 |
| 54.5 | AP Period-Close Enforcement Hardening | P1 | 54.1, 54.2 |
| 54.6 | Follow-Up Closure Bucket | P2 | 54.1–54.5 |

**Key Decisions:**
- No new AP features — three-way matching and approval workflows remain deferred
- Existing feature tests (Epic 46) are presupposed; Epic 54 adds correctness proofs (idempotency, concurrency, edge cases)
- E51-A1 (auto-snapshot race) is NOT in Epic 54 scope — deferred to Epic 55 (snapshot correctness)
- Hard gates: E54-A1 (usage surface estimation on 54.1), E54-A2 (second-pass review checklist on all stories)
- All stories require 3× consecutive green integration tests

**Exit Gate:** No unresolved P0/P1 in AP write flows; all critical suites 3× consecutive green; sprint status validation passes.
- POS schema change deferred in deployment order: POS app update first, then server

---

## Epic 56: Correctness Infrastructure

**Goal:** Resolve two structural debt items carried from Epic 55: (1) archive flow blocked by append-only trigger, (2) missing CI gate enforcing the "no new business DB triggers" rule. Unblocks downstream correctness work (AR, Treasury, etc.).

**Program Alignment:** Sprint 56 pre-work in the S48–S61 Correctness-First Architecture Blueprint.

### Story Summary

| Story | Title | Risk | Dependencies |
|-------|-------|------|-------------|
| 56.1 | Archive Flow Trigger Constraint Resolution | P1 | E55-A2 |
| 56.2 | CI Lint Gate for No-Business-Trigger Rule | P1 | E55-A1 |

### Key Decisions
- Both stories are correctness infrastructure, not net-new features
- Archive flow trigger must be resolved before AR/Treasury archive stories
- CI lint gate for AGENTS.md §C is pre-requisite for the entire S48–S61 remainder

### Exit Gate
- `ap_reconciliation_snapshots` append-only trigger modified to allow archive path
- `npm run lint:migrations` fails on new migration introducing business-logic trigger
- E55-A1 and E55-A2 marked done in action-items.md

---

## Epic 57: AR + Treasury Correctness

**Goal:** Prove AR invoice lifecycle, payment posting, and credit/void/refund invariants are correct; prove treasury handoff and reconciliation consistency. Unblocked by Epic 56's archive flow fix and trigger 0201.

**Program Alignment:** Sprint 57 in the S48–S61 Correctness-First Architecture Blueprint. Builds on Epic 56 correctness infrastructure.

### Story Summary

| Story | Title | Risk | Dependencies |
|-------|-------|------|-------------|
| 57.1 | AR Snapshot/Archive Trigger Compatibility Verification | P1 | Epic 56 Story 56.1 (trigger 0201) |
| 57.2 | AR Invoice + Payment Posting Correctness | P0 | 57.1 |
| 57.3 | AR Credits/Void/Refund Invariants | P1 | 57.2 |
| 57.4 | Treasury Handoff + Reconciliation Correctness | P1 | 57.2 |

### Key Decisions
- AR shares `ap_reconciliation_snapshots` table with AP — trigger 0201 applies identically
- Archive path: `status='ARCHIVED'`, `archived_at`, `archive_version` — same pattern for AR as AP
- AR corrections use VOID/REFUND pattern (immutable finalized records, not mutation)
- Treasury balance is derived from `SUM(treasury_transactions)` — no separate balance column

### Exit Gate
- No unresolved P0/P1 in AR/treasury scope
- AR invoice + payment posting produces balanced journals (debits = credits)
- Credit/void/refund follow VOID/REFUND pattern with audit trail
- Treasury handoff consistent: AR payment credits treasury cash account, reconciliation passes
- `npx tsx scripts/validate-sprint-status.ts --epic 57` exits 0

---

## Epic 58: Inventory/Costing Correctness

**Goal:** Prove inventory valuation, stock movement, and costing calculation correctness with zero material mismatches in costing tests.

**Program Alignment:** Sprint 58 in the S48–S61 Correctness-First Architecture Blueprint. Follows Epic 57 (AR + Treasury Correctness).

### Requirements Inventory

#### Functional Requirements (Inventory/Costing-Specific)

FR1: The system must track stock levels for PRODUCTS and INGREDIENTS (inventory level 1+)
FR2: The system must support item types: SERVICE, PRODUCT, INGREDIENT, RECIPE
FR3: The system must support recipes (BOM) via recipe_ingredients for COGS calculation
FR4: The system must support outlet-specific pricing via item_prices.outlet_id
FR5: The system must enforce settings cascade: company-level defaults → outlet-level overrides
FR6: The system must track stock movements scoped by outlet_id
FR7: The system must support FIFO, Average, and LIFO costing methods for COGS calculation
FR8: The system must reconcile inventory subledger valuation to GL with zero material variance
FR9: The system must capture and report price variances when Standard costing is configured (variance-overlay on FIFO/Average/LIFO core methods)

#### Non-Functional Requirements (Epic 58 Scoped)

Scope note: NFR labels in this section are scoped to Epic 58 and MUST NOT be interpreted as document-global NFR identifiers.

NFR1: Exit gate tolerance: inventory↔GL reconciliation variance MUST be ≤ $0.01 (period aggregate)
NFR2: Consistent valuation across all inventory modules — cross-module valuation diff MUST be zero (two modules computing the same quantity from the same data must agree exactly; any difference indicates a correctness defect)
NFR3: Business invariants enforced in application code, not DB triggers
NFR4: Inventory write-path correctness must be proven before sprint close
NFR5: Compound indexes on (company_id, outlet_id) present and verified

#### Additional Requirements

AR1: Inventory module is optional per-company (per Module Enablement table)
AR2: COGS posts via cogs-posting.ts
AR3: Inventory must reconcile to journal entries (Accounting/GL at center)

#### Global Constraints (Reference — Apply to All Epics)

These cross-cutting invariants are inherited from the program baseline and apply to Epic 58:
- DECIMAL(18,2) for all monetary values — never FLOAT/DOUBLE
- Temporal polyfill for all datetime — never native Date
- Tenant isolation via company_id AND outlet_id on all data access
- Rerunnable/idempotent migrations with information_schema checks
- Stories must not depend on future stories within the same epic

### FR Coverage Map

| FR | Requirement | Story |
|----|-------------|-------|
| FR1 | Track stock levels for PRODUCTS and INGREDIENTS | 58.1, 58.2 |
| FR2 | Support item types: SERVICE, PRODUCT, INGREDIENT, RECIPE | 58.1 |
| FR3 | Support recipes (BOM) via recipe_ingredients for COGS | 58.1 |
| FR4 | Support outlet-specific pricing via item_prices.outlet_id | 58.2 |
| FR5 | Settings cascade: company-level → outlet-level | 58.2 |
| FR6 | Track stock movements scoped by outlet_id | 58.2 |
| FR7 | Support FIFO, Average, LIFO costing methods for COGS | 58.3 |
| FR8 | Reconcile inventory subledger valuation to GL with zero material variance | 58.4 |
| FR9 | Capture and report price variances when Standard costing is configured | 58.3 |

### NFR Evidence Map

| NFR | Requirement | Validating Test Suite | Artifact | Threshold |
|-----|-------------|----------------------|----------|-----------|
| NFR1 | Exit gate tolerance ≤ $0.01 | `test:unit:costing`, `test:integration:inventory` | Valuation reconciliation report | variance ≤ $0.01 |
| NFR2 | Consistent valuation across modules | `test:integration:inventory:posting` | Inventory subledger balance from `modules-inventory` (via `getInventorySubledgerBalance`) compared against aggregated item cost valuation from `modules-inventory-costing` (via `getAllItemsCostSummary` aggregated across all stock items), full-precision comparison before report rounding. **Implementation note:** No existing function aggregates `getItemCostSummary` across all items for a company. A new `getAllItemsCostSummary(companyId, db)` function MUST be added to `@jurnapod/modules-inventory-costing` no later than Story 58.3 completion and MUST be consumed by Story 58.5 gate automation for NFR2 evidence. | zero diff |
| NFR3 | Invariants in app code, not DB triggers | `npm run lint:migrations` | CI gate output | exits 0 |
| NFR4 | Inventory write-path correctness proven | `test:integration:inventory:posting` | 3× consecutive green runs | all suites green |
| NFR5 | Compound indexes verified | `test:integration:inventory:performance` | Query plan analysis | query plan shows covering index on `(company_id, outlet_id)` — no full table scan on tenant-scoped queries |

### Story Summary

| Story | Title | Risk | Dependencies |
|-------|-------|------|-------------|
| 58.1 | Inventory Item & Recipe Correctness | P1 | None (Epic 58 base story) |
| 58.2 | Stock Movement & Outlet Scoping Correctness | P1 | 58.1 |
| 58.3 | Costing Method Correctness | P0 | 58.1, 58.2 |
| 58.4 | Inventory-GL Reconciliation Correctness | P0 | 58.1, 58.2, 58.3 |
| 58.5 | Gate Validation Automation & Evidence Scripts | P2 | 58.1, 58.2, 58.3, 58.4 |

### Key Decisions

- Inventory module is OPTIONAL per-company — correctness testing must account for module enablement
- Stock tracking only for PRODUCTS and INGREDIENTS — SERVICE and RECIPE types are never stock-tracked
- Item types taxonomy enforced at item creation/update time
- Recipes (BOM) composition used for COGS calculation only at time of sale
- Costing methods: FIFO, Average, LIFO — all must produce correct valuation. Standard costing is a variance-overlay applied on top of the core method (does not replace FIFO/Average/LIFO layer consumption)
- **Global Constraints** (DECIMAL, Temporal, tenant isolation, migrations) are inherited from program baseline and apply to all Epic 58 stories

### Preconditions

The following upstream correctness guarantees apply to Epic 58 (see individual items for enforcement scope):

1. **Epic 56 Archive Trigger Resolution** (Story 56.1) — COMPLETE  
   Ensures archive flow does not block inventory snapshot/audit paths

2. **Epic 56 CI Lint Gate** (Story 56.2) — COMPLETE  
   `npm run lint:migrations` exits 0; no business-logic triggers in new migrations

3. **Epic 57 AR/Treasury Handoff** (Story 57.2) — MUST BE COMPLETE before Epic 58 Story 58.2 starts  
   AR payment credits treasury cash account; treasury handoff pattern proven. Epic 57 and Epic 58 may run concurrently through Story 57.1 / Story 58.1 only. From Story 58.2 onward, Epic 57 Story 57.2 MUST be complete.

4. **Fixture Ownership Model** — ACTIVE  
   Domain fixtures live in owner packages (`packages/modules-inventory`, `packages/modules-inventory-costing`); `@jurnapod/db/test-fixtures` contains only DB-generic primitives

5. **Test Script Infrastructure** — MUST BE DEFINED before Story 58.1 starts  
   The following npm scripts MUST be defined in the appropriate `package.json` files before any Epic 58 story begins:
   - `test:unit:costing` — unit tests for costing methods in `packages/modules-inventory-costing`
   - `test:integration:inventory` — integration tests for inventory posting in `apps/api`
   - `test:integration:inventory:posting` — inventory posting correctness tests (NFR4)
   - `test:integration:inventory:performance` — index-verification performance tests (NFR5)
   **Kickoff verification:** Run `npm run test:unit:costing && npm run test:integration:inventory && npm run test:integration:inventory:posting && npm run test:integration:inventory:performance` to verify npm script wiring and executable test infrastructure. If any command fails to execute, escalate before Story 58.1 starts.

6. **Sprint 58 Kickoff SOLID/DRY/KISS Gate** — PASS  
   Scorecard recorded in sprint status before first story starts

If any precondition is unmet, Story 58.1 MUST NOT start. Escalate to Sprint 58 planning owner.

### Exit Gate

All three conditions MUST be satisfied to close Sprint 58.

#### Gate 1 — Inventory Valuation Reconciliation

```
|inventory_subledger_value − gl_inventory_balance| ≤ $0.01 (cumulative as-of cutoff)
```

- **GL balance definition:** Cumulative ending balance — all-time total as of period-end cutoff timestamp. NOT period-only delta. "Cumulative as-of cutoff" means both subledger and GL values are summed across all time up to the cutoff, not filtered to only this period's journal lines.
- **Comparison unit:** Period aggregate (subledger and GL both aggregated over full period; document-level as diagnostic)
- **Scope limitation:** Gate 1 is validated for **current-date reconciliation only**. Historical as-of-date reconciliation has a known limitation: `getInventorySubledgerBalance()` uses `remaining_qty` (current remaining quantity), which subtracts post-cutoff consumption. This means historical past-date reconciliation will understate the subledger balance. This limitation is documented here; resolving it with a historical snapshot is out-of-scope for Epic 58.
- **GL account resolution (3-level fallback — aggregate across all resolved accounts):**
  1. `settings_strings` WHERE `key = 'inventory_reconciliation_account_ids'` (JSON array of account IDs) — resolved per company
  2. Aggregate across **all distinct** `items.inventory_asset_account_id` values for the company (NOT `LIMIT 1` — the control balance is the sum of all distinct inventory asset accounts) — fallback if setting absent
  3. `accounts.type_name IN ('INVENTORY','INVENTORY_ASSET','STOCK') AND company_id = ? AND a.is_active = 1` — final fallback
- **Account logging:** The gate validation script MUST log which fallback level was used and which account IDs were resolved, so misconfiguration is auditable.
- **Currency rule:** All amounts normalized to company base currency before comparison
- **Rounding rule:** Round at report boundary only; intermediate calculations use full precision
- **Pass condition:** absolute difference ≤ 0.01
- **Canonical computation path:** Gate 1 validation MUST use `InventoryReconciliationService.getInventoryReconciliationSummary()` as the canonical computation. Story 58.4 MUST modify `InventoryReconciliationService` to remove `LIMIT 1` on Level 2/3 fallback queries and aggregate across all distinct resolved accounts instead. This service modification is an explicit task within Story 58.4 scope.

#### Gate 2 — COGS Reconciliation

```
|cogs_subledger_total − sum(COGS_journal_lines)| ≤ $0.01 (cumulative as-of cutoff)
```

- **GL balance definition:** Same as Gate 1 — cumulative ending balance as of period-end cutoff timestamp
- **COGS GL account resolution (3-level fallback):**
  1. Per-item `items.cogs_account_id` — first priority (item-specific override)
  2. `account_mappings.mapping_key = 'COGS_DEFAULT' AND outlet_id IS NULL` — company-level fallback
  3. `accounts.type_name IN ('COGS') AND company_id = ? AND a.is_active = 1` — final fallback
- **Account logging:** The gate validation script MUST log which fallback level was used and which account IDs were resolved.
- **Pass condition:** absolute difference ≤ 0.01
- **Canonical computation path:** Gate 2 validation MUST use the existing COGS posting and reconciliation computation path as implemented in `cogs-posting.ts` / `cogs.ts`. Any divergence must be justified and documented.

#### Gate 3 — Sprint Health

- No unresolved P0/P1 in inventory/costing scope at pre-close
- All **critical suites** 3× consecutive green:  
  `test:unit:costing`, `test:integration:inventory`, `test:integration:inventory:posting`  
  (these three are the named critical suites for Gate 3 — see NFR Evidence Map)
- **Tracking mechanism:** CI MUST append per-suite run results to `_bmad-output/implementation-artifacts/sprint-status.yaml` for Epic 58 Gate 3 history. `npx tsx scripts/validate-sprint-status.ts --epic 58` MUST enforce that each critical suite has 3 consecutive green runs recorded before sprint close.
- `npx tsx scripts/validate-sprint-status.ts --epic 58` exits 0
- `npx tsx scripts/validate-epic-58-gates.ts` exits 0 (automated gate evidence — all thresholds met)

#### Inventory COGS Posting Precondition

Gate 1 and Gate 2 depend on the accounting module correctly posting COGS journal entries (debit COGS, credit Inventory). Before Story 58.4 validation runs, the inventory→accounting journal boundary must produce valid, balanced journal entries. This is validated as part of Story 58.4 (not a separate precondition — failures are in-scope for Epic 58).

#### Evidence Collection Automation

The exit gate requires machine-verifiable evidence. The following script contract MUST be implemented during Sprint 58:

**Script:** `scripts/validate-epic-58-gates.ts`

**Responsibilities:**
1. Run test suites: `test:unit:costing`, `test:integration:inventory`, and `test:integration:inventory:posting`
2. Verify `version` field on each `__EPIC58_GATE__` line matches expected version; if unknown, malformed, or mismatched, exit 1 with diagnostic
3. Parse machine-parseable test output (see contract below)
4. Validate Gate 1: variance against threshold (`≤ $0.01`) — recompute pass/fail from numeric values
5. Validate Gate 2: COGS variance against threshold (`≤ $0.01`) — recompute pass/fail from numeric values
6. Validate NFR2: `cross_module_diff` from test output must be exactly zero
7. Validate Gate 3 (sprint health): `p0_count`, `p1_count`, `critical_suites_green` — see Gate 3 output fields
8. Exit `0` only if all gates pass; exit `1` otherwise (with diagnostic output to stderr)

**Machine-parseable output contract:**
All reconciliation test suites MUST emit JSON lines to stdout prefixed with `__EPIC58_GATE__`. The gate script parses any line matching the regex `__EPIC58_GATE__ \{.*"gate":".*".*\}` from stdout. The `pass` field is informational only — the script MUST recompute pass/fail from numeric values.

**Required output lines (one per gate, plus NFR evidence line):**
```
__EPIC58_GATE__ {"version": 1, "gate": "GATE1", "variance": "0.0034", "threshold": "0.01", "pass": true}
__EPIC58_GATE__ {"version": 1, "gate": "GATE2", "variance": "0.0000", "threshold": "0.01", "pass": true}
__EPIC58_GATE__ {"version": 1, "gate": "NFR2", "cross_module_diff": 0, "pass": true}
__EPIC58_GATE__ {"version": 1, "gate": "GATE3", "p0_count": 0, "p1_count": 0, "critical_suites_green": true, "critical_suite_names": ["test:unit:costing", "test:integration:inventory", "test:integration:inventory:posting"], "pass": true}
```

**Gate 3 output fields:**
- `p0_count`: number of unresolved P0 issues
- `p1_count`: number of unresolved P1 issues
- `critical_suites_green`: true only if all named critical suites are green in the current CI run
- `critical_suite_names`: the three suites required to be green (`test:unit:costing`, `test:integration:inventory`, `test:integration:inventory:posting`)
- `pass`: computed as `p0_count == 0 && p1_count == 0 && critical_suites_green`

**Consecutive-green enforcement boundary:**
- `scripts/validate-epic-58-gates.ts` validates current-run gate evidence only.
- `scripts/validate-sprint-status.ts --epic 58` validates 3× consecutive green history from `_bmad-output/implementation-artifacts/sprint-status.yaml`.

**Script contract:**
```bash
npx tsx scripts/validate-epic-58-gates.ts
# Exit 0: all gates pass
# Exit 1: any gate fails (with diagnostic output to stderr)
```

**Integration:** This script MUST be added to Gate 3 as the automated evidence collector. Sprint 58 cannot be closed without this script exiting 0.

---

## Story 58.1: Inventory Item & Recipe Correctness

As a system integrity auditor,
I want item types (SERVICE/PRODUCT/INGREDIENT/RECIPE) and recipe compositions (BOM) to enforce correct stock tracking behavior,
So that only PRODUCTS and INGREDIENTS are tracked for stock, and COGS calculations use correct recipe ingredient ratios.

**Acceptance Criteria:**

**Given** an item with type `PRODUCT` or `INGREDIENT`,
**When** the system processes a stock movement,
**Then** the stock level MUST be updated correctly in `item_stock` or equivalent table.

**Given** an item with type `SERVICE` or `RECIPE`,
**When** the system processes a stock movement,
**Then** the stock level MUST NOT be updated (no-op behavior).

**Given** a `RECIPE` item with `recipe_ingredients` entries,
**When** COGS is calculated,
**Then** the calculation MUST use the correct ingredient quantities from the recipe composition.

**Given** a `PRODUCT` item with multiple `recipe_ingredients`,
**When** calculating COGS for a sale,
**Then** the system MUST correctly aggregate all ingredient costs per the configured costing method (FIFO/Average/LIFO). Standard costing is a variance-tracking overlay on the core costing method; it does not replace FIFO/Average/LIFO layer consumption.

---

## Story 58.2: Stock Movement & Outlet Scoping Correctness

As a multi-outlet operations manager,
I want stock movements to be correctly scoped by outlet and company,
So that inventory reports show accurate quantities per outlet and cross-outlet leakage cannot occur.

**Acceptance Criteria:**

**Given** a stock movement transaction (sale, adjustment, transfer),
**When** the movement is recorded,
**Then** the movement MUST be scoped by `company_id` AND `outlet_id` (composite constraint).

**Given** stock movement records,
**When** querying stock levels,
**Then** the query MUST filter by `outlet_id` and return only outlet-specific quantities.

**Given** a transfer from outlet A to outlet B,
**When** the movement is recorded,
**Then** outlet A's stock decreases and outlet B's stock increases atomically.

**Given** outlet-specific pricing in `item_prices`,
**When** a sale is processed at outlet X,
**Then** the price MUST be resolved from `item_prices` filtered by `outlet_id = X` (fallback to company-level if no outlet-specific price exists).

**Given** a stock movement that would reduce quantity below zero,
**When** the movement is recorded,
**Then** the system MUST reject with error code `INSUFFICIENT_STOCK` and a message containing the shortfall quantity; no change to stock levels.

**Given** a multi-item transaction where one or more lines would cause negative stock,
**When** the transaction is processed,
**Then** the system MUST reject the entire transaction atomically — no partial stock updates, no partial journal entries.

---

## Story 58.3: Costing Method Correctness

As a financial controller,
I want the inventory costing method (FIFO, Average, LIFO) to produce correct COGS and inventory values,
So that financial statements reflect accurate cost of goods sold and ending inventory.

**Acceptance Criteria:**

**Given** a company configured with FIFO costing,
**When** items are sold,
**Then** COGS MUST be calculated using the oldest First-In-First-Out cost layers.

**Given** a company configured with Average costing,
**When** items are sold,
**Then** COGS MUST be calculated using the weighted average cost at time of sale.

**Given** a company configured with LIFO costing,
**When** items are sold,
**Then** COGS MUST be calculated using the most recent Last-In-First-Out cost layers.

**Given** multiple purchases at different prices,
**When** the costing method is LIFO,
**Then** the cost layers MUST be consumed in reverse chronological order (newest first).

**Given** a cost layer is partially consumed (selling less than the layer quantity),
**When** the next sale occurs,
**Then** the remaining quantity of that layer MUST carry forward to the next available layer.

**Given** a company configured with Standard costing,
**When** items are purchased at different prices than standard,
**Then** the system MUST record the price variance separately from the standard cost.

**Note:** Standard costing is a variance-tracking method; the core LIFO/Average/FIFO layer consumption still applies. Standard costing correctness requires validating that price variances are captured and reported correctly, not that COGS is calculated differently.

---

## Story 58.4: Inventory-GL Reconciliation Correctness

As an accountant,
I want inventory valuation and COGS to reconcile perfectly to GL journal entries,
So that the inventory subledger matches the general ledger with zero material variance.

**Acceptance Criteria:**

**Given** a POS or sales transaction that includes inventory items,
**When** the transaction is posted,
**Then** the inventory decrease MUST create a corresponding journal entry debiting COGS and crediting inventory.

**Given** journal entries from inventory movements,
**When** running the inventory valuation report,
**Then** the sum of COGS journal lines MUST equal the reported COGS for the period.

**Given** the GL trial balance is queried for inventory and COGS accounts,
**When** compared to the inventory subledger valuation,
**Then** the difference MUST be less than $0.01 (rounding tolerance) — per **Gate 1** of the Exit Gate contract.

**Given** a stock adjustment (shrinkage, damage, count variance),
**When** the adjustment is recorded,
**Then** the journal entry MUST debit/credit the appropriate inventory variance account.

**Given** a multi-currency inventory purchase,
**When** the purchase is recorded,
**Then** the cost in base currency MUST be calculated using the exchange rate at time of purchase — rate source is `exchange_rates` table, rate as of purchase date, using the `rate` column (mid-rate), rounded to 4 decimal places.

**Note on Story 58.4 scope:** Story 58.4 validates reconciliation mechanics. The multi-currency AC is included; if its complexity exceeds single-agent session scope, split at Sprint 58 planning into:
- **58.4A** — Base-currency reconciliation mechanics (Gate 1 + Gate 2 formula validation)
- **58.4B** — Multi-currency reconciliation correctness

Both 58.4A and 58.4B remain within Epic 58 correctness scope (not net-new features) as they validate existing multi-currency purchasing paths, not introduce new ones.

---

## Story 58.5: Gate Validation Automation & Evidence Scripts

As a release engineer,
I want automated, machine-verifiable gate evidence that proves all exit criteria are met,
So that Sprint 58 can close with confidence and without manual gate validation.

**Acceptance Criteria:**

**Given** the test suites emit `__EPIC58_GATE__` JSON lines to stdout,
**When** `scripts/validate-epic-58-gates.ts` is executed,
**Then** the script MUST run all three critical test suites and parse their `__EPIC58_GATE__` output lines:
  - `test:unit:costing`
  - `test:integration:inventory`
  - `test:integration:inventory:posting`

**Given** the gate script parses a `__EPIC58_GATE__` line for Gate 1,
**When** it evaluates the variance,
**Then** it MUST recompute pass/fail from numeric values (`variance ≤ threshold`) — the `pass` field is informational only.

**Given** the gate script parses a `__EPIC58_GATE__` line for Gate 2,
**When** it evaluates the COGS variance,
**Then** it MUST recompute pass/fail from numeric values (`variance ≤ threshold`).

**Given** the gate script parses a `__EPIC58_GATE__` line for NFR2 (cross-module),
**When** it evaluates `cross_module_diff`,
**Then** it MUST require `cross_module_diff` to be exactly zero.

**Given** the gate script parses a `__EPIC58_GATE__` line for Gate 3 (sprint health),
**When** it evaluates `p0_count`, `p1_count`, and `critical_suites_green`,
**Then** it MUST compute `pass` as `p0_count == 0 && p1_count == 0 && critical_suites_green == true`.

**Given** any gate fails,
**When** the script runs,
**Then** it MUST exit with code 1 and emit diagnostic output to stderr listing which gate failed and by how much.

**Given** all gates pass,
**When** the script runs,
**Then** it MUST exit with code 0 and emit a summary line to stdout.

**Given** the script is integrated into CI,
**When** a sprint tries to close without the script passing,
**Then** the CI job MUST fail and the sprint MUST NOT close.

**Scope note:** Story 58.5 implements only `scripts/validate-epic-58-gates.ts`. Defining the npm test scripts (`test:unit:costing`, `test:integration:inventory`, etc.) is an Epic 58 startup prerequisite — see Precondition #5.

**Required new function:** A new `getAllItemsCostSummary(companyId: number, db: Kysely): Promise<AggregatedCostSummary>` function MUST be added to `@jurnapod/modules-inventory-costing` to support NFR2 cross-module comparison. This function is a prerequisite for NFR2 evidence and MUST be implemented before `test:integration:inventory:posting` can emit valid `__EPIC58_GATE__` lines for NFR2.
