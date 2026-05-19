# Story 69-2-a: Supplier Management + Contacts

Status: done

## Story

As a **purchasing officer**,  
I want **supplier and supplier-contact management screens**,  
So that **purchasing master data can be created, reviewed, edited, deactivated, and audited from backoffice**.

## Context

This is the first purchasing domain slice after ReviewPanel hardening. It uses the canonical API base `/api/purchasing` and focuses only on supplier CRUD plus contacts. It MUST NOT implement purchase orders, receipts, invoices, payments, or credits.

Backoffice unfreeze for Story 69-2-a was explicitly confirmed by Ahmad on 2026-05-19 after Story 69-2-e owner sign-off.

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] Happy paths identified
- [x] Error paths identified
- [x] Edge cases identified
- [x] Test fixture needs identified
- [x] Integration/component test scope defined
- [x] Negative auth test role selected: use `CASHIER` or custom low-privilege role for denial paths

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Supplier list renders search, status filter, pagination | Happy | Unit/component |
| Supplier create/edit uses ReviewPanel and restores drafts | Happy | Component |
| Supplier deactivate uses confirmation only; reason body MUST NOT be sent or claimed as backend-stored | Happy | Unit/component |
| Supplier contacts list/create/edit/delete scoped to supplier | Happy | Unit/component |
| CASHIER cannot create/update/delete supplier or contact | Auth | API integration/contract |
| Supplier POST with `company_id !== auth.companyId` returns 403 | Tenant isolation | API integration/contract |
| Duplicate supplier code returns conflict/validation error | Error | Contract/component |
| Invalid supplier email/currency/credit limit/payment terms return standard envelope code/message | Error | API integration/contract + component |
| Invalid supplier/contact IDs return standard envelope code/message | Error | API integration/contract |
| Contact accessed under wrong supplier returns 404 | Tenant/scope | API integration/contract |
| Contact route behavior for inactive supplier is handled according to backend response | Edge | API integration/contract + component |
| Pagination limit/offset and active/inactive filters map only to supported API queries | Edge | Unit/component + contract |
| Empty supplier list renders empty state | Edge | Unit/component |

**Sign-off:** Architecture readiness GO and QA kickoff GO recorded on 2026-05-19. Implementation MAY begin under the constraints in this story.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| `ValidationError` | API/shared response envelope | `apps/backoffice` | N/A | Must map by response `code` and message, not `instanceof` |
| `PermissionError` | API/auth response envelope | `apps/backoffice` | N/A | Must map 403 response `code`, not `instanceof` |
| `NotFoundError` | API/purchasing response envelope | `apps/backoffice` | N/A | Must map 404 response `code`, not `instanceof` |

## Cross-Module Decision Gate

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|------------------|-----------|-------------------------|-----------------|
| 1 | Supplier screens consume only `/api/purchasing/suppliers` and contacts subroutes | `apps/backoffice`, `apps/api`, `purchasing` | Keeps slice bounded and contract-verifiable | Include orders/invoices (rejected: too broad) | Winston GO — exact supplier/contact API envelopes, ACL mapping, fixture constraints, filter semantics, and deactivate semantics recorded on 2026-05-19. |

