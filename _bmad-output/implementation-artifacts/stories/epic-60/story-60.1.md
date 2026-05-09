# Story 60.1: Tenant Isolation & Outlet Scoping Audit (Non-POS Modules)

**Status:** backlog

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 60 --story 60-1 --status done --title tenant-isolation-outlet-scoping-audit`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **security reviewer**,  
I want **all non-POS modules to enforce `company_id` and `outlet_id` scoping on every query**,  
So that **cross-tenant data leakage is impossible across accounting, inventory, sales, treasury, purchasing, and reservations**.

## Context

- Source: Epic 60
- Depends on: Epic 59 close gate (E59-G1, E59-G2, E59-G3)
- Scope: Audit all queries in accounting, inventory, sales, treasury, purchasing, reservations modules for `company_id` and `outlet_id` enforcement
- Risk: P0 — tenant leakage is a blocker

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Authorized same-tenant access succeeds per module
- [ ] **Error paths identified:** Cross-tenant access attempts rejected with 403
- [ ] **Edge cases identified:** `outlet_id` NULL handling, multi-company test data, module-is-active checks
- [ ] **Fixture needs identified:** Two-company fixture set per module (company + outlet + user)
- [ ] **Integration test scope defined:** Negative tests with cross-tenant token swap
- [ ] **Negative auth test role selected:** Use CASHIER or dedicated low-privilege test role (NOT OWNER/SUPER_ADMIN)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Same-tenant access succeeds | Happy | Unit/Integration |
| Cross-tenant access rejected | Error | Integration |
| Missing company_id filter detected | Error | Code audit |
| Missing outlet_id filter on outlet-scoped domains | Error | Code audit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Acceptance Criteria

**AC1: Accounting module company_id enforcement**  
**Given** any query against accounting tables (journals, accounts, fiscal_years),  
**When** the query is executed,  
**Then** `company_id` MUST be in the WHERE clause.

**AC2: Inventory module company_id + outlet_id enforcement**  
**Given** any query against inventory tables (items, item_stock, stock_movements),  
**When** the query is executed,  
**Then** `company_id` MUST be in the WHERE clause AND for stock-related tables `outlet_id` MUST also be enforced.

**AC3: Sales module company_id enforcement**  
**Given** any query against sales tables (orders, invoices, payments),  
**When** the query is executed,  
**Then** `company_id` MUST be in the WHERE clause.

**AC4: Treasury module company_id enforcement**  
**Given** any query against treasury tables (treasury_transactions),  
**When** the query is executed,  
**Then** `company_id` MUST be in the WHERE clause.

**AC5: Purchasing module company_id enforcement**  
**Given** any query against purchasing tables (suppliers, purchase_orders, goods_receipts, purchase_invoices, ap_payments, supplier_credits),  
**When** the query is executed,  
**Then** `company_id` MUST be in the WHERE clause.

**AC6: Reservations module company_id + outlet_id enforcement**  
**Given** any query against reservations tables (bookings, tables),  
**When** the query is executed,  
**Then** `company_id` MUST be in the WHERE clause AND `outlet_id` MUST also be enforced.

**AC7: Negative cross-tenant test**  
**Given** Company A credentials with an authenticated user,  
**When** a request is made targeting Company B's data,  
**Then** the response MUST be 403 and no data returned.

---

## Tasks / Subtasks

- [ ] Audit `modules-accounting` queries for `company_id` enforcement
- [ ] Audit `modules-inventory` queries for `company_id` + `outlet_id` enforcement
- [ ] Audit `modules-sales` queries for `company_id` enforcement
- [ ] Audit `modules-treasury` queries for `company_id` enforcement
- [ ] Audit `modules-purchasing` queries for `company_id` enforcement
- [ ] Audit `modules-reservations` queries for `company_id` + `outlet_id` enforcement
- [ ] Add negative integration tests for cross-tenant access per module
- [ ] Document any unscoped queries found with fix plan

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/scoping/tenant-scoping-accounting.test.ts` | Create | Accounting tenant isolation tests |
| `apps/api/__test__/integration/scoping/tenant-scoping-inventory.test.ts` | Create | Inventory tenant isolation tests |
| `apps/api/__test__/integration/scoping/tenant-scoping-sales.test.ts` | Create | Sales tenant isolation tests |
| `apps/api/__test__/integration/scoping/tenant-scoping-treasury.test.ts` | Create | Treasury tenant isolation tests |
| `apps/api/__test__/integration/scoping/tenant-scoping-purchasing.test.ts` | Create | Purchasing tenant isolation tests |
| `apps/api/__test__/integration/scoping/tenant-scoping-reservations.test.ts` | Create | Reservations tenant isolation tests |
| Various module service files | Audit | Confirm `company_id`/`outlet_id` enforcement |

---

## Risk Level

P0 — tenant leakage is a blocker; unscoped queries expose cross-tenant data.

---

_Last Updated: 2026-05-09_
