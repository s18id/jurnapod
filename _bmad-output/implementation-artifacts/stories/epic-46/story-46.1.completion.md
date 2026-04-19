# Story 46.1 Completion Notes

## Implementation Summary

### Scope Completed
- ✅ Supplier CRUD (create, read, update, soft-delete)
- ✅ Supplier contacts CRUD (nested under suppliers)
- ✅ Supplier currency and credit_limit storage (DECIMAL(19,4))
- ✅ Supplier payment_terms_days storage
- ✅ Tenant isolation (company_id enforcement on all queries)
- ✅ ACL enforcement (purchasing.suppliers resource with READ/CREATE/UPDATE/DELETE)

### P2 Fixes Applied (Post-Review)

#### Fix 1: Stronger Tenant Isolation Test
**Finding:** Weak tenant isolation test — only used fake IDs (999999) instead of true cross-company validation.

**Fix:** Rewrote `suppliers-tenant-isolation.test.ts` to create true cross-company scenarios:
- Creates Company B with OWNER user and gets valid access token
- Creates a real supplier in Company B using Company B's token
- Company A attempts to GET/PATCH/DELETE Company B's supplier
- Verifies Company A gets 404 (NOT_FOUND) not 403 — proving tenant isolation works

**Files Changed:**
- `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts` - Complete rewrite with real cross-company tests

#### Fix 2: Race Condition in Primary Contact Toggle
**Finding:** Concurrent updates to supplier contacts could leave multiple primary contacts because the "unset other primary" and "insert/update contact" operations were not atomic.

**Fix:** Wrapped both operations in a database transaction in both POST and PATCH routes:
- `POST /purchasing/suppliers/:supplierId/contacts` - now uses `db.transaction().execute()`
- `PATCH /purchasing/suppliers/:supplierId/contacts/:id` - now uses `db.transaction().execute()`

**Files Changed:**
- `apps/api/src/routes/purchasing/supplier-contacts.ts` - POST and PATCH routes now use transactions for atomic primary contact toggle

#### Fix 3: ACL Migration Coverage Gap
**Finding:** Migration 0168 only seeded ACL for companies that already had `platform.outlets` module_roles entries. Companies without outlets (or created after migration without going through bootstrap) could be missing `purchasing.suppliers` ACL.

**Fix:** Created migration 0169 that directly seeds ACL for ALL companies via CROSS JOIN with companies and roles tables:
- Uses `INSERT IGNORE` for idempotency
- Queries companies table directly, not dependent on existing module_roles
- Ensures all companies (regardless of outlet configuration) receive `purchasing.suppliers` ACL entries

**Files Changed:**
- `packages/db/migrations/0169_acl_purchasing_suppliers_all_companies.sql` - New migration for universal ACL seeding

### Files Created

| File | Description |
|------|-------------|
| `packages/db/migrations/0166_suppliers.sql` | Create suppliers table |
| `packages/db/migrations/0167_supplier_contacts.sql` | Create supplier_contacts table |
| `packages/db/migrations/0168_acl_purchasing_suppliers.sql` | Add purchasing.suppliers ACL entries |
| `packages/db/migrations/0169_acl_purchasing_suppliers_all_companies.sql` | Seed ACL for ALL companies (P2 fix) |
| `packages/shared/src/schemas/purchasing.ts` | Zod schemas for supplier types |
| `apps/api/src/routes/purchasing/suppliers.ts` | Supplier CRUD routes |
| `apps/api/src/routes/purchasing/supplier-contacts.ts` | Supplier contact routes |
| `apps/api/src/routes/purchasing/index.ts` | Route aggregator |
| `apps/api/__test__/integration/purchasing/suppliers.test.ts` | Supplier CRUD integration tests |
| `apps/api/__test__/integration/purchasing/supplier-contacts.test.ts` | Contact CRUD integration tests |
| `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts` | Tenant isolation tests (P2 fixed) |

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modified | Added Suppliers and SupplierContacts types |
| `packages/shared/src/index.ts` | Modified | Export purchasing schemas |
| `packages/shared/src/constants/modules.ts` | Modified | Added purchasing to MODULE_CODES and FEATURE_MODULE_CODES |
| `packages/shared/src/schemas/modules.ts` | Modified | Added purchasing to ModuleConfigSchemaMap |
| `packages/shared/src/constants/roles.defaults.json` | Modified | Added purchasing.suppliers permissions for all roles |
| `apps/api/src/app.ts` | Modified | Registered /api/purchasing routes |
| `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts` | Modified | Stronger cross-company tests (P2 fix) |
| `apps/api/src/routes/purchasing/supplier-contacts.ts` | Modified | Transactional primary contact toggle (P2 fix) |

### Migrations Applied
```
applied 0166_suppliers.sql
applied 0167_supplier_contacts.sql
applied 0168_acl_purchasing_suppliers.sql
applied 0169_acl_purchasing_suppliers_all_companies.sql (P2 fix)
```

### Validation Results
- ✅ `npm run build -w @jurnapod/shared` - PASSED
- ✅ `npm run build -w @jurnapod/db` - PASSED
- ✅ `npm run build -w @jurnapod/api` - PASSED
- ✅ `npm run typecheck -w @jurnapod/api` - PASSED
- ✅ `npm run db:migrate -w @jurnapod/db` - PASSED (4 migrations applied)
- ✅ ACL seeded for multiple companies (verified via direct DB query)
- ⚠️ Integration tests - SKIPPED (require running server)

### Database Verification
- `suppliers` table created with correct schema
- `supplier_contacts` table created with correct schema
- FK constraint on `suppliers.company_id` → `companies.id` verified
- FK constraint on `supplier_contacts.supplier_id` → `suppliers.id` verified
- ACL entries created: Multiple rows in `module_roles` for `purchasing.suppliers`
- Migration 0169 applied and verified:
  ```sql
  SELECT company_id, role_id, module, resource, permission_mask
  FROM module_roles WHERE module='purchasing' AND resource='suppliers'
  -- Shows ACL entries for companies 1, 4, 5, 6, ... with correct permission masks
  ```

### Acceptance Criteria Evidence

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Supplier CRUD with purchasing.suppliers CREATE permission | ✅ Implemented |
| AC2 | Supplier contacts linked by supplier_id, returned on fetch | ✅ Implemented |
| AC3 | credit_limit stored in DECIMAL(19,4), currency on supplier | ✅ Implemented |
| AC4 | payment_terms_days stored on supplier | ✅ Implemented |
| AC5 | 403 Forbidden without purchasing.suppliers CREATE | ✅ ACL enforced |
| AC6 | Tenant isolation - only company suppliers returned | ✅ company_id enforced + stronger cross-company test (P2 fixed) |

### Scope Constraints Respected
- ✅ Credit utilization/enforcement deferred to Story 46.5
- ✅ Supplier foundation only (no AP invoices, no payments)
- ✅ purchasing.suppliers resource with module.resource ACL format
