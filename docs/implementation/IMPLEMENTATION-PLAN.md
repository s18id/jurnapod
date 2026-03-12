# Implementation Plan: Tax Decoupling, Payment Variance & Cash/Bank Operations

## Overview

This document tracks the implementation of three related architectural changes:

1. **Tax Account Decoupling** (ADR-0007 Part A) — Remove hardcoded `SALES_TAX` dependency from account mappings; source tax liability accounts from tax module.
2. **Payment Variance Forex Delta** (ADR-0008) — Handle differences between invoice amount and actual payment from foreign clients.
3. **Cash & Bank Operations** (ADR-0007 Part B) — Dedicated workflow for cash/bank mutations, top-up, withdrawal, and FOREX operations.

---

## Locked Decisions

| Decision | Recommendation | Status |
|----------|---------------|--------|
| Payment variance accounts | Company-level defaults under Other Income/Expense | ✅ Locked |
| `cash_bank_transactions.reference` uniqueness | Enforce only when non-NULL; allow duplicate NULLs | ✅ Locked |
| ADR-0008 naming | Rename from "ADR-0007" to "ADR-0008" | ✅ Locked |
| FOREX boundary | Cash/Bank = treasury exchange; ADR-0008 = AR payment variance | ✅ Locked |

---

## Migration Order

| # | File | Description |
|---|------|-------------|
| 0083 | `0083_tax_rates_add_account_id.sql` | Add `account_id` to tax_rates |
| 0084 | `0084_remove_sales_tax_mapping_key.sql` | Remove SALES_TAX from CHECK constraints |
| 0085 | `0085_cash_bank_transactions.sql` | Create cash_bank_transactions table |
| 0086 | `0086_sales_payments_add_variance_columns.sql` | Add `invoice_amount_idr`, `payment_amount_idr`, `payment_delta_idr` to sales_payments |
| 0087 | `0087_company_account_mappings_add_payment_variance_keys.sql` | Add `PAYMENT_VARIANCE_GAIN` and `PAYMENT_VARIANCE_LOSS` mapping keys |

---

## Phase 1: Tax Account Decoupling (COMPLETE)

### 1.1 Database Migration ✅ COMPLETE

```sql
-- Add nullable account_id to tax_rates (idempotent)
-- Run via information_schema guard for MySQL/MariaDB compatibility
```

- Add nullable `account_id BIGINT UNSIGNED NULL` to `tax_rates`
- Add FK constraint: `(company_id, account_id)` → `accounts(company_id, id)`
- Index on `account_id` for lookup performance

### 1.2 API & Contracts ✅ COMPLETE

- Update `tax-rates` API to accept `account_id` in create/update payloads
- Add Zod validation: `account_id` must belong to same company
- Return resolved account in tax rate responses

### 1.3 Backoffice UI ✅ COMPLETE

- Tax Rates page: add liability account dropdown selector
- Account Mappings page: remove `SALES_TAX` row completely
- Keep only: `AR`, `SALES_REVENUE`, `INVOICE_PAYMENT_BANK`

### 1.4 Posting Logic ✅ COMPLETE

**Files:**
- `sales-posting.ts`
- `sync-push-posting.ts`

**Changes:**
1. Remove `SALES_TAX` from required mapping keys
2. For each tax line (`sales_invoice_taxes` / `pos_transaction_taxes`):
   - Join to `tax_rates` to get `account_id`
   - Post credit to mapped tax liability account
3. If taxable document exists but any tax rate lacks valid account → fail with `TAX_ACCOUNT_MISSING`

### 1.5 Error Handling ✅ COMPLETE

- New error code: `TAX_ACCOUNT_MISSING`
- Message: "Tax rate [{code}] has no liability account configured. Configure account in Tax Rates page."
- Distinct from `OUTLET_ACCOUNT_MAPPING_MISSING`

### 1.6 Testing ✅ COMPLETE

- Unit: tax account resolution, missing account error path
- Integration: sales posting with/without tax accounts, POS sync with taxes
- E2E: configure tax rate with/without account, verify posting behavior

