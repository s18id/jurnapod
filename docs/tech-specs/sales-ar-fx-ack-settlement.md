# Tech Spec: Sales AR FX Acknowledgment Settlement

**Status:** Approved (Locked)
**Date:** 2026-04-23
**Owner:** bmad-quick-spec workflow

---

## 1. Policy (Locked)

> **LOCKED.** This section is non-negotiable once approved.

| Rule | Requirement |
|------|-------------|
| **Marker mandatory** | Any non-zero `payment_delta_idr` **MUST** have an explicit `fx_acknowledged_at` timestamp before payment can be POSTED. No exceptions. |
| **No tolerance bypass** | Even a 1-cent delta requires FX acknowledgment. No rounding tolerance. |
| **Approver role** | Only `ACCOUNTANT` (32+ READ bits on `sales`) or higher (`ADMIN`, `COMPANY_ADMIN`, `OWNER`, `SUPER_ADMIN`) can set `fx_acknowledged_at`. |

---

## 2. Domain Model

### 2.1 What "FX Acknowledgment" Means

When a customer payment settles an AR invoice in a foreign currency:

1. The system calculates `payment_delta_idr = invoice_amount_idr - payment_amount_idr` (the IDR value difference due to exchange rate movement)
2. If `payment_delta_idr != 0`, the payment creates an FX gain/loss exposure
3. The `ACCOUNTANT+` user must explicitly acknowledge this delta before it is posted — this is the **FX acknowledgment**
4. Once acknowledged, `fx_acknowledged_at` is stamped and the payment posting can proceed

### 2.2 Existing Schema (sales_payments)

```
payment_delta_idr    — DECIMAL(19,4), nullable, derived at payment creation
shortfall_settled_*  — existing loss-settlement fields (not FX-related)
```

### 2.3 New Fields to Add

```sql
fx_acknowledged_at     DATETIME NULL
fx_acknowledged_by    INT UNSIGNED NULL
```

---

## 3. API Contract

### 3.1 Extend Payment Post Request

```typescript
// Request: POST /sales/payments/:id/post
const PostSalesPaymentFxAckRequestSchema = z.object({
  // existing:
  settle_shortfall_as_loss: z.boolean().optional(),
  shortfall_reason: z.string().max(500).optional(),
  // new — explicit FX ack (marker required when delta != 0):
  fx_ack: z.object({
    acknowledged_at: z.string().datetime(),
  }).optional(),
});

// Validation:
//   If payment.payment_delta_idr != 0 AND fx_ack is absent/missing → 422 + error
//   If payment_delta_idr == 0 AND fx_ack is present → allow (no-op, ignore ack)
//   If fx_ack.acknowledged_at is in the future → 422
```

### 3.2 Payment Response (read after ack)

```typescript
// Extend existing SalesPaymentSchema
const SalesPaymentSchema = z.object({
  // ... existing fields ...
  fx_acknowledged_at: z.string().datetime().nullable().optional(),
  fx_acknowledged_by: NumericIdSchema.nullable().optional(),
  // derived:
  fx_delta: MoneySchema.optional(), // payment_delta_idr
  fx_ack_required: z.boolean().optional(), // true when delta != 0 && !fx_acknowledged_at
});
```

### 3.3 New Endpoint: Acknowledge FX (standalone, pre-post)

```
PATCH /sales/payments/:id/acknowledge-fx
```

**Purpose:** Allow ACCOUNTANT+ to ack delta without immediately posting.

```typescript
// Request
const AcknowledgeFxRequestSchema = z.object({
  acknowledged_at: z.string().datetime(),
});

// Response — updated payment
SalesPaymentResponseSchema

// Authorization: requireAccess({ module: 'sales', resource: 'payments', permission: 'UPDATE' })
//                AND role has ACCOUNTANT+ bits (READ(1) + ANALYZE(16) = 17 minimum on sales module)
// Validation same as fx_ack in post request
```

---

## 4. Persistence

### 4.1 New Columns (Migration 0XXX)

```sql
ALTER TABLE sales_payments
  ADD COLUMN fx_acknowledged_at DATETIME NULL AFTER shortfall_settled_at,
  ADD COLUMN fx_acknowledged_by INT UNSIGNED NULL AFTER fx_acknowledged_at;

-- FK constraint:
ALTER TABLE sales_payments
  ADD CONSTRAINT fk_sales_payments_fx_ack_user
  FOREIGN KEY (fx_acknowledged_by) REFERENCES users(id);
```

### 4.2 Idempotent Migration (MySQL/MariaDB)

```sql
-- 0XXX_add_sales_payments_fx_ack.sql
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sales_payments'
    AND column_name = 'fx_acknowledged_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sales_payments
    ADD COLUMN fx_acknowledged_at DATETIME NULL AFTER shortfall_settled_at,
    ADD COLUMN fx_acknowledged_by INT UNSIGNED NULL AFTER fx_acknowledged_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

---

## 5. Validation Rules

| Condition | Result |
|-----------|--------|
| `payment_delta_idr != 0` AND no `fx_acknowledged_at` | `POST /payments/:id/post` → **422** `fx_delta_requires_acknowledgment` |
| `payment_delta_idr != 0` AND `fx_ack.acknowledged_at > NOW()` | `PATCH /payments/:id/acknowledge-fx` → **422** `fx_ack_cannot_be_future_dated` |
| `payment_delta_idr == 0` | FX ack fields ignored; posting proceeds normally |
| Acknowledge call by non-ACCOUNTANT+ role | **403** |
| Acknowledge call by unauthenticated user | **401** |

---

## 6. Authorization

```
PATCH /sales/payments/:id/acknowledge-fx
  → requireAccess({ module: 'sales', resource: 'payments', permission: 'UPDATE' })
  → AND actor.role has >= 17 bits (ACCOUNTANT or higher) on 'sales' module

