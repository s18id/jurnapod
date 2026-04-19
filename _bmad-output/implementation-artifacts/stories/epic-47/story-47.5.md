# Story 47.5: Period Close Guardrails for AP

Status: backlog

## Story

As a **finance manager**,  
I want guardrails that prevent accidental AP transactions in closed periods,  
So that financial reporting integrity is maintained and period‑close locks are enforced.

---

## Context

Period close is a critical control. This story implements guardrails that block AP transactions (purchase invoices, payments, credit notes) from being posted into a closed period. The default behavior is **block**; an explicit, audited override path is available for high‑privilege users (e.g., CFO) with mandatory reason logging.

**Dependencies:** Epic 32 (Financial Period Close) provides the period‑close foundation (fiscal years, period status). This story adds AP‑specific enforcement.

---

## Acceptance Criteria

**AC1: Period‑Close Status Check**
**Given** a user attempts to create or update an AP transaction (invoice, payment, credit note),
**When** the transaction’s date (`invoice_date`, `payment_date`, `credit_note_date`) falls within a closed period,
**Then** the system blocks the operation and returns a 409 Conflict error with message “Period is closed for AP transactions”.

**AC2: Closed Period Definition**
**Given** a company’s fiscal year and periods,
**When** a period is marked as `closed` (status = CLOSED) in the period‑close workspace (Epic 32),
**Then** that period is considered closed for AP transactions,
**And** the closure applies to all dates within that period (inclusive of start and end dates).

**AC3: High‑Privilege Override**
**Given** a user with `accounting.periods` MANAGE permission (e.g., CFO),
**When** they attempt to post an AP transaction into a closed period,
**Then** they are presented with an override option requiring:
- A mandatory reason (free‑text)
- An audit log entry recording the override (user, timestamp, transaction, reason)
- **And** the transaction is allowed only after the override is confirmed.

**AC4: Override Audit Trail**
**Given** an override is used,
**When** the transaction is posted,
**Then** a record is created in `period_close_overrides` table with:
- `company_id`, `user_id`, `transaction_type`, `transaction_id`, `period_id`, `reason`, `overridden_at`
- **And** the record is immutable (no updates/deletes).

**AC5: API Enforcement**
**Given** the AP transaction endpoints (from Epic 46),
**When** a request arrives,
**Then** the period‑close guardrail check runs before any business logic,
**And** blocks or allows based on period status and user permissions.

**AC6: Bulk Operations**
**Given** a bulk import or batch of AP transactions,
**When** any transaction in the batch falls into a closed period,
**Then** the entire batch is rejected (fail‑fast),
**And** the error indicates which transaction(s) violated the guardrail.

**AC7: Configuration of Guardrail Strictness**
**Given** a company admin,
**When** they configure period‑close guardrails,
**Then** they can choose between:
- **Strict:** block all AP transactions in closed periods (default)
- **Override allowed:** enable the high‑privilege override path (requires MANAGE permission)
- **And** the setting is stored per company.

**AC8: Guardrail Bypass for Corrections**
**Given** a transaction already posted in a closed period (via override),
**When** a correction (void, refund) is needed,
**Then** the correction follows the same guardrail rules (i.e., also requires override if period remains closed).

---

## Tasks / Subtasks

- [ ] Design `period_close_overrides` table (company_id, user_id, transaction_type, transaction_id, period_id, reason, overridden_at)
- [ ] Create migration for period_close_overrides table
- [ ] Implement period‑close check service that queries period status for a given date
- [ ] Integrate guardrail check into Epic 46 AP transaction endpoints (purchase invoices, payments, credit notes)
- [ ] Implement override logic for users with MANAGE permission
- [ ] Add company setting for guardrail strictness (default strict)
- [ ] Write integration tests for blocking behavior
- [ ] Write integration tests for override path with audit trail
- [ ] Write integration tests for bulk operation rejection
- [ ] Update OpenAPI spec

---

### Review Findings

- [ ] *Review placeholder – findings will be populated during implementation review*

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/db/migrations/0XXX_period_close_overrides.sql` | period_close_overrides table migration |
| `packages/shared/src/schemas/period-close.ts` | Zod schemas for override types |
| `packages/modules/accounting/src/services/period-close-guardrail-service.ts` | Guardrail check and override logic |
| `apps/api/src/middleware/period-close-guardrail.ts` | Optional middleware for AP routes |
| `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add PeriodCloseOverrides type |
| `packages/shared/src/index.ts` | Modify | Export period‑close guardrail schemas |
| `packages/shared/src/constants/modules.ts` | Modify | Add `accounting.periods` MANAGE permission (if not already present) |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Modify | Add guardrail check in POST/PUT |
| `apps/api/src/routes/purchasing/ap-payments.ts` | Modify | Add guardrail check in POST/PUT |
| `apps/api/src/routes/purchasing/supplier-credit-notes.ts` | Modify | Add guardrail check in POST/PUT |
| `packages/modules/platform/src/services/company-service.ts` | Modify | Add guardrail strictness setting |

---

## Validation Evidence

```bash
# Attempt to post invoice in closed period (should block)
curl -X POST /api/purchasing/purchase-invoices \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplier_id": 123, "invoice_date": "2025-03-15", ...}'
# Expected: 409 Conflict with "Period is closed for AP transactions"

# Same attempt with MANAGE permission (override prompted)
curl -X POST /api/purchasing/purchase-invoices \
  -H "Authorization: Bearer $CFO_TOKEN" \
  -d '{"supplier_id": 123, "invoice_date": "2025-03-15", ..., "override_reason": "Supplier correction required for audit"}'
# Expected: 201 Created (override logged)

# Query overrides audit trail
curl "/api/accounting/period-close/overrides?period_id=5" \
  -H "Authorization: Bearer $CFO_TOKEN"
```

---

## Dev Notes

- Period status is determined by joining the transaction date with `fiscal_periods` table (Epic 32). Use `company.timezone` to interpret the date as local.
- The guardrail check should be a reusable service that can be called from multiple endpoints (DRY).
- Override reason is required and should be logged in the audit trail; consider minimum length (e.g., 10 characters) to prevent “asdf” entries.
- The `period_close_overrides` table is append‑only; no updates or deletes allowed.
- For bulk operations, validate all dates before beginning any writes; if any fail, roll back and return detailed error.
- The guardrail strictness setting can be stored in `company_settings` with key `ap_period_close_guardrail` (values: strict, override_allowed).
- Consider adding a warning for transactions in the *current* open period (no block, just informational).

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `as any` casts added without justification
- [ ] New status columns use `TINYINT` (per Epic 47 constraint)
- [ ] All new tables have proper indexes on `company_id`, `period_id`, `overridden_at`
- [ ] Guardrail check is fast (cached period status lookup)
- [ ] Override audit trail is immutable and includes all required context
- [ ] Error messages are clear and actionable
- [ ] Bulk validation is atomic (no partial writes)