---

## Phase 2: Payment Variance Forex Delta (ADR-0008) ✅ COMPLETE

### 2.0 Implementation Status

- ✅ Migration complete (`0086_sales_payments_add_variance_columns.sql`)
- ✅ Company mapping key extension complete (`0087_company_account_mappings_add_payment_variance_keys.sql`)
- ✅ API, posting logic, and business errors implemented
- ✅ Backoffice variance display implemented
- 🔶 Hardening follow-up: add concurrent post race integration test (in addition to retry-idempotency coverage)

### 2.1 Data Model

**Invoice/Payment Tables:**
- Add `invoice_amount_idr DECIMAL(18,2)` — amount applied to settle outstanding AR (set at posting time)
- Add `payment_amount_idr DECIMAL(18,2)` — actual amount received in IDR
- Add `payment_delta_idr DECIMAL(18,2)` — persisted difference at posting time (NOT generated column)

**Company Configuration:**
- Add `PAYMENT_VARIANCE_GAIN` mapping key — default gain account (Other Income)
- Add `PAYMENT_VARIANCE_LOSS` mapping key — default loss account (Other Expense)

**Important Naming Contract:**
- API input field: `actual_amount_idr` — amount received from customer
- Stored/read model field: `payment_amount_idr` — persisted version of received amount
- Computed at posting: `invoice_amount_idr = min(payment_amount_idr, outstanding_before)`
- Computed at posting: `payment_delta_idr = payment_amount_idr - invoice_amount_idr` (always ≥ 0 in normal flow)

### 2.2 Posting Logic

**Core Invariant:** Variance is computed against **outstanding AR at posting time**, not full invoice amount. This ensures multi-payment sequences work correctly.

On payment posting:

```
outstanding_before = invoice.grand_total - invoice.paid_total
invoice_amount_applied = min(payment_amount_idr, outstanding_before)
payment_delta_idr = payment_amount_idr - invoice_amount_applied

// Journal entries:
Dr Cash/Bank (payment_amount_idr)
Cr AR (invoice_amount_applied)
Cr Payment Variance Gain (payment_delta_idr) // only when delta > 0
```

**Key behaviors:**
- **Exact settlement:** delta = 0 → no variance entry
- **Overpayment:** delta > 0 → posts to variance gain account
- **Underpayment (partial):** delta = 0 (since we cap at outstanding) → remaining AR stays open, no variance loss posted yet
- **Underpayment with final settlement:** only possible if explicitly configured; not default behavior

**Failure criteria:**
- If `payment_delta_idr > 0` and `PAYMENT_VARIANCE_GAIN` mapping missing → `PAYMENT_VARIANCE_GAIN_MISSING` error (business error, not 500)
- If `payment_delta_idr < 0` in future explicit underpayment-loss flow (not default v1) and `PAYMENT_VARIANCE_LOSS` missing → `PAYMENT_VARIANCE_LOSS_MISSING` error

### 2.3 API

- Extend payment request schema with `actual_amount_idr` (optional, defaults to `amount`)
- On POST `/sales/payments/:id/post`:
  - Compute and persist `invoice_amount_idr` and `payment_delta_idr` atomically
  - Return `payment_delta_idr` in response
  - Validate fiscal period is open (already enforced)
  - Return `PAYMENT_VARIANCE_GAIN_MISSING` or `PAYMENT_VARIANCE_LOSS_MISSING` business error if variance accounts not configured

### 2.4 Backoffice UI

- Payment posting screen: show invoice amount, payment amount, variance preview
- Highlight variance amount (color-coded: green=gain, blue=partial/open AR)
- Financial reports: aggregate payment variances under Other Income/Expense
- Note: Underpayment (partial) keeps AR open - no loss posted in default flow

### 2.5 Testing

