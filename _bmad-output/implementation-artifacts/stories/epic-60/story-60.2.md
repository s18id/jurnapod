# Story 60.2: ACL Resource-Level Enforcement Audit

**Status:** done

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 60 --story 60-2 --status done --title acl-resource-level-enforcement-audit`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **security reviewer**,  
I want **every `requireAccess()` call across all modules to include an explicit `resource` parameter**,  
So that **ACL resource-level enforcement is mandatory and no bypass paths exist**.

## Context

- Source: Epic 60
- Depends on: Story 60.1 (tenant scoping audit)
- Scope: Audit all `requireAccess()` calls for explicit `resource` parameter; no wildcard fallback permitted
- Risk: P0 — missing `resource` bypasses ACL enforcement per Epic 39 strict ACL migration (Migration 0158)

## Background

Per Epic 39 (ACL Reorganization), the ACL system enforces **mandatory resource-level permissions**:
- `resource` column in `module_roles` is NOT NULL (Migration 0158 enforced this)
- No wildcard fallback: `resource=NULL` does NOT grant resource-level access
- All `requireAccess()` calls MUST specify `resource` parameter explicitly
- Module-only permissions (without resource) are no longer valid

Any `requireAccess()` call missing the `resource` parameter will fail at runtime, but the failure mode must be verified — silent denial is acceptable, silent allowance is not.

---

## Acceptance Criteria

**AC1: Platform module requireAccess resource audit**  
**Given** all `requireAccess()` calls in platform routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "users"`, `resource: "roles"`).

**AC2: Accounting module requireAccess resource audit**  
**Given** all `requireAccess()` calls in accounting routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "journals"`, `resource: "accounts"`).

**AC3: Inventory module requireAccess resource audit**  
**Given** all `requireAccess()` calls in inventory routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "items"`, `resource: "stock"`).

**AC4: Treasury module requireAccess resource audit**  
**Given** all `requireAccess()` calls in treasury routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "transactions"`).

**AC5: Sales module requireAccess resource audit**  
**Given** all `requireAccess()` calls in sales routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "invoices"`, `resource: "orders"`).

**AC6: POS module requireAccess resource audit**  
**Given** all `requireAccess()` calls in POS routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "transactions"`).

**AC7: Purchasing module requireAccess resource audit**  
**Given** all `requireAccess()` calls in purchasing routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "orders"`, `resource: "invoices"`).

**AC8: Reservations module requireAccess resource audit**  
**Given** all `requireAccess()` calls in reservations routes and services,  
**When** each call is reviewed,  
**Then** each call MUST include explicit `resource` parameter (e.g., `resource: "bookings"`, `resource: "tables"`).

**AC9: Missing resource failure mode verification**  
**Given** a `requireAccess()` call without `resource`,  
**When** authorization is attempted,  
**Then** the call MUST fail with a clear error (403 or throws) — silent allowance is NOT acceptable.

**AC10: Resource value validity check**  
**Given** a `requireAccess()` call with a `resource` value,  
**When** the value is checked against `module_roles` table,  
**Then** the resource MUST exist in the canonical list for the module (e.g., no `resource: "users"` in accounting module).

---

## Tasks / Subtasks

- [ ] Audit platform routes (`apps/api/src/routes/platform/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit accounting routes (`apps/api/src/routes/accounting/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit inventory routes (`apps/api/src/routes/inventory/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit treasury routes (`apps/api/src/routes/treasury/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit sales routes (`apps/api/src/routes/sales/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit POS routes (`apps/api/src/routes/sync/*.ts`, `apps/api/src/routes/pos/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit purchasing routes (`apps/api/src/routes/purchasing/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Audit reservations routes (`apps/api/src/routes/reservations/*.ts`) for `requireAccess` with explicit `resource`
- [ ] Test missing-resource failure mode with a synthetic test call
- [ ] Fix any missing `resource` parameters found
- [ ] Add integration tests verifying denied access with missing resource

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/acl/resource-enforcement.test.ts` | Create | Resource parameter enforcement tests |
| `apps/api/src/routes/platform/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/accounting/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/inventory/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/treasury/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/sales/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/sync/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/purchasing/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |
| `apps/api/src/routes/reservations/*.ts` | Audit | Verify explicit `resource` on all `requireAccess` calls |

---

## Risk Level

P0 — missing `resource` parameter bypasses mandatory ACL enforcement.

---

_Last Updated: 2026-05-09_
