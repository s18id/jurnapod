# Story 66-5: Audit Log Explorer

Status: planned (queued — execution requires explicit `apps/backoffice` unfreeze for Epic 66)

## Story

As a **company administrator or auditor**,  
I want **an audit log explorer with filters and detail drawer**,  
So that **administrative and security-relevant changes can be inspected by actor, action, object, date range, and scope**.

## Scope Boundary

- This story is PLANNING-ONLY until Ahmad explicitly lifts the `apps/backoffice` freeze for Epic 66.
- Audit log reads MUST be tenant-scoped by authenticated company/outlet context where applicable.
- Audit log filtering MUST use `success`, not `result`, if the backend exposes the canonical audit table shape.
- This story MUST NOT introduce audit write paths.

## Context

Epic 66 core admin needs audit visibility for user, role, company, and outlet changes. This story consumes Epic 65 `EntityTable`, `FilterBar`, `DetailDrawer`, typed API client, and TanStack Query. It depends on Story 66-4 permission-aware routing.

---

## Pre-Implementation Gates

| Gate | Required State |
|------|----------------|
| Story 66-4 | Permission-aware navigation and route guard pattern available |
| API contract | Audit list/detail filters verified |
| Date handling | Half-open interval conversion policy documented for audit date range |
| ACL | Required permission for audit explorer verified (`platform.settings.READ`, `platform.users.READ`, or explicit audit resource) |

## Test Scenario Review Checkpoint

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Actor/action/date/object filters produce query key and typed request | Happy | Unit |
| Date range uses half-open interval semantics | Edge | Unit |
| Detail drawer renders before/after payload diff | Happy | Unit/component |
| Empty audit list renders empty state | Edge | Unit/component |
| User lacks required audit READ permission | Auth | Unit with low-privilege role |
| Backend returns malformed payload | Error | Unit typed-client boundary |

---

## API Contract Verification (MANDATORY before implementation)

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|----------|-------|
| `/api/audit-logs` | GET | `{ data: AuditLogEntry[], pagination: Pagination }` | ❌ | Verify filter support |
| `/api/audit-logs/:id` | GET | `{ data: AuditLogDetail }` | ❌ | Verify detail payload availability |
| `/api/users` | GET | User selector source | ❌ | Required for actor filter if no dedicated actor endpoint |

### API Gaps Found

| Gap | Impact | Resolution |
|-----|--------|------------|
| TBD after verification | TBD | Story MUST block or document approved workaround |

---

## Acceptance Criteria

**AC1: Audit List**  
Given an authorized user opens the audit explorer,  
When audit data loads,  
Then `EntityTable` MUST render timestamp, actor, action, object type, object ID, summary, and scope columns.

**AC2: Filter Support**  
Given filters for actor, action, date range, object type, and company/outlet scope,  
When the user applies filters,  
Then the typed query MUST request the filtered audit list and TanStack Query MUST refresh using a deterministic query key.

**AC3: Date Range Correctness**  
Given a date range filter,  
When request parameters are generated,  
Then filtering MUST use half-open interval semantics: `col >= startUTC AND col < nextDayUTC`.

**AC4: Detail Drawer**  
Given an audit entry has detail payload,  
When the row opens in a drawer,  
Then `DetailDrawer` MUST show actor details, object details, and before/after diff where available.

**AC5: Pagination**  
Given the audit list loads,  
When no page size is selected,  
Then default page size MUST be 25.

**AC6: Authorization UX**  
Given a user lacks the required audit READ permission,  
When they navigate to the audit explorer,  
Then route guard MUST deny access and action affordances MUST not render.

**AC7: Canonical Audit Field**  
Given audit log status filtering is implemented,  
When code references audit success/failure,  
Then it MUST filter by `success` and MUST NOT filter by `result`.

---

## Tasks / Subtasks

- [ ] Verify audit log API contract and supported filters.
- [ ] Identify canonical audit permission resource.
- [ ] Create audit query key and typed query hook.
- [ ] Create audit filter schema with actor, action, date range, object type, scope.
- [ ] Implement half-open date range parameter conversion using canonical helpers.
- [ ] Create audit list route with `EntityTable` and `FilterBar`.
- [ ] Create audit detail drawer with before/after diff rendering.
- [ ] Add unit tests for filters, query keys, date range conversion, empty/error states, and authorization denial.

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/routes/admin/audit.tsx` | Audit explorer route component |
| `apps/backoffice/src/features/audit/` | Audit explorer feature module |
| `apps/backoffice/__test__/unit/features/audit.test.ts` | Audit explorer unit tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/app/router/routes.tsx` | Modify | Add audit route metadata if missing |
| `apps/backoffice/src/lib/api/client.ts` | Modify | Add typed wrappers only if generated paths are insufficient |

## Estimated Effort

3–4 days

## Risk Level

Medium

## Dependencies

- Story 66-4 permission-aware route guard pattern.
- Explicit Epic 66 backoffice unfreeze approval.
- Audit API contract verification.

## Validation Evidence Required

- `npm run lint -w @jurnapod/backoffice`
- `npm run typecheck -w @jurnapod/backoffice`
- `npm run build -w @jurnapod/backoffice`
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts`
- `npm run test:unit -w @jurnapod/backoffice`

## Technical Debt Review

- [ ] No audit write paths introduced.
- [ ] No filtering by `result` instead of `success`.
- [ ] No manual ISO string slicing for business date extraction.
- [ ] No tenant-scope ambiguity in displayed audit rows.