- Unit: variance calculation against outstanding, gain/loss account direction
- Integration: 
  - Full payment flow with over-payment (gain posted)
  - Partial under-payment (no variance, AR remains)
  - Exact match (no variance)
  - Multi-payment sequence ending with overpayment on final payment
  - Retry idempotency (double-post produces one journal batch)
  - Concurrent post race (two near-simultaneous post calls produce one journal batch)
  - Missing variance account configuration (business error)
  - Rounding boundary (0.01 IDR differences)

---

## Phase 3: Cash & Bank Operations

### 3.1 Database Migration

```sql
CREATE TABLE cash_bank_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  transaction_type ENUM('MUTATION', 'TOP_UP', 'WITHDRAWAL', 'FOREX') NOT NULL,
  transaction_date DATE NOT NULL,
  reference VARCHAR(100) NULL,
  description VARCHAR(500) NOT NULL,
  source_account_id BIGINT UNSIGNED NOT NULL,
  destination_account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  exchange_rate DECIMAL(18,8) NULL,
  base_amount DECIMAL(18,2) NULL,
  fx_gain_loss DECIMAL(18,2) NULL DEFAULT 0,
  fx_account_id BIGINT UNSIGNED NULL,
  status ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
  posted_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_bank_tx_company_ref (company_id, reference),
  KEY idx_cash_bank_tx_company_date (company_id, transaction_date),
  CONSTRAINT fk_cash_bank_tx_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_cash_bank_tx_source_account FOREIGN KEY (company_id, source_account_id) REFERENCES accounts(company_id, id),
  CONSTRAINT fk_cash_bank_tx_dest_account FOREIGN KEY (company_id, destination_account_id) REFERENCES accounts(company_id, id)
) ENGINE=InnoDB;
```

**Idempotent guard:** Check `information_schema.TABLES` before creating.

### 3.2 Journal Effects by Type

| Type | Debit (Dr) | Credit (Cr) |
|------|------------|-------------|
| `MUTATION` | Destination (cash/bank) | Source (cash/bank) |
| `TOP_UP` | Bank account | Cash account |
| `WITHDRAWAL` | Cash account | Bank account |
| `FOREX` | Destination (converted) | Source (original) + FX gain/loss |

### 3.3 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cash-bank-transactions` | List with filters (company/outlet/date/type) |
| POST | `/api/cash-bank-transactions` | Create new transaction |
| POST | `/api/cash-bank-transactions/:id/post` | Post to journal |
| POST | `/api/cash-bank-transactions/:id/void` | Reverse with contra entries |

### 3.4 Validation Rules

- Source and destination accounts must differ
- Both accounts must be classified as cash or bank (`type_name` contains 'kas'/'cash'/'bank')
- Amount must be positive
- For FOREX: `exchange_rate` required, `currency_code` required
- Fiscal year must be open for transaction date

### 3.5 Backoffice UI

- Route: `/cash-bank` (Accounting nav group)
- Components:
  - SegmentedControl for operation type
  - Date picker, reference, description
  - Two account selectors (filtered to cash/bank)
  - Amount input + currency selector
  - FOREX panel: exchange rate, converted amount, gain/loss preview
  - "Post" button (create + post in one action)
  - Recent transactions table with status badges + void action

### 3.6 Permissions

- Module: `cash_bank`
- Permission: `create`
- Roles: `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`

### 3.7 Testing

- Unit: journal balance for all operation types, FOREX rounding
- Integration: post/void flows, auth isolation, tenant scoping
- E2E: full backoffice flow for each operation type

---

## Phase 4: Security & Contracts

### 4.1 Current Baseline

Core contract fields are already present in shared schemas:
- Tax: `packages/shared/src/schemas/taxes.ts:9` — includes nullable `account_id` for liability account
- Cash/Bank: `packages/shared/src/schemas/cash-bank.ts:21` — includes transaction type, status, forex fields
- Payment: `packages/shared/src/schemas/sales.ts:307` — includes `payment_amount_idr`, `invoice_amount_idr`, `payment_delta_idr`