## API Contract Verification

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/purchasing/suppliers` | GET | `{ success: true, data: { suppliers, total, limit, offset } }` | Yes — route/source verified | Query: `search`, `is_active`, `limit`, `offset`. Omitted `is_active` maps to active suppliers only; `is_active=false` maps to inactive suppliers. No explicit all-suppliers query is present. |
| `/api/purchasing/suppliers` | POST | `201 { success: true, data: supplier }` | Yes — route/source verified | Request body MUST include `company_id`; backend rejects `company_id !== auth.companyId` with 403. |
| `/api/purchasing/suppliers/:id` | GET | `{ success: true, data: supplier }` | Yes — route/source verified | Detail/drawer source. |
| `/api/purchasing/suppliers/:id` | PATCH | `{ success: true, data: supplier }` | Yes — route/source verified | Edit/reactivate/deactivate via `is_active` PATCH uses UPDATE permission. |
| `/api/purchasing/suppliers/:id` | DELETE | `{ success: true, data: { success: true } }` | Yes — route/source verified | Soft-deactivate/delete uses DELETE permission. Backend does not accept a reason body. |
| `/api/purchasing/suppliers/:supplierId/contacts` | GET | `{ success: true, data: { contacts } }` | Yes — route/source verified | Supplier ownership is verified against authenticated company before listing. |
| `/api/purchasing/suppliers/:supplierId/contacts` | POST | `201 { success: true, data: contact }` | Yes — route/source verified | Uses `purchasing.suppliers` CREATE permission. |
| `/api/purchasing/suppliers/:supplierId/contacts/:id` | GET | `{ success: true, data: contact }` | Yes — route/source verified | Supplier ownership is verified against authenticated company before detail lookup. |
| `/api/purchasing/suppliers/:supplierId/contacts/:id` | PATCH | `{ success: true, data: contact }` | Yes — route/source verified | Uses `purchasing.suppliers` UPDATE permission. |
| `/api/purchasing/suppliers/:supplierId/contacts/:id` | DELETE | `{ success: true, data: { success: true } }` | Yes — route/source verified | Uses `purchasing.suppliers` DELETE permission. |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| Deactivate reason not accepted by backend | UI MUST NOT claim backend-stored deactivate reason for suppliers/contacts | Confirmation MAY explain effect; reason input MUST NOT be sent unless backend contract changes in a later story. |
| No explicit all-suppliers filter contract | EntityTable status filter MUST map to supported active/inactive queries only | Implement active and inactive filters against `is_active`; document all-suppliers as unavailable unless API adds it. |
| `createSupplierFixture()` currently uses nondeterministic `Date.now()` and generated code slicing | Integration/contract tests MUST NOT use that fixture default path until remediated | Story 69-2-a tests MUST use Full Fixture Mode through API/production flow, or fixture remediation MUST happen first in owner package. |

## Acceptance Criteria

**AC1:** Supplier list uses EntityTable with search, status filter, pagination, loading, error, and empty states.  
**AC2:** Supplier create/edit uses ReviewPanel, scoped draft keys, validation, and final review.  
**AC3:** Supplier detail drawer displays supplier fields and contacts.  
**AC4:** Contacts can be listed, created, edited, and removed under a supplier.  
**AC5:** Permission gates hide create/edit/delete actions when the user lacks `purchasing.suppliers` permission, and direct API attempts return 403.  
**AC6:** All errors render machine-readable code and human-readable message from standard API envelope.

## ACL Mapping

| UI/API action | Permission |
|---------------|------------|
| Supplier list/detail | `purchasing.suppliers` READ |
| Supplier create | `purchasing.suppliers` CREATE |
| Supplier edit/reactivate/deactivate via PATCH | `purchasing.suppliers` UPDATE |
| Supplier soft-delete/deactivate via DELETE | `purchasing.suppliers` DELETE |
| Contact list/detail | `purchasing.suppliers` READ |
| Contact create | `purchasing.suppliers` CREATE |
| Contact edit | `purchasing.suppliers` UPDATE |
| Contact delete | `purchasing.suppliers` DELETE |

Negative authorization tests MUST use `CASHIER` or a custom low-privilege role without the target permission.

## Fixture Mode

- Full Fixture Mode is required for Story 69-2-a UI/API setup.
- Tests MUST use API/production flows for supplier and contact setup unless owner-package fixture remediation is completed first.
- Current `@jurnapod/modules-purchasing` supplier fixture defaults are not acceptable for new tests because they use `Date.now()` and post-generation slicing. If fixture usage is required, remediation MUST occur in `packages/modules/purchasing/src/test-fixtures/supplier.ts` before test implementation.
- No raw SQL `INSERT`/`UPDATE` setup is allowed.

## Tasks / Subtasks

- [x] Verify supplier and contact API contracts directly.
- [x] Implement supplier list route/page.
- [x] Implement supplier create/edit ReviewPanel form.
- [x] Implement supplier detail drawer with contacts.
- [x] Implement contact list/create/edit/delete UI.
- [x] Add permission-aware actions.
- [x] Add unit/component tests.
- [x] Add API integration/contract tests for direct ACL denial, company mismatch, invalid payloads, duplicate supplier code, wrong-supplier contact access, and supported filters.

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/backoffice/src/features/purchasing/suppliers/*` | Create supplier UI feature files |
| `apps/backoffice/src/hooks/use-purchasing-suppliers.ts` | Create query/mutation hooks if needed |
| `apps/backoffice/src/app/router/routes.tsx` or active route registry | Modify route entries if needed |
| `apps/backoffice/__test__/unit/features/purchasing-suppliers.test.tsx` | Create tests |
| `apps/api/__test__/integration/purchasing/suppliers.test.ts` | Create or extend API integration/contract coverage for ACL, tenant mismatch, validation, duplicate, and contact scoping |

## Validation Commands

```bash
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/purchasing-suppliers.test.tsx
npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/suppliers.test.ts
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

Implementation evidence MUST run long-running validation commands with background PID/log tracking per project Test Log Rule, for example `nohup <command> > logs/<story>-<gate>.log 2>&1 & echo $! > logs/<story>-<gate>.pid` followed by PID polling and log inspection.

If implementation remediates `packages/modules/purchasing/src/test-fixtures/supplier.ts`, validation MUST also include:

```bash
npm run build -w @jurnapod/modules-purchasing
npm run build:libs
npm run lint:fixture-flow
```

## Dependencies

- 69-2-e MUST be done.
- Story 69-1 MUST be done.
- Backoffice unfreeze MUST remain approved.
- Story 69-2-a backoffice unfreeze is approved by Ahmad on 2026-05-19.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.

## Dev Notes

- Implemented backoffice supplier management under `#/purchasing/suppliers` using canonical runtime API base `/api/purchasing` through `apiRequest("/purchasing/...")`.
- Supplier list supports search, active/inactive-only status filters, limit/offset pagination, loading/error/empty states, and permission-gated create/edit/deactivate/reactivate actions.
- Supplier create/edit uses `ReviewPanel` with scoped autosave draft keys (`purchasing-supplier-create` / `purchasing-supplier-edit`) and includes `company_id` on POST payloads.
- Supplier detail drawer displays supplier fields and contacts. Contacts can be created, edited, and deleted under the selected supplier.
- Deactivate confirmation sends only backend-supported `DELETE /purchasing/suppliers/:id`; no reason body is sent or claimed as stored.
- Permission gates use `purchasing.suppliers` READ/CREATE/UPDATE/DELETE. API integration coverage uses CASHIER for direct denial tests.
- Fixture mode: API integration setup uses Full Fixture Mode through authenticated HTTP API production flows for suppliers and contacts. Raw SQL remains cleanup-only in existing `afterAll` teardown.

## Files Modified / Created

- `apps/backoffice/src/features/purchasing/suppliers/api.ts`
- `apps/backoffice/src/features/purchasing/suppliers/index.tsx`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/__test__/unit/features/purchasing-suppliers.test.tsx`
- `apps/api/__test__/integration/purchasing/suppliers.test.ts`
- `_bmad-output/implementation-artifacts/stories/epic-69/story-69-2-a.md`

## Implementation Status

- Implementation is validated, reviewer GO is recorded, and Ahmad owner sign-off is complete.
- Story is `done`.
