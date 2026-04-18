# Epic 44: AR Customer Management & Invoicing Completion

**Status:** done
**Theme:** AR Customer Management & Invoicing Completion
**Started:** 2026-04-15
**Completed:** 2026-04-18

## Context

Epic 44 closes remaining AR foundations across customer master, sales invoices, reporting, and credit notes.

Current gaps and reconciliation notes:

1. **No customer master yet** — invoices are not linked to customer entities, limiting AR statements and credit control.
2. **Invoice discount behavior/contracts incomplete** — schema fields may already exist, but API/service behavior and shared contracts must be aligned.
3. **Numbering baseline already present** — reset-period capabilities and SALES_CUSTOMER template behavior are treated as verification/closeout in this epic.
4. **Credit notes need customer continuity** — customer should inherit from source invoice for AR traceability.
5. **Receivables ageing enhancement must extend existing reporting runtime** — canonical path is `/reports/receivables-ageing` with reporting module ownership.

## Goals

1. Verify and close out numbering baseline for customer code generation (`CUST/{{yyyy}}/{{seq4}}`, yearly reset).
2. Create customer master CRUD with ACL `platform.customers`, soft delete, and company-scoped unique code.
3. Link invoices to customers via nullable `customer_id` with ACL enforcement on assignment/reassignment.
4. Align invoice header discount behavior (percent + fixed) before tax with validation and regression coverage.
5. Complete receivables-ageing enhancement on existing reporting runtime with customer fields, overdue flag, and drill-down support.
6. Ensure credit notes inherit `customer_id` from source invoice for AR continuity.

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| [44.0](./story-44.0.md) | Numbering Reset Verification & Closeout | planned | 1h | |
| [44.1](./story-44.1.md) | Customer Master CRUD | planned | 3h | |
| [44.2](./story-44.2.md) | Invoice → Customer Link | planned | 2h | |
| [44.3](./story-44.3.md) | Invoice Header Discounts Alignment | planned | 2h | |
| [44.4](./story-44.4.md) | Receivables Ageing Reporting Completion | planned | 3h | |
| [44.5](./story-44.5.md) | Credit Note Customer Flow | planned | 2h | |

## Success Criteria

- [ ] Numbering baseline verified for reset periods and SALES_CUSTOMER template behavior; no duplicate implementation introduced
- [ ] `customers` table migration with type (PERSON/BUSINESS), unique code per company, soft delete
- [ ] ACL permissions for `platform.customers` resource (CREATE, READ, UPDATE, DELETE)
- [ ] Invoice create/update schemas accept `customer_id`; ACL enforced on assignment/reassignment
- [ ] Invoice header discounts (`discount_percent` 0-100, `discount_fixed` non-negative) validated; total discount cannot exceed subtotal
- [ ] Tax calculation uses discounted taxable base before tax; `grand_total` remains consistent with business rule and schema constraints
- [ ] `/reports/receivables-ageing` includes customer fields and overdue flag
- [ ] Drill-down endpoint under reports namespace returns customer-scoped invoice list with outlet/company scoping
- [ ] Credit notes inherit `customer_id` from source invoice
- [ ] All changes pass typecheck, lint, and integration tests

## Dependencies

**Pre-flight gate:**
- Epic 43 hardening items are complete; keep pre-flight validation (`lint`, `typecheck`, tests) before first Epic 44 implementation story.

**Internal dependencies:**
- 44.0 is a verification/closeout predecessor for customer-numbering assumptions.
- 44.1 (Customer master) enables 44.2, 44.4, and 44.5.
- 44.2 (Invoice → customer link) enables 44.4 and 44.5.
- 44.3 can run in parallel with 44.1 (independent behavior/contract alignment).

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Wrong AR ageing implementation surface (treasury vs reporting) | High | Medium | Keep canonical ownership in reporting module and `/reports/receivables-ageing` routes |
| Duplicate migration for already-existing discount columns | Medium | Medium | Verify schema first; only apply guarded idempotent migration fallback when absent |
| Customer code uniqueness collisions | Medium | Low | Use portable unique constraint `(company_id, code)`; never reuse deleted codes |
| Legacy invoice data without `customer_id` | Low | High | Keep nullable `customer_id` and backward-compatible reads |
| ACL resource mapping confusion | Medium | Low | Explicitly document `platform.customers` and `accounting.reports` usage |

## Notes

- Customer type: 1 = PERSON, 2 = BUSINESS. BUSINESS requires `company_name`.
- Tax ID optional, stored as string.
- Soft delete: `deleted_at`; deleted customer codes are not reused.
- Invoice discounts are applied before tax calculation.
- Receivables-ageing enhancement is an extension of existing reports API/runtime (no treasury route fork).
- Credit note customer inheritance is automatic when source invoice exists.

## Retrospective

See: [Epic 44 Retrospective](./epic-44.retrospective.md)
