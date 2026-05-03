# Epic 39 Retrospective — Resource-Level ACL

**Date:** 2026-04-13
**Epic:** 39 — Resource-Level ACL Implementation
**Status:** ✅ Complete

---

## Story Summary

| Story | Title | Status |
|-------|-------|--------|
| 39.1 | Shared Package Foundation | done |
| 39.2 | Auth Package Updates | done |
| 39.3 | Database Schema Migration | done |
| 39.3b | Data Migration | done |
| 39.4 | Platform Module | done |
| 39.5 | Accounting Module | done |
| 39.6 | Inventory Module | done |
| 39.7 | Treasury Module | done |
| 39.8 | Sales Module | done |
| 39.9 | POS Module | done |
| 39.10 | Reservations Module | done |
| 39.11 | Verification & Cleanup | done |

---

## What Went Well

**1. Canonical ACL model delivered without regressions.** All 12 stories (39.1–39.11 + 39.3.5) completed. Post-completion verification (2026-04-13): 6 test files, 45 tests passed. Typecheck on 10 packages and build on 4 core packages all passed (story-39.11.md).

**2. Resource-level permissions (`module.resource` format) cleanly established across all modules.** Evidence: RESOURCE_CODES constants added for 21 resources across 7 modules (story-39.1.md); all routes updated to use explicit resource parameter (stories 39.4–39.10).

**3. 6-bit permission system with clear semantics.** READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32 defined in epic-39.md charter. REPORT → ANALYZE rename preserved value 16 with clearer semantics (story-39.1.md). CRUDAM mask (63) added (story-39.1.md).

**4. Database enforcement of `resource IS NOT NULL` via migration 0158.** Schema migration 0147 added `resource` column (VARCHAR(64), NULL) with unique constraint on `(company_id, role_id, module, resource)` and index on `resource` (story-39.3.md). Migration 0158 enforced the NOT NULL constraint (epic-39.retrospective.md).

**5. Incremental story structure kept scope manageable.** Phase 1 (Foundation: shared package, auth, DB schema, data migration) preceded Phase 2 (module-by-module route updates). Phase 3 verification caught residual `reports` module references via grep checks (story-39.11.md).

**6. Centralized permission matrix constant.** All module permission matrices reference `packages/modules/platform/src/companies/constants/permission-matrix.ts`, providing a single source of truth for role-permission assignments across all modules (stories 39.4–39.10).

**7. Backward compatibility maintained during transition.** Data migration 0147.5 preserved old entries while creating new `module.resource` entries (e.g., 1224 rows each for `platform.users`, `platform.roles`, `platform.companies`, `platform.outlets`, `accounting.accounts`, `accounting.journals`, `treasury.transactions`) (story-39.3.5.md).

## What Could Improve

**1. Retrospective not created at epic close.** The `epic-39-retrospective.md` file existed but was not populated at epic close. Epic-39.retrospective.md was created retroactively as a separate artifact. Process gap: the retrospective artifact template was present but not filled in when the epic was marked complete.

**2. `treasury.accounts` resource in matrix without API routes.** The permission matrix includes `treasury.accounts` resource (story-39.7.md), but no corresponding routes exist in the API — accounts are managed via `accounting.accounts`. This created a slight misalign between the permission matrix and the actual route structure.

**3. `sales.credit_notes` not covered.** Credit notes route (`sales/credit-notes.ts`) had no existing `requireAccess` and was not in scope for story 39.8 (sales module). This means resource-level ACL does not currently guard credit note operations.

**4. Permission matrix adjustment for COMPANY_ADMIN on inventory.** COMPANY_ADMIN permissions for `inventory.items` and `inventory.stock` were downgraded from CRUDA to CRUD (story-39.6.md) — an intentional trade-off documented in the story, but worth noting as a departure from the original matrix design in the charter.

## Action Items (Max 2)

1. **Owner:** bmad-dev / platform team
   **Deadline:** Next epic retro
   **Success Criterion:** `treasury.accounts` resource either removed from permission matrix or `treasury/accounts` routes added with proper `requireAccess` guards — no orphaned resources in the matrix without route coverage.

2. **Owner:** bmad-dev / sales module owner
   **Deadline:** Next epic retro
   **Success Criterion:** `sales.credit_notes` route has explicit `requireAccess({ module: 'sales', resource: 'credit_notes', permission: 'READ' })` and appropriate write permission for create/update operations.

## Deferred Items

- `sales.credit_notes` ACL coverage — identified in story 39.8 completion notes as out of scope, not yet actioned
- `treasury.accounts` route-vs-matrix misalignment — identified in story 39.7 completion notes, not yet resolved

---

*Retrospective complete. Epic 39 closed.*