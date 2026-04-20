# Story 47.5 — Completion Report

## Story
**Period Close Guardrails for AP** — As a finance manager, I want guardrails that prevent accidental AP transactions in closed periods, so that financial reporting integrity is maintained and period‑close locks are enforced.

**Epic:** 47 (AP Reconciliation & Period Close Controls)
**Status:** Done
**Completed:** 2026-04-20

---

## What Was Built

### Guardrail Service: `apps/api/src/lib/accounting/ap-period-close-guardrail.ts`
- **Decision API:** `checkPeriodCloseGuardrail(companyId, transactionDate)` → `GuardrailDecision` (allow / block / override-required)
- **Primary lookup:** `fiscal_periods` (company_id + inclusive date window)
- **Fallback lookup:** `fiscal_years` (company_id + inclusive date window)
- **Strictness:** Read from `accounting.ap_period_close_guardrail` setting; defaults to "strict"
- **Override evaluator:** `evaluateOverrideAccess(auth, overrideReason, decision)` — unified reason validation + MANAGE permission check
- **Audit insert:** `insertPeriodCloseOverride(trx, params)` — atomic insert inside AP mutation transaction
- **Error types:** `PeriodCloseError`, `PeriodOverrideReasonInvalidError` (400), `PeriodOverrideForbiddenError` (403), `PeriodOverrideInvalidPeriodIdError` (400)

### Route Integrations
- `purchase-invoices.ts`: guardrail on create/post/void, override_reason field accepted on all three operations
- `ap-payments.ts`: guardrail on create/post/void, override_reason field accepted on all three operations
- `purchase-credits.ts`: guardrail on create/apply/void, override_reason field accepted on all three operations
- All use `checkPeriodCloseGuardrail` before business logic; override path writes `period_close_overrides` in the same DB transaction

### Migration: `packages/db/migrations/0189_period_close_overrides.sql`
- `period_close_overrides` table: company_id, user_id, transaction_type, transaction_id, period_id, reason, overridden_at
- Indexes on (company_id), (period_id), (overridden_at), (transaction_type, transaction_id), (company_id, period_id)
- FK constraints to companies, users, fiscal_periods
- Immutability triggers (UPDATE/DELETE blocked) — rewritten without DELIMITER for mysql2 multipleStatements runner compatibility

### ACL Decision Lock
- Override requires `accounting.fiscal_years` + MANAGE (bit 32)
- SUPER_ADMIN bypasses normal permission checks
- Override reason minimum 10 characters enforced in service layer

---

## Key Design Decisions

### 1. Override ACL Uses `accounting.fiscal_years` (Not `accounting.periods`)
AP period-close is ultimately about fiscal-year integrity. `accounting.periods` was considered but `accounting.fiscal_years` with MANAGE is the approved decision lock per Epic 47 coordination. The service calls `checkUserAccess({ module: "accounting", resource: "fiscal_years", permission: "manage" })`.

### 2. Structured Error Hierarchy (400/403/409 + 2xx)
- `PeriodOverrideReasonInvalidError` → route maps to **400** (bad request)
- `PeriodOverrideForbiddenError` → route maps to **403** (forbidden)
- `PeriodCloseError` with block → route maps to **409** (conflict)
- Successful override → **201/200** with audit row persisted

### 3. Atomic Override Insert in Same DB Transaction
Override audit row is written in the same transaction as the AP mutation (invoice/payment/credit). If the audit insert fails, the entire transaction rolls back — no silent data loss.

### 4. Immutability Triggers Without DELIMITER
Migration 0189 triggers were rewritten after discovering mysql2 runner does not support `DELIMITER` directives. Strategy: `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` in a single multi-statement batch. mysql2 parses the semicolons between statements and sends them separately to the server.

### 5. Unified Override Access Evaluator
`evaluateOverrideAccess` combines reason validation AND MANAGE permission check into one call, returning `{ allowed, error, message }`. This is the single entry point for override decisions in the service layer. Fixes earlier broken implementation that used a fake Request object.

---

## Test Results

```
__test__/integration/accounting/period-close-guardrail.test.ts
  ✓ 16 tests passed (2.64s)

  a) Closed period block path (strict mode)
     ✓ blocks AP invoice create with 409 when date falls in CLOSED period (Jun 2025)
     ✓ blocks AP payment create with 409 when date falls in CLOSED period (Jun 2025)
     ✓ blocks AP credit create with 409 when date falls in CLOSED period (Jun 2025)

  b) Open period — operations succeed
     ✓ creates AP invoice successfully in OPEN period
     ✓ creates AP payment successfully in OPEN period
     ✓ creates AP credit successfully in OPEN period

  c) Override success + audit row persisted
     ✓ succeeds with 201 when MANAGE + valid override_reason for closed period invoice
     ✓ rejects override_reason shorter than 10 characters with 400

  d) Insufficient MANAGE permission → 403
     ✓ returns 403 when user lacks MANAGE on accounting.fiscal_years (invoice)
     ✓ returns 403 when user lacks MANAGE on accounting.fiscal_years (payment)
     ✓ returns 403 when user lacks MANAGE on accounting.fiscal_years (credit)

  e) Correction flow — void in closed period
     ✓ void in closed period with MANAGE + override_reason succeeds (200)
     ✓ void in open period succeeds without override_reason (200)

  f) Tenant isolation
     ✓ returns 404 when other company tries to void another company's invoice
     ✓ same date is OPEN for company B when B has no closed period in that range
     ✓ other company cannot read company A's invoices (tenant isolation)
```

**Strict test evidence:** 16/16 pass, 2.64s execution time.

Typecheck: `@jurnapod/api` — pass
Shared build: `@jurnapod/shared` — pass

---

## Review Gate

**Adversarial review conducted 2026-04-20 (delegated reviewer session) — no unresolved P0/P1 blockers in scope.**

P2 follow-ups documented in story-47.5.md review findings section (non-blocking).

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/api/src/lib/accounting/ap-period-close-guardrail.ts` | Created |
| `packages/db/migrations/0189_period_close_overrides.sql` | Created |
| `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` | Created |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Modified (guardrail integration) |
| `apps/api/src/routes/purchasing/ap-payments.ts` | Modified (guardrail integration) |
| `apps/api/src/routes/purchasing/purchase-credits.ts` | Modified (guardrail integration) |
| `apps/api/src/lib/test-fixtures.ts` | Modified (fiscal period fixture company_id alignment + setting helper) |
| `apps/api/__test__/fixtures/index.ts` | Modified (export new setting helper) |
| `apps/api/__test__/helpers/setup.ts` | Modified (RWLock helper functions for integration tests) |
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | Modified (service-level guardrail + override audit wiring) |
| `apps/api/src/lib/purchasing/ap-payment.ts` | Modified (service-level guardrail + override audit wiring) |
| `apps/api/src/lib/purchasing/purchase-credit.ts` | Modified (service-level guardrail + override audit wiring) |
| `packages/modules/platform/src/companies/constants/settings-definitions.ts` | Modified (guardrail strictness setting) |
| `packages/shared/src/schemas/settings.ts` | Modified (guardrail strictness schema) |
| `packages/shared/src/schemas/purchasing.ts` | Modified (override_reason fields on AP create payloads) |
| `packages/db/src/kysely/schema.ts` | Modified (period_close_overrides typing) |

---

## Remaining Epic 47 Stories

```
47-5-period-close-guardrails-ap:                          done
47-6-reconciliation-snapshot-audit-trail:                backlog
```
