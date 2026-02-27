# Company Management: SUPER_ADMIN + Soft Delete

## Goal
Enable safe cross-tenant company management using a SUPER_ADMIN role, with soft delete (deactivation) that blocks access for deactivated companies and preserves historical data.

## Decisions
- Use SUPER_ADMIN for cross-tenant company creation and management.
- Use soft delete for companies (`deleted_at`) and block access when deactivated.
- Standardize API responses to `{ success: true, data }` and `{ success: false, error }`.
- SUPER_ADMIN can view archived companies via an include flag or UI toggle.
- Deactivate only when there are no dependent operational/financial records.
- Reactivation is allowed for SUPER_ADMIN and is audited.

## Scope
- API: company CRUD, auth/login, auth guard role checks, auditing, response envelopes.
- DB: migration for `companies.deleted_at`.
- Backoffice: company UI updates (SUPER_ADMIN controls, archived toggle), role support, hook adjustments.

## Out of Scope
- New admin UX for super-admin creation outside backoffice.
- Global refactor of all API endpoints to the new response envelope (only company-related endpoints).
- Automated tests (optional follow-up).

## Implementation Plan (Todo)

1) Role support (SUPER_ADMIN)
- [x] Update `packages/shared/src/schemas/common.ts` to include SUPER_ADMIN in `RoleSchema`.
- [x] Update `apps/api/src/lib/auth.ts` to include SUPER_ADMIN in `ROLE_CODES`.
- [x] Update `apps/backoffice/src/lib/session.ts` `RoleCode` union to include SUPER_ADMIN.
- [ ] Ensure role assignment endpoints accept SUPER_ADMIN (rely on shared `RoleSchema`).

2) Soft delete schema
- [x] Add migration `packages/db/migrations/0034_companies_soft_delete.sql` (add `deleted_at` + index).
- [x] Update shared response schema: `packages/shared/src/schemas/companies.ts` add `deleted_at`.

3) Company query scoping
- [ ] Update `apps/api/src/lib/companies.ts` queries to exclude `deleted_at IS NULL` by default.
- [ ] Allow SUPER_ADMIN to include deleted via `include_deleted` flag.

4) Login/access blocking
- [ ] Update `apps/api/src/lib/auth.ts` login query to filter `companies.deleted_at IS NULL`.
- [ ] Update `findActiveUserById` / token refresh to reject users from deleted companies.

5) Company endpoints + RBAC
- [ ] `apps/api/app/api/companies/route.ts`
  - [ ] GET: SUPER_ADMIN can list all (optional include_deleted), OWNER scoped to own active company.
  - [ ] POST: SUPER_ADMIN only (create new company).
- [ ] `apps/api/app/api/companies/[companyId]/route.ts`
  - [ ] GET/PATCH: SUPER_ADMIN can access any, OWNER only own active company.
  - [ ] DELETE: SUPER_ADMIN only, soft-deactivate.
- [ ] Add reactivation endpoint: `apps/api/app/api/companies/[companyId]/reactivate/route.ts`.

6) Audit logging
- [ ] Add audit logging in `apps/api/src/lib/companies.ts` for create/update/deactivate/reactivate.
- [ ] Use actor context (userId + ip) from routes (add `readClientIp`).

7) Deactivation safeguards
- [ ] Expand dependency checks in `apps/api/src/lib/companies.ts` to block deactivation if data exists:
  - users, outlets, accounts, pos transactions, journal batches/lines, sales invoices/payments.

8) Response envelope standardization
- [ ] Standardize company endpoints to `{ success: true, data }` and `{ success: false, error }`.
- [ ] Update `apps/backoffice/src/hooks/use-companies.ts` to match new envelopes.

9) Backoffice UI updates
- [ ] `apps/backoffice/src/features/companies-page.tsx`
  - [ ] Show Create/Deactivate/Reactivate only for SUPER_ADMIN.
  - [ ] Add “Show archived” toggle (use `include_deleted=1`).
  - [ ] Label deactivated companies in the list.
- [ ] `apps/backoffice/src/hooks/use-companies.ts`
  - [ ] Accept `includeDeleted` option and pass query param.

10) Verification
- [ ] Run `npm run build` in `apps/api` and `apps/backoffice`.
- [ ] Smoke-test: login blocked for deactivated company; SUPER_ADMIN can list archived and reactivate.

## Notes
- Deactivation must prevent login and API access for the company.
- Archived view should be visible only to SUPER_ADMIN.

## Files In Scope
- `packages/shared/src/schemas/common.ts`
- `packages/shared/src/schemas/companies.ts`
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/companies.ts`
- `apps/api/app/api/companies/route.ts`
- `apps/api/app/api/companies/[companyId]/route.ts`
- `apps/api/app/api/companies/[companyId]/reactivate/route.ts`
- `apps/api/src/lib/request-meta.ts`
- `apps/backoffice/src/lib/session.ts`
- `apps/backoffice/src/hooks/use-companies.ts`
- `apps/backoffice/src/features/companies-page.tsx`
- `packages/db/migrations/0034_companies_soft_delete.sql`
