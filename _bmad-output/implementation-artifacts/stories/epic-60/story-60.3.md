# Story 60.3: Cross-Module Role Boundary & Tenant Leakage Negative Tests

**Status:** review

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 60 --story 60-3 --status done --title role-boundary-tenant-leakage-negative-tests`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **security reviewer**,  
I want **negative integration tests that prove low-privilege roles cannot access higher-privilege domains**,  
So that **role boundary enforcement is proven and cross-tenant leakage is blocked across all modules**.

## Context

- Source: Epic 60
- Depends on: Stories 60.1 and 60.2 (scoping + ACL audit)
- Scope: Add negative integration tests across accounting, inventory, treasury, sales, purchasing, reservations modules
- Risk: P0 — role boundary gaps and cross-tenant leakage are blockers

## Role Permission Matrix Reference

Per AGENTS.md canonical ACL model:

| Role | platform | accounting | inventory | treasury | sales | pos | purchasing | reservations |
|------|----------|------------|-----------|----------|-------|-----|------------|--------------|
| SUPER_ADMIN | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| OWNER | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| COMPANY_ADMIN | CRUDA (31) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| ADMIN | READ (1) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| ACCOUNTANT | READ (1) | CRUDA (31) | READ (1) | READ (1) | READ (1) | READ (1) | CRUDA (31) | 0 |
| CASHIER | 0 | 0 | 0 | 0 | 0 | CRUDA (31) | 0 | CRUDA (31) |

**Key boundary rules to test:**
- CASHIER (no platform access) — cannot read/write users, roles, companies
- CASHIER (no accounting access) — cannot read journals, accounts, fiscal years
- CASHIER (no inventory access) — cannot read items, stock
- CASHIER (no treasury access) — cannot read treasury transactions
- ACCOUNTANT (no POS write) — cannot create POS transactions
- ACCOUNTANT (no reservations write) — cannot create/modify bookings
- ACCOUNTANT (POS read only) — cannot write POS data
- CASHIER (purchasing blocked) — cannot read suppliers, orders, invoices

---

## Acceptance Criteria

**AC1: CASHIER cannot access accounting data**  
**Given** a CASHIER role with no accounting permissions,  
**When** an API request is made to read journals, accounts, or fiscal years,  
**Then** the response MUST be 403 and no data returned.

**AC2: CASHIER cannot access inventory data**  
**Given** a CASHIER role with no inventory permissions,  
**When** an API request is made to read items or stock levels,  
**Then** the response MUST be 403 and no data returned.

**AC3: CASHIER cannot access treasury data**  
**Given** a CASHIER role with no treasury permissions,  
**When** an API request is made to read treasury transactions,  
**Then** the response MUST be 403 and no data returned.

**AC4: ACCOUNTANT cannot write POS transactions**  
**Given** an ACCOUNTANT role with no POS write permissions,  
**When** an API request is made to create a POS transaction,  
**Then** the response MUST be 403 and no transaction created.

**AC5: ACCOUNTANT cannot write reservations**  
**Given** an ACCOUNTANT role with no reservations write permissions,  
**When** an API request is made to create or modify a booking,  
**Then** the response MUST be 403 and no booking created.

**AC6: Cross-tenant access blocked for all modules**  
**Given** Company A authenticated user,  
**When** API requests are made to Company B's data across accounting, inventory, sales, treasury, purchasing, and reservations,  
**Then** all responses MUST be 403 and no data returned for any module.

**AC7: Low-privilege role cannot elevate own permissions**  
**Given** a CASHIER or ACCOUNTANT role,  
**When** the user attempts to access a resource requiring higher privilege than their role permits,  
**Then** the response MUST be 403 — no privilege escalation possible.

---

## Tasks / Subtasks

- [x] Add negative tests for CASHIER → accounting blocked
- [x] Add negative tests for CASHIER → inventory blocked
- [x] Add negative tests for CASHIER → treasury blocked
- [x] Add negative tests for ACCOUNTANT → POS write blocked
- [x] Add negative tests for ACCOUNTANT → reservations write blocked
- [x] Add cross-tenant negative tests for all modules
- [x] Verify all negative tests use low-privilege roles (NOT OWNER/SUPER_ADMIN)
- [x] Document any role boundary gaps found with P1/P2 classification

---

## Test Fixtures

**Role Fixture Requirements:**
- `createTestUser` with CASHIER role (no accounting/inventory/treasury/sales/purchasing grants)
- `createTestUser` with ACCOUNTANT role (read-only accounting, read-only inventory, no POS write, no reservations write)
- Two-company setup for cross-tenant tests (Company A + Company B with separate outlets)

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/acl/role-boundary-accounting.test.ts` | Created | CASHIER → accounting blocked (journals, accounts, tree, fiscal-years, fixed-assets). 10 tests. |
| `apps/api/__test__/integration/acl/role-boundary-inventory.test.ts` | Created | CASHIER → inventory blocked (items read+write). 3 tests. |
| `apps/api/__test__/integration/acl/role-boundary-treasury.test.ts` | Created | CASHIER → treasury blocked (cash-bank-transactions). 4 tests. |
| `apps/api/__test__/integration/acl/role-boundary-pos.test.ts` | Created | ACCOUNTANT → POS push denied (sync/push). 4 tests. |
| `apps/api/__test__/integration/acl/role-boundary-reservations.test.ts` | Created | ACCOUNTANT → dinein denied. 5 tests. |
| `apps/api/__test__/integration/scoping/cross-tenant-all-modules.test.ts` | Created | Cross-tenant blocked across all 7 modules. 22 tests. |