Routes already use auth guards + company scoping:
- Tax rates: `apps/api/app/api/settings/tax-rates/route.ts:18` — `company_id` in query, `requireAccess` for mutations
- Payment post: `apps/api/app/api/sales/payments/[paymentId]/post/route.ts:24` — `companyId` passed to domain function
- Cash/Bank: `apps/api/app/api/cash-bank-transactions/route.ts:45` — `companyId` filter + outlet access check

### 4.2 Shared Contracts Checklist

- [x] **4.2.1** Verify all schemas exported from `packages/shared/src/index.ts` remain stable
- [x] **4.2.2** Tax rate contract keeps nullable `account_id` for liability account (decoupled)
- [x] **4.2.3** Cash/Bank contract includes transaction type/status + forex fields, money fields decimal-safe
- [x] **4.2.4** Payment response contract exposes `payment_amount_idr`, `invoice_amount_idr`, `payment_delta_idr` consistently with posting logic
- [x] **4.2.5** Add contract-focused regression tests covering shared schemas (parse/invalid cases for new fields, nullable edges) — implemented at `apps/api/src/lib/phase4.contracts.test.ts`

### 4.3 Validation & Security Enforcement Checklist

- [x] **4.3.1 Tenant scoping** — audit every query path to ensure `company_id` is always in SQL predicates (already: cash-bank lib, tax-rates routes)
- [x] **4.3.2 Outlet scoping** — verify outlet-aware paths enforce `userHasOutletAccess` for list/create/post/void flows
- [x] **4.3.3 Permission checks** — confirm each mutation endpoint has `requireAccess` with correct module + permission:
  - Tax rates: module `settings`, permissions `create`/`update`/`delete`
  - Payment post: module `sales`, permission `update`
  - Cash/Bank: module `cash_bank`, permissions `create`/`read`
- [x] **4.3.4 Boundary validation** — keep strict Zod parse at route edges, business-rule checks in domain libs (account existence, account class, fiscal year open, state transitions)
- [x] **4.3.5 Error contracts** — keep business errors explicit (e.g. `PAYMENT_VARIANCE_GAIN_MISSING`, `TAX_ACCOUNT_MISSING`) and avoid leaking internal errors

### 4.4 Test Checklist

Existing unit coverage:
- `apps/api/src/lib/cash-bank.test.ts` — journal balance, account classification, direction validation
- `apps/api/src/lib/sales.payment-variance.test.ts` — variance calculation, error types

Phase 4 implemented tests:
- [x] **4.4.1** Cross-company access rejection on tax rates (GET/POST/PUT/DELETE) — `apps/api/tests/integration/tax-rates.acl.integration.test.mjs`
- [x] **4.4.2** Cross-company access rejection on payment post — `apps/api/tests/integration/sales-payments.acl.integration.test.mjs`
- [x] **4.4.3** Cross-company access rejection on cash/bank transactions (list/create/post/void) — `apps/api/tests/integration/cash-bank.acl.integration.test.mjs`
- [x] **4.4.4** Outlet access rejection when `outlet_id` provided but user lacks access — `apps/api/tests/integration/cash-bank.acl.integration.test.mjs`
- [x] **4.4.5** Role matrix checks: allowed vs denied mutations per role (`OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`) — `apps/api/tests/integration/cash-bank.acl.integration.test.mjs`, `apps/api/tests/integration/sales-payments.acl.integration.test.mjs`
- [x] **4.4.6** Success path verification: same-company authorized users can mutate correctly — `apps/api/tests/integration/cash-bank.acl.integration.test.mjs`, `apps/api/tests/integration/sales-payments.acl.integration.test.mjs`

### 4.5 Definition of Done

- [x] Contracts in `packages/shared` are final and consumed without mismatch across apps
- [x] All affected endpoints enforce company/outlet + permission checks
- [x] Security/contract tests implemented with evidence (see test files below)
- [x] Phase 4 section can be marked complete ✅

### 4.6 Evidence Template

