# Story 50.5: Sales AR FX Acknowledgment — Implementation

> **HARD GATE:** Implementation of this story MUST NOT begin until:
> 1. Tech spec `docs/tech-specs/sales-ar-fx-ack-settlement.md` is approved and locked
> 2. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** backlog

---

## Story Context

**Epic:** Epic 50 — Ledger Correctness Hardening
**Owner:** @bmad-dev
**Type:** New feature implementation
**Module:** `modules-sales`, `modules-accounting`
**Sprint:** 50 (2026-04-27 to 2026-05-08)

---

## Problem Statement

When a customer payment settles an AR invoice in a foreign currency, `payment_delta_idr` reflects the IDR value difference due to exchange rate movement. A non-zero delta creates an FX gain/loss exposure that requires explicit `ACCOUNTANT+` acknowledgment before the payment can be posted. Without this guard, unacknowledged FX deltas can be posted silently, creating P0 ledger exposure.

---

## Tech Spec Reference

`docs/tech-specs/sales-ar-fx-ack-settlement.md` — **LOCKED** once approved. All implementation MUST conform to this spec.

---

## E49-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for new feature implementation because new code must be deterministic from the start.

**When required:** This story adds new DB columns, API routes, service methods, and posting hooks. Second-pass review is **MANDATORY** to catch non-deterministic patterns before they enter the codebase.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] Migration idempotent (information_schema check, rerunnable)
- [ ] New columns `fx_acknowledged_at` and `fx_acknowledged_by` added correctly
- [ ] `PATCH /sales/payments/:id/acknowledge-fx` route implemented with ACCOUNTANT+ auth guard
- [ ] `POST /sales/payments/:id/post` updated with FX delta guard
- [ ] Zero-delta path (`payment_delta_idr == 0`) verified: posting proceeds without FX ack
- [ ] Non-zero delta without ack: 422 `fx_delta_requires_acknowledgment` confirmed
- [ ] Future-dated ack: 422 `fx_ack_cannot_be_future_dated` confirmed
- [ ] CASHIER role attempting ack: 403 confirmed
- [ ] No `Date.now()` or `Math.random()` in fixture setup
- [ ] 3× consecutive green on unit and integration suites
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

### AC1: Reject Non-Zero Delta Without Explicit FX Marker

**Given** a `sales_payment` record with `payment_delta_idr != 0` and no `fx_acknowledged_at` set,
**When** `POST /sales/payments/:id/post` is called,
**Then** the request MUST be rejected with **422** and error code `fx_delta_requires_acknowledgment`.

> **RFC policy:** Any non-zero `payment_delta_idr` **MUST** have an explicit `fx_acknowledged_at` timestamp before payment can be POSTED. No exceptions.

### AC2: Allow Post With Explicit Marker and ACCOUNTANT+ Auth

**Given** a `sales_payment` record with `payment_delta_idr != 0` and `fx_acknowledged_at` already set,
**When** `POST /sales/payments/:id/post` is called by an authenticated user with `ACCOUNTANT+` role (≥17 bits on `sales` module),
**Then** the payment POST operation MUST proceed and the FX delta journal entry MUST be posted within the same DB transaction.

> **RFC policy:** Only `ACCOUNTANT` (32+ READ bits on `sales`) or higher (`ADMIN`, `COMPANY_ADMIN`, `OWNER`, `SUPER_ADMIN`) can set `fx_acknowledged_at`.

### AC3: Zero-Delta Path Posts Without Marker

**Given** a `sales_payment` record with `payment_delta_idr == 0`,
**When** `POST /sales/payments/:id/post` is called (with or without `fx_ack` in request body),
**Then** the payment MUST be posted successfully without requiring `fx_acknowledged_at` and without requiring ACCOUNTANT+ role.

> **RFC policy:** `payment_delta_idr == 0` → FX ack fields ignored; posting proceeds normally.

### AC4: Standalone FX Acknowledge Endpoint

**Given** a `sales_payment` record with `payment_delta_idr != 0` and no prior `fx_acknowledged_at`,
**When** `PATCH /sales/payments/:id/acknowledge-fx` is called with `fx_ack.acknowledged_at` by an `ACCOUNTANT+` user,
**Then** `fx_acknowledged_at` and `fx_acknowledged_by` MUST be set on the payment record.

> **RFC policy:** Standalone ack endpoint allows `ACCOUNTANT+` to acknowledge delta without immediately posting.

### AC5: Reject Future-Dated Acknowledgment

**Given** a `PATCH /sales/payments/:id/acknowledge-fx` request with `fx_ack.acknowledged_at` set to a future timestamp,
**Then** the request MUST be rejected with **422** and error code `fx_ack_cannot_be_future_dated`.

> **RFC policy:** `fx_ack.acknowledged_at > NOW()` → 422 `fx_ack_cannot_be_future_dated`.

### AC6: Role Authorization for FX Acknowledge

