# Story 44.5 Completion Notes — Credit Note Customer Flow

**Story:** 44.5 — Credit Note Customer Flow  
**Epic:** Epic 44 — AR Customer Management & Invoicing Completion  
**Status:** ✅ DONE  
**Completed:** 2026-04-18

---

## Acceptance Criteria Evidence

### AC1: `sales_credit_notes.customer_id` migration ✅
- Added migration to introduce nullable `customer_id`, index, and FK guard-safe path.

### AC2: Inherit customer from source invoice ✅
- Credit note create path now resolves source invoice customer linkage consistently.

### AC3: Shared schemas/types aligned ✅
- `customer_id` support included across create/update/detail request/response contracts.

### AC4: ACL + same-company validation ✅
- Assignment/update guarded by `platform.customers.READ` when `customer_id` is set.
- Same-company existence checks enforced.
- OpenAPI and non-OpenAPI route parity preserved.

### AC5: Integration tests ✅
- Customer-flow suite covers inheritance, manual assignment, update/clear, ACL denial, and invalid references.

---

## Key Defect Fixes during completion

- Fixed MariaDB SQL ordering issue in credit-note lookup lock query (`LIMIT 1` / `FOR UPDATE`).
- Stabilized transactional behavior under parallel integration runs by using retry-backed transactions in:
  - sales module transaction wrapper
  - document numbering transaction paths

---

## Files Implemented

- `packages/db/migrations/0166_customer_id_to_sales_credit_notes.sql`
- `packages/shared/src/schemas/sales.ts`
- `packages/modules/sales/src/types/credit-notes.ts`
- `packages/modules/sales/src/services/credit-note-service.ts`
- `packages/modules/sales/src/services/sales-db.ts`
- `apps/api/src/lib/modules-sales/sales-db.ts`
- `apps/api/src/lib/credit-notes/credit-note-service.ts`
- `apps/api/src/routes/sales/credit-notes.ts`
- `apps/api/__test__/integration/sales/credit-notes-customer.test.ts`

---

## Validation Evidence

```bash
npm run build -w @jurnapod/modules-sales
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm test -w @jurnapod/api -- --run --testNamePattern="credit-notes.customer"
```

Observed in final hardening run:
- Full API suite: **142/142 test files passed**, **1038 passed**, **3 skipped**, **0 failed**.