```bash
# Run Phase 4 contract regression tests
cd apps/api && node --test --import tsx src/lib/phase4.contracts.test.ts

# Run existing unit tests
cd apps/api && node --test --import tsx src/lib/cash-bank.test.ts src/lib/sales.payment-variance.test.ts

# Run lint/typecheck
cd apps/api && npm run lint && npm run typecheck
```

---

## Phase 5: Rollout & Monitoring

### 5.0 Goal & Exit Criteria

Goal: ship tax decoupling, payment variance, and cash/bank flows safely with zero tenant leakage, no duplicate posting, and auditable journals.

Exit criteria:
- [ ] No P0/P1 incidents for 7 consecutive days after production rollout
- [ ] Posting correctness checks pass daily (balanced journals, no duplicate doc posting)
- [ ] Tax/account configuration gaps reduced to agreed threshold
- [ ] Support/ops runbook validated by on-call and finance ops

### 5.1 Deployment Sequence (Progressive)

1. **Database migrations first**
   - Apply in order: `0083` → `0084` → `0085` → `0086` → `0087`
   - Verify rerunnable/idempotent behavior on MySQL + MariaDB staging before prod
2. **Backend rollout**
   - Deploy API/domain logic after migration verification
   - Keep strict business errors (`TAX_ACCOUNT_MISSING`, `PAYMENT_VARIANCE_GAIN_MISSING`, etc.)
3. **Backoffice rollout**
   - Enable UI progressively by role/company wave (pilot first, then broad rollout)
4. **Wave strategy**
   - Wave 1: internal/pilot companies
   - Wave 2: low-risk companies
   - Wave 3: full rollout after monitoring gates pass

Phase dependency guard:
- `0086` and `0087` MUST be present before enabling payment variance posting paths.

### 5.2 Pre-Production Readiness Gates

- [ ] Migration dry-run complete on staging snapshot (including rerun)
- [ ] Contract tests green for shared schemas (`taxes`, `cash-bank`, `sales`)
- [ ] Security ACL integration tests green (company/outlet isolation + role matrix)
- [ ] Posting regression tests green (sales posting, POS sync posting, payment variance, cash/bank post+void)
- [ ] Backoffice smoke tests complete for tax rates, account mappings, payment posting, cash/bank flows
- [ ] Rollback plan reviewed by backend + ops

### 5.3 Observability (Temporary Rollout Metrics)

Track per company and per outlet where applicable:

- `tax_account_missing_count`
  - Meaning: posting attempts rejected due to tax rates without liability account
  - Dimensions: `company_id`, `outlet_id`, `tax_code`, `source` (`sales_invoice`/`pos_sync`)
- `cash_bank_post_failures_by_type`
  - Meaning: post failures grouped by transaction type
  - Dimensions: `company_id`, `outlet_id`, `transaction_type`, `error_code`
- `payment_variance_posted_amount`
  - Meaning: total posted variance amount (IDR) over time
  - Dimensions: `company_id`, `outlet_id`, `direction` (`gain`/`loss`), `currency_code`

Recommended companion checks (correctness-focused):
- `journal_unbalanced_count` (must remain zero)
- `duplicate_post_attempt_count` (monitor idempotency pressure)
- `cash_bank_void_count` with reason distribution

### 5.4 Alerts & Thresholds (First 14 Days)

- **P1 alert:** `journal_unbalanced_count > 0` in any 15-minute window
- **P1 alert:** sudden spike in `duplicate_post_attempt_count` (possible retry/race regressions)
- **P2 alert:** `tax_account_missing_count` exceeds baseline threshold per company/day
- **P2 alert:** `cash_bank_post_failures_by_type` rate > threshold for any type (`MUTATION`, `TOP_UP`, `WITHDRAWAL`, `FOREX`)
- **Investigate:** unusual `payment_variance_posted_amount` outliers versus historical norm

### 5.5 Operator Checklist (Go-Live)