**Given** a `CASHIER`-role user attempting `PATCH /sales/payments/:id/acknowledge-fx`,
**Then** the request MUST be rejected with **403**.

> **RFC policy:** Only `ACCOUNTANT` (32+ READ bits on `sales`) or higher can set `fx_acknowledged_at`.

### AC7: Idempotent Database Migration

**Given** the migration `0XXX_add_sales_payments_fx_ack.sql`,
**When** the migration is run on a database that already has `fx_acknowledged_at` column,
**Then** the migration MUST be a no-op (second run must not fail).

> **RFC policy:** All migrations must be rerunnable/idempotent for MySQL/MariaDB compatibility.

### AC8: FX Delta Journal Posting

**Given** a `POST /sales/payments/:id/post` request with non-zero `payment_delta_idr` and valid `fx_acknowledged_at`,
**Then** the FX delta MUST be posted to the `fx_gain_loss` account (tenant-configured) with:
- Amount = `ABS(payment_delta_idr)`
- Description: `FX settlement for payment {payment_no}, delta IDR {delta}`
- Source reference: `sales_payments.id`
- All within the same DB transaction as payment status → `POSTED`

---

## Required Integration Test Scenarios

The following test scenarios MUST be implemented and passing before this story can be marked complete:

### Scenario 1: Non-Zero Delta Rejection

**Test file:** `__test__/integration/sales/payment-fx-ack.test.ts`
- Create payment with `payment_delta_idr != 0`
- Attempt POST without FX ack → expect 422 `fx_delta_requires_acknowledgment`
- Acknowledge FX delta via `PATCH /payments/:id/acknowledge-fx`
- Attempt POST again → expect 200 and payment posted

### Scenario 2: Zero-Delta No-Ack Required

**Test file:** `__test__/integration/sales/payment-fx-ack-zero-delta.test.ts`
- Create payment with `payment_delta_idr == 0`
- POST without `fx_ack` in request → expect 200
- POST with `fx_ack` in request (should be ignored) → expect 200

### Scenario 3: CASHIER Cannot Acknowledge

**Test file:** `__test__/integration/sales/payment-fx-ack-auth.test.ts`
- Create payment with `payment_delta_idr != 0`
- Attempt `PATCH /payments/:id/acknowledge-fx` as CASHIER → expect 403

### Scenario 4: Future-Dated Ack Rejected

**Test file:** `__test__/integration/sales/payment-fx-ack.test.ts`
- Create payment with `payment_delta_idr != 0`
- Attempt `PATCH /payments/:id/acknowledge-fx` with future `acknowledged_at` → expect 422 `fx_ack_cannot_be_future_dated`

### Scenario 5: FX Journal Entry Created

**Test file:** `__test__/integration/sales/payment-fx-ack.test.ts`
- Acknowledge and post payment with non-zero delta
- Verify FX journal entry created with correct amount, description, and source reference

---

## Implementation Phases

### Phase 1 — Schema & Types
| File | Action |
|------|--------|
| `packages/db/migrations/0XXX_add_sales_payments_fx_ack.sql` | New idempotent migration |
| `packages/db/src/kysely/schema.ts` | Regenerated after migration |
| `packages/shared/src/schemas/sales.ts` | Add `fx_acknowledged_at`, `fx_acknowledged_by` to schema |
| `packages/modules/sales/src/types/payments.ts` | Add fields to `SalesPayment` type |

### Phase 2 — Validation & Authorization
| File | Action |
|------|--------|
| `packages/shared/src/schemas/sales.ts` | Add `AcknowledgeFxRequestSchema` |
| `apps/api/src/lib/auth-guard.ts` | Ensure ACCOUNTANT+ bit check exists for sales |
| `apps/api/src/routes/sales/payments.ts` | Add `PATCH /:id/acknowledge-fx` route |

### Phase 3 — Service Layer
| File | Action |
|------|--------|
| `packages/modules/sales/src/services/payment-service.ts` | Add `acknowledgeFxDelta()` method |
| `packages/modules/sales/src/services/sales-db.ts` | Add `fx_acknowledged_at/by` to update queries |
| `apps/api/src/lib/modules-sales/sales-db.ts` | Add `fx_acknowledged_at/by` to payment queries/updates |

### Phase 4 — Posting Integration
| File | Action |
|------|--------|
| `apps/api/src/lib/modules-sales/payment-posting-hook.ts` | Check `fx_acknowledged_at` before allowing post when delta != 0 |
| `apps/api/src/lib/sales-posting.ts` | Add FX delta journal posting inside payment transaction |

---

## Exit Criteria

- All 8 ACs verified with evidence
- All 5 integration test scenarios passing
- Migration verified idempotent (run twice, second run no-op)
- `npm run build -w @jurnapod/modules-sales` passes
- `npm run typecheck -w @jurnapod/api` passes
- 3× consecutive green on all affected test suites
- Second-pass review sign-off from Charlie (Senior Dev) or designated reviewer