# Story 44.1 Completion Notes — Customer Master CRUD

**Story:** 44.1 — Customer Master CRUD
**Epic:** Epic 44 — AR Customer Management & Invoicing Completion
**Status:** ✅ DONE
**Completed:** 2026-04-18

---

## Acceptance Criteria Evidence

### AC1: customers table migration ✅
- Migrations 0160–0164 applied: `customers` table created with all required columns.
- Unique constraint on `(company_id, code)` where `deleted_at IS NULL` enforced.
- Foreign keys to `companies(id)` and `outlets(id)` established.

### AC2: ACL resource platform.customers ✅
- Migration 0161 adds `platform.customers` ACL entries.
- Permission matrix applied: SUPER_ADMIN/OWNER (63), COMPANY_ADMIN (31), ADMIN/ACCOUNTANT (1), CASHIER (0).

### AC3: CRUD endpoints ✅
- Route `apps/api/src/routes/platform/customers.ts` implements GET list, GET /:id, POST, PATCH /:id, DELETE /:id.
- All endpoints enforce `platform.customers` resource-level ACL.
- Company_id scope enforced — users cannot access other companies' customers.

### AC4: Code uniqueness and soft delete ✅
- Soft delete sets `deleted_at` timestamp.
- Unique index prevents code reuse for active customers.
- Deleted customer codes remain unique (constraint satisfied via `WHERE deleted_at IS NULL`).

### AC5: Validation rules ✅
- BUSINESS type requires `company_name` (validation enforced in service layer).
- PERSON type allows NULL `company_name`.

### AC6: Integration tests ✅
- Customer CRUD tests pass including ACL enforcement and validation.

---

## Files Implemented

| File | Action |
|------|--------|
| `packages/db/migrations/0160_customers.sql` | Created |
| `packages/db/migrations/0161_acl_platform_customers.sql` | Created |
| `packages/db/migrations/0162_customers_type_integer.sql` | Created |
| `packages/db/migrations/0163_fix_owner_outlet_id_null.sql` | Created |
| `packages/modules/platform/src/customers/services/customer-service.ts` | Created |
| `packages/modules/platform/src/customers/interfaces/customer-repository.ts` | Created |
| `packages/modules/platform/src/customers/types/customers.ts` | Created |
| `packages/shared/src/schemas/customers.ts` | Created |
| `packages/shared/src/constants/customers.ts` | Created |
| `apps/api/src/routes/platform/customers.ts` | Created |

---

## Validation Evidence

```bash
npm run db:migrate -w @jurnapod/db
npm run build -w @jurnapod/modules-platform
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm test -w @jurnapod/api -- --run --testNamePattern="customers"
```

Observed: Full API suite **1038 passed**, **3 skipped**, **0 failed**.