POST /sales/payments/:id/post  (when delta != 0)
  → requireAccess({ module: 'sales', resource: 'payments', permission: 'UPDATE' })
  → existing posting guards apply (DRAFT status, etc.)
  → Additional check: fx_acknowledged_at must be set
```

---

## 7. Posting Behavior Matrix

| `payment_delta_idr` | `fx_acknowledged_at` | Post Result |
|---------------------|----------------------|-------------|
| `== 0` | `null` or set | **200** — proceeds; FX ack no-op |
| `!= 0` | `null` | **422** — `fx_delta_requires_acknowledgment` |
| `!= 0` | set | **200** — proceeds; delta auto-posted to FX journal |

### 7.1 Journal Posting for Delta (modules-accounting)

When posting with a non-zero delta that is acknowledged:

- Debit/Credit to `fx_gain_loss` account (tenant-configured, default via `company_modules.config_json`)
- Amount = `ABS(payment_delta_idr)`
- `description`: `FX settlement for payment {payment_no}, delta IDR {delta}`
- Source reference: `sales_payments.id`
- All within the same DB transaction as the payment status → POSTED

---

## 8. Migration Approach (MySQL/MariaDB Idempotent)

```
1.  Create migration: migrations/0XXX_add_sales_payments_fx_ack.sql
      - Use information_schema check for column existence
      - Guard with IF to make idempotent
      - FK for fx_acknowledged_by references users(id) with company_id scoping not required (users is global)

2.  Run migration:
      npm run db:migrate -w @jurnapod/db

3.  Regenerate Kysely types:
      npm run db:generate:schema -w @jurnapod/db
      (regenerates src/kysely/schema.ts with new columns)

4.  Update SalesPayment type in packages/modules/sales/src/types/payments.ts

5.  Update SalesPaymentSchema in packages/shared/src/schemas/sales.ts

6.  Verify: run migration twice → second run must be no-op
```

---

## 9. Tests Required

### 9.1 Unit Tests

| File | What to Test |
|------|--------------|
| `__test__/unit/sales/payment-fx-ack.test.ts` | FX ack validation logic — delta calc, future-date rejection, zero-delta no-op |

### 9.2 Integration Tests

| File | What to Test |
|------|--------------|
| `__test__/integration/sales/payment-fx-ack.test.ts` | Full flow: create payment with delta → fail post → ack → post success |
| `__test__/integration/sales/payment-fx-ack-auth.test.ts` | 403 when CASHIER attempts FX ack |
| `__test__/integration/sales/payment-fx-ack-zero-delta.test.ts` | Zero delta: post succeeds without FX ack |

### 9.3 Test Data Fixtures

- Use `createTestUser()` and `assignUserGlobalRole()` from `test-fixtures.ts`
- Custom test role for CASHIER test (low-privilege, not system role)

---

## 10. File-Level Implementation Plan

### Phase 1 — Schema & Types
| File | Action |
|------|--------|
| `packages/db/migrations/0XXX_add_sales_payments_fx_ack.sql` | New migration |
| `packages/db/src/kysely/schema.ts` | Regenerated |
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

### Phase 5 — Tests
| File | Action |
|------|--------|
| `__test__/unit/sales/payment-fx-ack.test.ts` | Unit tests |
| `__test__/integration/sales/payment-fx-ack.test.ts` | Integration tests |
| `__test__/integration/sales/payment-fx-ack-auth.test.ts` | Auth tests |
| `__test__/integration/sales/payment-fx-ack-zero-delta.test.ts` | Zero-delta edge case |

---

## 11. Risk Table

| ID | Severity | Risk | Mitigation |
|----|----------|------|------------|
| R1 | **P0** | Un-acknowledged delta bypasses posting guard — duplicate FX exposure posted silently | Guard in `payment-posting-hook.ts` must check `fx_acknowledged_at` before journal posting; integration test required |
| R2 | **P0** | `ACCOUNTANT` role bits misconfigured — wrong users can ack | Test with CASHIER role as negative case; seed verification |
| R3 | **P1** | Future-dated ack allowed — clock manipulation to bypass | Validation rejects `acknowledged_at > NOW()` |
| R4 | **P1** | Zero-delta payment fails when it should succeed (over-eager guard) | Explicit zero-check: `delta == 0` → skip ack check entirely |
| R5 | **P1** | Migration races on concurrent deploys (MariaDB non-atomic DDL) | Idempotent with `information_schema` check |
| R6 | **P2** | `fx_acknowledged_by` FK cascade delete if user deleted | Soft-delete policy on users; FK is optional nullable |
| R7 | **P2** | Missing `fx_acknowledged_at` in payment response — breaks UI | Schema update + response serialization |