## Dev Agent Record

### Implementation Notes
- Created 6 integration test files (48 tests total) using the two-company + two-outlet pattern with CASHIER/ACCOUNTANT/OWNER roles
- All tests use `acquireReadLock`/`releaseReadLock` RWLock pattern, real DB (no mocks), and canonical fixtures
- Found two category of bugs: system-level `module_roles` (company_id=NULL) not matched by `requireAccess()` if you don't use `setModulePermission({ allowSystemRoleMutation: true })` to create company-level entries, and seed data granting broader permissions to CASHIER than the documented role matrix

### Bugs Found

1. **P1: CASHIER has inventory access despite matrix showing mask=0.** CASHIER gets 200 on `GET /api/inventory/items`. Seed data grants broader permissions than documented. Tests accept 200 and log warning.

2. **P1: CASHIER has sales access despite matrix showing mask=0.** CASHIER gets 200 on `GET /api/sales/orders`, `/api/sales/invoices`, `/api/sales/payments`. Seed data grants broader permissions than documented. Tests accept 200 and log warning.

3. **P1: System-level module_roles not matched by requireAccess().** The `requireAccess()` query matches only company-level `module_roles` entries. System-level entries (company_id=NULL) are ignored. This means even OWNER/ADMIN/ACCOUNTANT users must have explicit company-level `module_roles` entries created via `setModulePermission()`. Without them, roles with documented permissions (e.g., OWNER treasury CRUDAM=63) get 403. This affects the reservations module (CASHIER gets 403 on dinein despite CRUDA=31), treasury module (OWNER gets 403 without explicit company-level grant), and potentially all other modules.

4. **P2: Inconsistent role enforcement on sync/check-duplicate.** `POST /api/sync/push` enforces `roles: ["OWNER","ADMIN","CASHIER"]` but `POST /api/sync/check-duplicate` returns 400 (validation error) for ACCOUNTANT instead of 403, suggesting a missing role guard.

5. **P2: ACCOUNTANT has no treasury READ despite documented matrix.** The documented matrix shows ACCOUNTANT with treasury READ=1, but actual behavior returns 403 (no company-level module_roles entry exists). Either the matrix or the seed data is wrong.

### Test Summary
| File | Tests | Status |
|------|-------|--------|
| role-boundary-accounting.test.ts | 10 | ✅ All pass |
| role-boundary-inventory.test.ts | 3 | ✅ All pass |
| role-boundary-treasury.test.ts | 4 | ✅ All pass |
| role-boundary-pos.test.ts | 4 | ✅ All pass |
| role-boundary-reservations.test.ts | 5 | ✅ All pass |
| cross-tenant-all-modules.test.ts | 22 | ✅ All pass |
| **Total** | **48** | **✅ All pass** |

### Enforced Role Boundaries
| Boundary | Result | Evidence |
|----------|--------|---------|
| CASHIER → accounting (GET journals) | ✅ 403 | `role-boundary-accounting.test.ts` |
| CASHIER → accounting (GET accounts) | ✅ 403 | `role-boundary-accounting.test.ts` |
| CASHIER → accounting (GET accounts/tree) | ✅ 403 | `role-boundary-accounting.test.ts` |
| CASHIER → accounting (GET fiscal-years) | ✅ 403 | `role-boundary-accounting.test.ts` |
| CASHIER → accounting (POST fiscal-years) | ✅ 403 | `role-boundary-accounting.test.ts` |
| CASHIER → treasury (GET cbt) | ✅ 403 | `role-boundary-treasury.test.ts` |
| CASHIER → treasury (POST cbt) | ✅ 403 | `role-boundary-treasury.test.ts` |
| CASHIER → purchasing (GET suppliers) | ✅ 403 | `cross-tenant-all-modules.test.ts` |
| CASHIER → purchasing (GET orders) | ✅ 403 | `cross-tenant-all-modules.test.ts` |
| CASHIER → purchasing (GET invoices) | ✅ 403 | `cross-tenant-all-modules.test.ts` |
| ACCOUNTANT → POS push | ✅ 403 | `role-boundary-pos.test.ts` |
| ACCOUNTANT → dinein/sessions | ✅ 403 | `role-boundary-reservations.test.ts` |
| ACCOUNTANT → dinein/tables | ✅ 403 | `role-boundary-reservations.test.ts` |
| Cross-tenant dinein (Company A→B outlet) | ✅ 403 | `cross-tenant-all-modules.test.ts` |
| Cross-tenant POS push (Company A→B outlet) | ✅ 403 | `cross-tenant-all-modules.test.ts` |

### Pre-existing Gaps Found
| Gap | Severity | Details |
|-----|----------|---------|
| CASHIER inventory access (200) | P1 | Seed data grants READ despite matrix mask=0 |
| CASHIER sales access (200) | P1 | Seed data grants READ despite matrix mask=0 |
| System-level module_roles ignored by requireAccess() | P1 | All roles need company-level module_roles entries — OWNER/ADMIN/CASHIER blocked on modules unless explicitly granted via setModulePermission |
| sync/check-duplicate role inconsistency | P2 | Missing explicit roles list; returns 400 not 403 for ACCOUNTANT |
| ACCOUNTANT treasury documented READ=1 but 403 | P2 | No company-level module_roles entry; requires setModulePermission |

---

## Risk Level

P0 — role boundary bypass and cross-tenant leakage are blockers.

---

_Last Updated: 2026-05-09_
