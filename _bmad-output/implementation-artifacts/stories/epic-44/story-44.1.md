# Story 44.1: Customer Master CRUD

**Status:** planned
**Priority:** P1

## Story

As a **company administrator**,
I want **CRUD operations for customer master records**,
So that **I can manage customer information, link invoices, and enable AR ageing**.

## Context

Currently there is no customer master table. The `customers` table must be created with fields: id, company_id, outlet_id (nullable), code (unique per company), type (1=PERSON, 2=BUSINESS), company_name (required for BUSINESS), tax_id (optional), and soft delete (deleted_at). Code uniqueness must be enforced per company and never reused after soft delete. ACL permissions must be defined for the `platform.customers` resource (CREATE, READ, UPDATE, DELETE). The migration must be idempotent and compatible with MySQL 8.0+ and MariaDB.

## Acceptance Criteria

**AC1: customers table migration**
**Given** the database schema
**When** migration is applied
**Then** a `customers` table exists with columns:
- `id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `company_id` BIGINT NOT NULL
- `outlet_id` BIGINT NULL
- `code` VARCHAR(50) NOT NULL
- `type` TINYINT NOT NULL (1=PERSON, 2=BUSINESS)
- `company_name` VARCHAR(255) NULL
- `tax_id` VARCHAR(100) NULL
- `deleted_at` TIMESTAMP NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
**And** unique constraint on (`company_id`, `code`) where `deleted_at IS NULL`
**And** foreign keys to `companies(id)` and `outlets(id)`

**AC2: ACL resource platform.customers**
**Given** the ACL system
**When** the migration runs
**Then** `module_roles` contains entries for `platform.customers` with appropriate permission bits (READ=1, CREATE=2, UPDATE=4, DELETE=8) for each canonical role (SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT, CASHIER)
**And** the `resource` column is set to `'customers'` (not NULL)

**AC3: CRUD endpoints**
**Given** the API
**When** a user with appropriate permissions accesses `/platform/customers`
**Then** GET (list), GET /:id, POST, PATCH /:id, DELETE /:id endpoints exist
**And** they enforce `platform.customers` resource‑level ACL
**And** they respect company_id scope (users cannot access other companies' customers)

**AC4: Code uniqueness and soft delete**
**Given** a customer with code `CUST001` and company_id=1
**When** that customer is soft‑deleted
**Then** the code `CUST001` for company_id=1 cannot be reused for a new customer
**And** the unique constraint prevents insertion of duplicate active codes

**AC5: Validation rules**
**Given** a customer creation request
**When** type=BUSINESS
**Then** `company_name` is required (validation error if missing)
**When** type=PERSON
**Then** `company_name` may be NULL

**AC6: Integration tests**
**Given** the test suite
**When** `npm run test:integration -w @jurnapod/api` is executed
**Then** tests exist for customer CRUD, ACL enforcement, and validation
**And** they pass

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `packages/db/src/migrations/` | New migration: create `customers` table |
| `packages/db/src/seeds/seed-module-roles.ts` | Add `platform.customers` entries |
| `apps/api/src/routes/platform/customers.ts` | New route file with CRUD handlers |
| `packages/modules/platform/src/customer-service.ts` | Service layer for customer operations |
| `packages/shared/src/contracts/platform/customers.ts` | Zod schemas for customer CRUD |
| `apps/api/__test__/integration/platform/customers.test.ts` | Integration tests |

### Migration Details

- Table name: `customers`
- Unique index: `UNIQUE idx_customers_company_code_active (company_id, code, (deleted_at IS NULL))` using generated column or `WHERE deleted_at IS NULL` (MySQL 8.0+ supports functional indexes).
- Foreign keys: `company_id` references `companies(id)`, `outlet_id` references `outlets(id)`.
- Soft delete: `deleted_at` nullable; queries should filter `WHERE deleted_at IS NULL`.

### ACL Permission Matrix

| Role | platform.customers permissions |
|------|--------------------------------|
| SUPER_ADMIN | CRUDAM (63) |
| OWNER | CRUDAM (63) |
| COMPANY_ADMIN | CRUDA (31) |
| ADMIN | READ (1) |
| ACCOUNTANT | READ (1) |
| CASHIER | 0 |

CASHIER gets no access to customer master (customer selection may be via separate UI control).

### Service Layer

- `CustomerService` with methods: `create`, `findById`, `list`, `update`, `softDelete`.
- All methods must scope by `company_id`.
- Code uniqueness validation must check active records only.

## Test Coverage Criteria

- [x] Migration creates table and indexes (idempotent)
- [x] ACL entries exist for `platform.customers`
- [x] GET /platform/customers returns 401 without authentication
- [x] GET /platform/customers returns 403 for CASHIER role
- [x] POST /platform/customers creates customer with unique code
- [x] PATCH /platform/customers/:id updates allowed fields
- [x] DELETE /platform/customers/:id soft‑deletes (sets deleted_at)
- [x] Attempt to reuse soft‑deleted code fails
- [x] BUSINESS validation requires company_name

## Test Fixtures

- Create test company, outlet, and authenticated users with different roles.
- Use canonical test fixtures from `apps/api/src/lib/test-fixtures.ts`.

## Tasks / Subtasks

- [ ] Write migration for `customers` table
- [ ] Seed ACL entries for `platform.customers`
- [ ] Create shared Zod schemas
- [ ] Implement `CustomerService` in modules‑platform
- [ ] Create route file with CRUD endpoints
- [ ] Add integration tests
- [ ] Run typecheck, lint, and tests

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/migrations/0160-create-customers-table.ts` | Create | New migration |
| `packages/db/src/seeds/seed-module-roles.ts` | Modify | Add platform.customers entries |
| `packages/shared/src/contracts/platform/customers.ts` | Create | Zod schemas |
| `packages/modules/platform/src/customer-service.ts` | Create | Service layer |
| `apps/api/src/routes/platform/customers.ts` | Create | Route handlers |
| `apps/api/__test__/integration/platform/customers.test.ts` | Create | Integration tests |

## Estimated Effort

3 hours

## Risk Level

Medium — new table and ACL entries; must ensure proper tenant isolation and soft‑delete semantics.

## Dev Notes

- Use `BIGINT` for IDs consistent with other master tables.
- `outlet_id` nullable: customers can be company‑wide or outlet‑specific.
- Unique index must filter `deleted_at IS NULL`. MySQL 8.0+ supports functional indexes: `CREATE UNIQUE INDEX ... (company_id, code, (IF(deleted_at IS NULL, 1, NULL)))`.
- Code generation will be handled by numbering reset system (Story 44.0) — the `code` field is supplied by the UI; service may auto‑generate if not provided.
- ACL entries must use `resource: 'customers'` (module: 'platform').

## Validation Evidence

```bash
npm run db:migrate -w @jurnapod/db
npm run db:seed -w @jurnapod/db
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

## Dependencies

- 44.0 (Numbering reset) — customer code generation uses SALES_CUSTOMER document type.

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] No deprecated functions used
- [ ] No N+1 query patterns introduced
- [ ] No in‑memory state introduced
- [ ] Integration tests included

## ADR References

- [ADR-0020: Numbering System](../../../../docs/adr/adr-0020-numbering-system.md)
- [ADR-0022: AR Transaction Model](../../../../docs/adr/adr-0022-ar-transaction-model.md)