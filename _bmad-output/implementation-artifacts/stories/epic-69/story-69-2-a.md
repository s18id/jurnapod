# Story 69-2-a: Supplier Management + Contacts

Status: backlog

## Story

As a **purchasing officer**,  
I want **supplier and supplier-contact management screens**,  
So that **purchasing master data can be created, reviewed, edited, deactivated, and audited from backoffice**.

## Context

This is the first purchasing domain slice after ReviewPanel hardening. It uses the canonical API base `/api/purchasing` and focuses only on supplier CRUD plus contacts. It MUST NOT implement purchase orders, receipts, invoices, payments, or credits.

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] Happy paths identified
- [ ] Error paths identified
- [ ] Edge cases identified
- [ ] Test fixture needs identified
- [ ] Integration/component test scope defined
- [ ] Negative auth test role selected: use `CASHIER` or custom low-privilege role for denial paths

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Supplier list renders search, status filter, pagination | Happy | Unit/component |
| Supplier create/edit uses ReviewPanel and restores drafts | Happy | Component |
| Supplier deactivate uses confirmation/reason pattern where backend accepts it | Happy | Unit/component |
| Supplier contacts list/create/edit/delete scoped to supplier | Happy | Unit/component |
| CASHIER cannot create supplier | Auth | Integration or contract test |
| Duplicate supplier code returns conflict/validation error | Error | Contract/component |
| Empty supplier list renders empty state | Edge | Unit/component |

**Sign-off:** QA kickoff sign-off required before implementation begins.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| `ValidationError` | API/shared response envelope | `apps/backoffice` | N/A | Must map by response `code` and message, not `instanceof` |
| `PermissionError` | API/auth response envelope | `apps/backoffice` | N/A | Must map 403 response `code`, not `instanceof` |
| `NotFoundError` | API/purchasing response envelope | `apps/backoffice` | N/A | Must map 404 response `code`, not `instanceof` |

## Cross-Module Decision Gate

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|------------------|-----------|-------------------------|-----------------|
| 1 | Supplier screens consume only `/api/purchasing/suppliers` and contacts subroutes | `apps/backoffice`, `apps/api`, `purchasing` | Keeps slice bounded and contract-verifiable | Include orders/invoices (rejected: too broad) | Pending |

## API Contract Verification

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/purchasing/suppliers` | GET | `{ success: true, data: { suppliers, total, limit, offset } }` | TBD | Query: `search`, `is_active`, `limit`, `offset` |
| `/api/purchasing/suppliers` | POST | `{ success: true, data: { supplier } }` or equivalent created supplier envelope | TBD | Must verify exact response before UI implementation |
| `/api/purchasing/suppliers/:id` | GET | `{ success: true, data: { supplier } }` | TBD | Detail/drawer |
| `/api/purchasing/suppliers/:id` | PATCH | `{ success: true, data: { supplier } }` | TBD | Edit/reactivate/deactivate if supported via PATCH |
| `/api/purchasing/suppliers/:id` | DELETE | `{ success: true, ... }` | TBD | Deactivate/delete semantics MUST be verified |
| `/api/purchasing/suppliers/:supplierId/contacts` | GET/POST | Contact list/create envelope | TBD | Exact shape MUST be verified |
| `/api/purchasing/suppliers/:supplierId/contacts/:id` | GET/PATCH/DELETE | Contact detail/update/delete envelope | TBD | Exact shape MUST be verified |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| TBD | TBD | TBD |

## Acceptance Criteria

**AC1:** Supplier list uses EntityTable with search, status filter, pagination, loading, error, and empty states.  
**AC2:** Supplier create/edit uses ReviewPanel, scoped draft keys, validation, and final review.  
**AC3:** Supplier detail drawer displays supplier fields and contacts.  
**AC4:** Contacts can be listed, created, edited, and removed under a supplier.  
**AC5:** Permission gates hide create/edit/delete actions when the user lacks `purchasing.suppliers` permission, and direct API attempts return 403.  
**AC6:** All errors render machine-readable code and human-readable message from standard API envelope.

## Tasks / Subtasks

- [ ] Verify supplier and contact API contracts directly.
- [ ] Implement supplier list route/page.
- [ ] Implement supplier create/edit ReviewPanel form.
- [ ] Implement supplier detail drawer with contacts.
- [ ] Implement contact list/create/edit/delete UI.
- [ ] Add permission-aware actions.
- [ ] Add unit/component tests and any required contract/integration tests.

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/backoffice/src/features/purchasing/suppliers/*` | Create supplier UI feature files |
| `apps/backoffice/src/hooks/use-purchasing-suppliers.ts` | Create query/mutation hooks if needed |
| `apps/backoffice/src/app/router/routes.tsx` or active route registry | Modify route entries if needed |
| `apps/backoffice/__test__/unit/features/purchasing-suppliers.test.tsx` | Create tests |

## Validation Commands

```bash
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-suppliers.test.tsx
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Dependencies

- 69-2-e MUST be done.
- Story 69-1 MUST be done.
- Backoffice unfreeze MUST remain approved.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
