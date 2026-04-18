# Story 46.1: Supplier Master + Credit Limits

Status: backlog

## Story

As a **purchasing manager**,  
I want to manage supplier records with credit limits and currencies,  
So that I can track who I owe money to and enforce purchasing controls.

---

## Context

Epic 46 adds the purchasing module. Story 46.1 establishes the supplier master data entity with credit limit tracking per supplier. Suppliers are scoped to `company_id` and have a billing currency (may differ from company base currency). Credit limit is stored in the supplier's currency, not the company's base currency.

**Dependencies:** None (first story in epic)

---

## Acceptance Criteria

**AC1: Supplier CRUD**
**Given** a company authenticated user with `purchasing.suppliers` CREATE permission,
**When** they create a supplier with name, code, email, phone, address, credit_limit, and currency,
**Then** a supplier record is created with status ACTIVE, scoped to the company_id,
**And** READ/UPDATE/DELETE work for the company's suppliers.

**AC2: Supplier Contacts**
**Given** a supplier exists,
**When** a user adds contact records (name, email, phone, role) to the supplier,
**Then** contacts are stored in `supplier_contacts` linked by `supplier_id`,
**And** contacts are returned when the supplier is fetched.

**AC3: Credit Limit Storage**
**Given** a supplier is created,
**When** credit_limit is set,
**Then** credit_limit is stored in the supplier's currency (not base currency),
**And** the supplier's currency is stored on the supplier record.

**AC4: Credit Utilization Query**
**Given** a supplier with credit_limit and currency,
**When** I query the supplier's credit utilization,
**Then** the system returns: total open PI amount (converted to supplier currency at PI date rates), credit_limit, utilization percentage,
**And** a warning flag if utilization >= 80%,
**And** a block flag if utilization >= 100%.

**AC5: ACL Enforcement**
**Given** a user without `purchasing.suppliers` CREATE permission,
**When** they attempt to create a supplier,
**Then** they receive a 403 Forbidden response.

**AC6: Tenant Isolation**
**Given** Company A and Company B both have suppliers,
**When** Company A queries its suppliers,
**Then** only Company A's suppliers are returned (company_id enforcement on all queries).

---

## Tasks / Subtasks

- [ ] Create `suppliers` table migration with indexes on (company_id), (supplier_code)
- [ ] Create `supplier_contacts` table migration
- [ ] Add ACL module_resources entry for `purchasing.suppliers`
- [ ] Add `purchasing` module to role permission matrix
- [ ] Implement supplier routes (CRUD) in `apps/api/src/routes/purchasing/suppliers.ts`
- [ ] Implement supplier contact routes
- [ ] Implement credit utilization calculation (query across open PIs)
- [ ] Write integration tests for supplier CRUD + ACL
- [ ] Write integration tests for tenant isolation

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/suppliers.ts` | Supplier CRUD routes |
| `apps/api/src/routes/purchasing/supplier-contacts.ts` | Contact CRUD routes |
| `packages/db/src/kysely/schema.ts` | Add suppliers, supplier_contacts |
| `packages/shared/src/schemas/purchasing.ts` | Zod schemas for supplier types |
| `apps/api/src/routes/purchasing/index.ts` | Route aggregator |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/index.ts` | Modify | Register /api/purchasing/* routes |
| `packages/db/src/kysely/schema.ts` | Modify | Add supplier + contact tables |
| `packages/shared/src/index.ts` | Modify | Export purchasing schemas |
| `packages/auth/src/acls.ts` | Modify | Add purchasing module + resources |

---

## Validation Evidence

```bash
# Supplier CRUD
curl -X POST /api/purchasing/suppliers \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Acme Corp", "code": "ACM", "currency": "USD", "credit_limit": "10000.00"}'

# List suppliers (company-scoped)
curl /api/purchasing/suppliers -H "Authorization: Bearer $TOKEN"

# ACL test: CASHIER should get 403
curl -X POST /api/purchasing/suppliers -H "Authorization: Bearer $CASHIER_TOKEN"
# Expected: 403
```

---

## Dev Notes

- Supplier `code` must be unique within a company (enforce with unique index)
- `credit_limit` stored as DECIMAL(19,4) — same as money columns across the system
- `supplier_contacts` cascade delete when supplier is deleted
- Credit utilization formula: `(open_pi_total_in_supplier_currency / credit_limit) * 100`
- Use `company.currency` as default supplier currency if not specified

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `as any` casts added without justification
- [ ] All new tables have proper indexes on (company_id) and (company_id, supplier_id) for supplier_contacts