- [ ] Configure `PAYMENT_VARIANCE_GAIN` and `PAYMENT_VARIANCE_LOSS` per company
- [ ] Configure liability `account_id` on all active tax rates
- [ ] Confirm cash/bank accounts are properly classified and selectable
- [ ] Train accounting users on `/cash-bank` post + void workflows
- [ ] Validate fiscal periods for intended backdated operations
- [ ] Communicate behavior change: no `SALES_TAX` mapping dependency at posting time

### 5.6 Rollback / Mitigation Plan

If severe issue detected:
1. Disable affected UI entry points for impacted feature wave
2. Keep migration schema in place (prefer feature rollback over destructive DB rollback)
3. Revert backend code path to last known-good version
4. Run reconciliation checks:
   - Journal batch balance
   - Duplicate posting scan by document/type/idempotency keys
5. Publish incident note with impacted companies/outlets and remediation status

### 5.7 Evidence Log Template

```bash
# Migration verification (staging/prod)
# - applied versions
# - rerun outcome

# Contract + security tests
cd apps/api && node --test --import tsx src/lib/phase4.contracts.test.ts
cd apps/api && node --test tests/integration/tax-rates.acl.integration.test.mjs tests/integration/sales-payments.acl.integration.test.mjs tests/integration/cash-bank.acl.integration.test.mjs

# Quality gates
cd apps/api && npm run lint && npm run typecheck
```

Record:
- Deployment timestamp
- Wave/company scope
- Metric snapshots at T+1h, T+24h, T+7d
- Incidents and remediation links

### 5.8 Ownership Matrix (RACI-Lite)

| Workstream | Primary Owner | Support | Approval |
|------------|---------------|---------|----------|
| Migration execution (`0083`-`0087`) | Backend | DevOps | Engineering Lead |
| Posting correctness verification | Backend | QA | Accounting Lead |
| ACL/tenant isolation verification | Backend | QA/Security | Engineering Lead |
| Backoffice rollout enablement | Frontend | QA | Product Owner |
| Operator enablement & training | Finance Ops | Support | Product Owner |
| Production monitoring + incident response | DevOps | Backend/QA | Engineering Lead |

### 5.9 Go/No-Go Gates (Production)

Go-live is allowed only when all checks pass:

- [ ] All pre-production readiness gates in **5.2** are complete
- [ ] No open P0/P1 defects in affected modules (`tax`, `sales payments`, `cash-bank`, `posting`)
- [ ] `journal_unbalanced_count = 0` for staging validation window
- [ ] Duplicate posting regression checks pass (idempotent behavior verified)
- [ ] Pilot wave signs off on UX + accounting outcomes

No-go triggers (delay release):
- Any unresolved posting imbalance
- Any cross-company or cross-outlet authorization leak
- Migration incompatibility between MySQL and MariaDB
- Reproducible duplicate-post race not mitigated

---

## Acceptance Criteria

| Feature | Criteria |
|---------|----------|
| Tax decoupling | Posting fails with `TAX_ACCOUNT_MISSING` when tax rate has no account; no runtime dependency on `SALES_TAX` mapping |
| Payment variance | Journals auto-generated and balanced; variance visible in UI and reports |
| Cash/bank | All transaction types post balanced journals; void creates contra entries |
| Security | Tenant isolation + role permissions pass integration tests |
| Compatibility | All migrations rerunnable on MySQL 8.0+ and MariaDB |

---

## Related Documents

- ADR-0007: Tax Account Decoupling and Cash/Bank Operations
- ADR-0008: Handling Payment Variance for Foreign Clients (Forex Delta)
- ADR-0001: GL as Source of Truth
- ADR-0003: POS App Boundary
- ADR-0004: Item Pricing Scope
- Phase 5 Rollout Runbook: `docs/implementation/PHASE5-ROLLOUT-RUNBOOK.md`
- Phase 5 Go-Live Checklist: `docs/checklists/m8-phase5-rollout-checklist.md`

---

*Last Updated: 2026-03-12 (Phase 5 updated with runbook + checklist)*
*Owner: Backend Team*
