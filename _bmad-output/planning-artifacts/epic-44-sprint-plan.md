# Sprint Plan: Epic 44

> **Epic:** AR Customer Management & Invoicing Completion  
> **Duration:** 1 sprint (~13h)  
> **Goal:** Complete customer master CRUD, invoice-customer linking, invoice discount behavior alignment, receivables-ageing reporting completion, and credit note customer flow.

---

## Package-First Design Checkpoint

This epic introduces new domain tables (`customers`) and extends existing ones (`sales_invoices`, `sales_credit_notes`). Business logic ownership:

- Customer master -> `@jurnapod/modules-platform`
- Invoice discount behavior -> `@jurnapod/modules-sales`
- Receivables-ageing enhancements -> `@jurnapod/modules-reporting`
- Credit note customer inheritance -> `@jurnapod/modules-sales`

Migrations live in `@jurnapod/db`. Shared contracts/schemas are updated in `@jurnapod/shared`.

---

## Pre-Flight Gate

- [x] Epic 43 hardening action items complete
- [ ] Run kickoff gates: lint, typecheck, and tests for current baseline

---

## Dependency Graph

```
Story 44.0 (Numbering verification)
        ↓
Story 44.1 (Customer master)
      ↙   ↘
44.3 (Invoice discounts)  44.2 (Invoice -> customer link)
                           ↙            ↘
              44.4 (Receivables-ageing)  44.5 (Credit note customer flow)
```

**Detailed dependencies:**
- 44.0 -> 44.1 (verify numbering assumptions before customer rollout)
- 44.1 -> 44.2 (customers table and service must exist)
- 44.1 + 44.2 -> 44.4 (customer join over invoice linkage)
- 44.1 + 44.2 -> 44.5 (inherit customer from linked invoice)
- 44.3 can run in parallel with 44.1 (schema-aware behavior alignment)

---

## Sprint Breakdown

### Day 1

#### Story 44.0: Numbering Reset Verification & Closeout
- **Estimate:** 1h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Verify `WEEKLY` / `DAILY` reset support and `needsReset()` behavior in current runtime
  - Verify SALES_CUSTOMER numbering template baseline and expected pattern
  - Capture evidence and close as verification (no duplicate implementation)

#### Story 44.1: Customer Master CRUD
- **Estimate:** 3h
- **Dependencies:** 44.0
- **Focus:**
  - Create `customers` table migration (type=PERSON/BUSINESS, unique code per company, soft delete)
  - Seed ACL entries for `platform.customers` resource
  - Implement customer service in `@jurnapod/modules-platform`
  - Add `/platform/customers` CRUD routes
  - Integration tests for ACL, validation, and soft delete

### Day 2

#### Story 44.2: Invoice -> Customer Link
- **Estimate:** 2h
- **Dependencies:** 44.1
- **Focus:**
  - Migration: add nullable `customer_id` to `sales_invoices` with FK
  - Update shared schemas (`SalesInvoiceCreateRequestSchema`, `SalesInvoiceUpdateRequestSchema`)
  - Enforce `platform.customers.READ` when assigning/reassigning customer
  - Update invoice service behavior and compatibility tests

#### Story 44.3: Invoice Header Discounts Alignment
- **Estimate:** 2h
- **Dependencies:** None (parallel with 44.1)
- **Focus:**
  - Verify existing `discount_percent` and `discount_fixed` schema presence
  - Use guarded idempotent migration fallback only if absent
  - Align shared schemas + service calculation + route validation
  - Validate `total_discount <= subtotal`; maintain before-tax discount application
  - Integration/regression tests for combinations and edge cases

### Day 3

#### Story 44.4: Receivables Ageing Reporting Completion
- **Estimate:** 3h
- **Dependencies:** 44.1, 44.2
- **Focus:**
  - Extend existing `/reports/receivables-ageing` runtime (reporting module)
  - LEFT JOIN customers via `sales_invoices.customer_id`
  - Add overdue flag (`due_date < as_of_date`)
  - Extend response with customer fields (`customer_id`, `customer_code`, display/company name)
  - Add drill-down endpoint under reports namespace (customer invoice list)
  - Preserve backoffice consumer compatibility
  - Integration tests for joins, overdue, drill-down, ACL, and outlet scoping

#### Story 44.5: Credit Note Customer Flow
- **Estimate:** 2h
- **Dependencies:** 44.1, 44.2
- **Focus:**
  - Migration: add nullable `customer_id` to `sales_credit_notes` with FK
  - Update shared schemas for credit notes
  - Inherit `customer_id` from source invoice when linked
  - Enforce same-company validation and `platform.customers.READ` for manual assignment
  - Integration tests for inheritance and ACL

### Day 4 (Buffer & Validation)

#### Epic-Level Validation
- **Estimate:** 2h (buffer)
- **Focus:**
  - Typecheck + lint across changed workspaces
  - Integration tests for all changed routes and services
  - Verify migration idempotency and MySQL/MariaDB compatibility
  - Update `sprint-status.yaml`

---

## Definition of Done

- [ ] 44.0 verification evidence captured and accepted
- [ ] `customers` table exists with unique `(company_id, code)`, soft delete, ACL `platform.customers`
- [ ] Invoices support nullable `customer_id` with ACL enforcement on assignment/reassignment
- [ ] Invoice discount behavior aligned in schema/service/routes/tests; invalid discounts rejected
- [ ] Receivables-ageing endpoint (`/reports/receivables-ageing`) includes customer fields and overdue flag
- [ ] Reports drill-down endpoint works with proper ACL/scoping
- [ ] Credit notes inherit `customer_id` from source invoice
- [ ] All migrations idempotent and MySQL 8.0+/MariaDB compatible
- [ ] All new/changed code passes typecheck, lint, and integration tests
- [ ] `sprint-status.yaml` updated for Epic 44 kickoff/progress

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Wrong AR ageing ownership (treasury vs reporting) | Canonical implementation remains in reporting + `/reports/receivables-ageing` |
| 2 | Duplicate migration for existing discount columns | Verify first, then apply guarded migration only if needed |
| 3 | Discount validation race/business drift | Enforce service-level validation and integration tests |
| 4 | Legacy invoice rows without customer | Keep nullable `customer_id`; no forced backfill |
| 5 | ACL mapping confusion | Explicitly enforce `platform.customers` and `accounting.reports` paths |

---

## Validation Commands

### Kickoff
```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run test -w @jurnapod/api
```

### After Each Story
```bash
npm run db:migrate -w @jurnapod/db
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

### Epic-Level Validation
```bash
npm run typecheck -ws --if-present
npm run lint -ws --if-present
npm run test -ws --if-present
```

---

## References

- Epic specification: `_bmad-output/implementation-artifacts/stories/epic-44/epic-44.md`
- Story files: `_bmad-output/implementation-artifacts/stories/epic-44/story-44.*.md`
- Sprint plan template: `_bmad-output/planning-artifacts/sprint-plan-template.md`
- ACL canonical model: `AGENTS.md` (Epic 39 section)
