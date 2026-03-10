# Accounts & Account Types Simplification Plan

## Overview

This plan addresses usability issues in the Chart of Accounts (COA) management system, focusing on making accounts and account types easier to use while maintaining accounting correctness.

## Problems Identified

1. **Normal Balance Inconsistency** - UI sends `D | C`, but schema expects `D | K`
2. **Account Type Filtering Broken** - Always fetches active-only, ignoring "Show Inactive" toggle
3. **Confusing Form UX** - Mixes normalized `account_type_id` with legacy editable fields
4. **Tree Search UX** - Matches hidden behind collapsed parents
5. **Inactive Type Visibility** - Can't see type names when linked type is inactive
6. **No Inheritance** - Users must manually set type on every account
7. **Over-Engineering** - Runtime dependency on `account_types` table for classification

## Design Decisions

### Normal Balance Values
- **Decision**: Standardize on `D | K` (Debit/Kredit) across all layers
- **Rationale**: Matches Indonesian accounting convention, aligns with shared schema

### Runtime Source of Truth: Accounts Table
- **Decision**: `accounts` table becomes the source of truth for classification
- **Behavior**:
  - Each account has `normal_balance`, `report_group`, and optional `type_name` directly
  - Parent defines these fields; children inherit unless explicitly overridden
  - No runtime dependency on `account_types` table for posting/reporting
- **Rationale**: Simpler mental model, removes coupling, eliminates mismatch bugs

### Account Types: Optional Templates Only
- **Decision**: `account_types` becomes optional template/master-data (not required for runtime)
- **Behavior**:
  - Can create types as reusable templates
  - Selecting a template copies values into account fields (one-time default)
  - Account can override after selection
  - No hard dependency from account operations to active/inactive template state
- **Rationale**: Keeps governance convenience without runtime coupling

### Parent Classification Inheritance
- **Decision**: Nearest ancestor wins
- **Behavior**:
  - If `normal_balance`, `report_group`, `type_name` are omitted/null → inherit from nearest ancestor
  - If provided → explicit override, stable across parent changes
- **Rationale**: Simplifies bulk COA setup, maintains audit trail

### Account Form UX
- **Decision**: Classification fields (`type_name`, `normal_balance`, `report_group`) are primary inputs
- **Behavior**:
  - "Inherit from parent" option (empty/null)
  - Optional template selector can prefill values
  - Explicit values stored directly in account row
- **Rationale**: Clear source of truth, no hidden magic

## Implementation

### Phase 1: Service Layer (Runtime Truth in Accounts)

#### 1.1 Classification Inheritance Logic
- Add `findNearestAncestorWithClassification()` method to find nearest ancestor with classification fields
- On create: derive `type_name`, `normal_balance`, `report_group` from nearest ancestor if not provided
- On update:
  - if fields omitted → keep current
  - if fields explicitly provided → override
  - if parent changes while inheriting → recompute from new ancestor
- Files:
  - `packages/modules/accounting/src/accounts-service.ts`

#### 1.2 Remove Runtime Dependency on account_types
- Service should NOT require `account_type_id` for any account operation
- `account_type_id` becomes optional metadata link only (for templates)
- Reports and filters use `accounts.normal_balance`, `accounts.report_group` directly
- Files:
  - `packages/modules/accounting/src/accounts-service.ts`

#### 1.3 Backward Compatibility
- Keep accepting `account_type_id` in API for existing clients
- If `account_type_id` provided, derive classification fields from it (as template)
- But do NOT require it for any operation

### Phase 2: API & Schemas

#### 2.1 Update Account Schemas
- Make `account_type_id` optional in create/update requests
- Treat `type_name`, `normal_balance`, `report_group` as explicit classification fields
- Support inheritance via null/omission
- Files:
  - `packages/shared/src/schemas/accounts.ts`

#### 2.2 Keep Account Types Endpoints
- Keep CRUD for templates (optional feature)
- Add "Apply template" behavior documentation
- No runtime enforcement of template state

### Phase 3: UI Simplification

#### 3.1 Accounts Form Primary Inputs
- Show `type_name`, `normal_balance`, `report_group` as direct inputs
- "Inherit from parent" option (empty/null)
- Optional template dropdown that pre-fills values
- Show effective preview: "Override" vs "Inherited from: [parent]"
- Files:
  - `apps/backoffice/src/features/accounts-page.tsx`

#### 3.2 Tree Search Auto-Expand
- When search term present, auto-expand all branches containing matches
- Preserve manual expand/collapse when search is empty
- Files:
  - `apps/backoffice/src/features/accounts-page.tsx`

#### 3.3 Account Types Page
- Keep for template management (optional feature)
- "Show Inactive" and search work correctly
- Files:
  - `apps/backoffice/src/features/account-types-page.tsx`
  - `apps/backoffice/src/hooks/use-accounts.ts`

### Phase 4: Verification

#### 4.1 Inheritance Scenarios
- [ ] Create child account with no classification → inherits from parent
- [ ] Create child account with explicit classification → uses explicit values
- [ ] Change parent of inheriting child → recomputes from new ancestor
- [ ] Change parent of overriding child → keeps explicit values
- [ ] Clear override → re-inherits from parent
- [ ] Reparent to account with no classification → walks up further ancestors

#### 4.2 Template Behavior
- [ ] Select template in form → pre-fills classification fields
- [ ] After selecting template, can still override values
- [ ] Account type status (active/inactive) does not affect account operations

#### 4.3 Reports & Filters
- [ ] Trial balance groups by account classification correctly
- [ ] P&L/Balance Sheet filters work without requiring account_type_id
- [ ] Existing accounts with account_type_id still display correctly

#### 4.4 Static Checks
- [ ] `npm run typecheck` passes for all packages

## API Endpoints

### Account Types (Templates - Optional)
```
GET    /api/accounts/types?company_id=X&is_active=true|false&search=Y&category=Z
POST   /api/accounts/types
PUT    /api/accounts/types/:id
DELETE /api/accounts/types/:id
```

### Accounts (Runtime Source of Truth)
```
GET    /api/accounts?company_id=X
GET    /api/accounts/tree?company_id=X&include_inactive=true|false
POST   /api/accounts
PUT    /api/accounts/:id
DELETE /api/accounts/:id
POST   /api/accounts/:id/reactivate
```

## Database Schema

### account_types (Optional Templates)
| Column         | Type           | Description                    |
|----------------|----------------|--------------------------------|
| id             | BIGINT         | Primary key                    |
| company_id     | BIGINT         | Tenant scope                   |
| name           | VARCHAR(191)   | Template name (e.g., "Kas")   |
| category       | VARCHAR(20)    | ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE |
| normal_balance | CHAR(1)        | D or K                         |
| report_group   | VARCHAR(8)     | NRC or PL                      |
| is_active      | TINYINT        | Soft delete                    |

### accounts (Runtime Source of Truth)
| Column             | Type           | Description                    |
|--------------------|----------------|--------------------------------|
| id                 | BIGINT         | Primary key                    |
| company_id         | BIGINT         | Tenant scope                   |
| code               | VARCHAR(32)    | Account code                   |
| name               | VARCHAR(191)   | Account name                   |
| type_name          | VARCHAR(191)   | Classification name (optional)  |
| normal_balance     | CHAR(1)        | D or K (inherited if null)    |
| report_group       | VARCHAR(8)     | NRC or PL (inherited if null) |
| account_type_id    | BIGINT         | FK to template (optional)      |
| parent_account_id  | BIGINT         | Self-referential FK            |
| is_group           | TINYINT        | Can have children              |
| is_payable         | TINYINT        | Payment destination             |
| is_active          | TINYINT        | Soft delete                    |

## Migration Considerations

No schema changes required for Phase 1-4. All changes are application-level:

1. Service layer handles inheritance logic from accounts table
2. UI layer uses direct classification fields
3. account_types table remains for template use
4. Backward compatible with existing data

## Future (Optional)

Later migrations could optionally:
- Remove `account_type_id` column if templates are not used
- Clean up `account_types` table if unused
- Add import/export for template sharing

## Rollback Strategy

All changes are backward-compatible:
- Classification columns still work
- account_types still accessible
- Old API calls still work
- UI gracefully handles all states

To rollback: revert code changes, no data migration needed.

## Implementation Status

### Completed ✅

1. **Normal Balance Normalization** - Fixed `D/C` → `D/K` in UI forms
2. **Account Type Filtering** - Server-side filtering with `showInactive` and `search`
3. **Auto-Expand Tree Search** - Matches visible when searching
4. **Accounts-First Runtime Model** - Classification from `accounts` table as primary source
5. **Parent Inheritance** - Nearest ancestor classification is inherited (per-field)
6. **Direct Classification Inputs** - UI shows type_name, normal_balance, report_group as primary inputs
7. **Template Pre-fill** - Account type dropdown pre-fills classification fields
8. **Schema Updates** - Clear documentation in schemas about inheritance behavior
9. **Reports Compatibility** - Reports use accounts.report_group directly (safe fallback to account_types)
10. **P&L Report Group Fix** - P&L accepts both `PL` and `LR` for backward compatibility
11. **Form Submission Fix** - Classification fields now submitted in create/update payloads
12. **Reparent Inheritance Logic** - Added "likely inherited" detection to recompute on parent change when values match old ancestor
13. **Category Filter Restored** - API route now accepts category query parameter
14. **Per-Field Inheritance** - Each classification field resolves independently (explicit > template > parent)

### Compatibility Notes

- **Legacy `LR` Support**: 
  - Canonical value is `PL` (Laba Rugi).
  - Database may still contain `LR` values during compatibility window.
  - `listAccounts({ report_group: "PL" })` returns both `PL` and `LR` rows.
  - P&L report includes both `PL` and `LR` accounts.
  - API responses normalize `LR` → `PL` via `normalizeReportGroup()`.
- **Per-Field Inheritance**: On create, each classification field (`type_name`, `normal_balance`, `report_group`) is resolved independently. Example: providing `type_name` but omitting `normal_balance` will use explicit `type_name` and inherit `normal_balance` from template/parent.
- **Update Inheritance**: When clearing classification fields (`null`), the system attempts to inherit from template (if `account_type_id` provided) or parent. Template inheritance works even for root accounts (no parent required).
- **Reparent-to-Root Behavior**: When an inheriting account is reparented to root (`parent_account_id = null`), unresolved classification fields are cleared to `null` (unless template provides values). This ensures stale inherited values don't persist on root accounts.
- **Runtime Source of Truth**: `accounts` table is the runtime source. `account_types` table is optional template metadata only.

### Testing Notes

- Integration tests verify via actual API endpoints (`GET /api/accounts`, `PUT /api/accounts/:id`):
  - `GET /api/accounts?report_group=PL` returns both `PL` and `LR` rows (backward compatibility)
  - `GET /api/accounts?report_group=NRC` returns strict NRC only
  - `PUT /api/accounts/:id` with explicit override preserves values when reparenting
  - `PUT /api/accounts/:id` reparent-to-root clears inherited classification when no template
  - `PUT /api/accounts/:id` root account with template fills classification fields (no parent required)
- All tests use strict assertions (status must be 200, success must be true).
- Tests fail immediately on API regression, no soft-pass fallback.

### Files Changed

- `packages/modules/accounting/src/accounts-service.ts` - Service logic, per-field inheritance, LR→PL normalization, reparent-to-root fix
- `packages/modules/accounting/src/account-types-service.ts` - LR→PL normalization in response mapping
- `packages/shared/src/schemas/accounts.ts` - Schema documentation, per-field inheritance notes
- `apps/backoffice/src/features/accounts-page.tsx` - UI form, classification field submission, tree display priority
- `apps/backoffice/src/features/account-types-page.tsx` - Template page wording
- `apps/backoffice/src/hooks/use-accounts.ts` - Filter hooks
- `apps/api/src/lib/reports.ts` - P&L query accepts PL and LR
- `apps/api/app/api/accounts/types/route.ts` - Category filter parameter
- `apps/api/tests/integration/accounts.classification.integration.test.mjs` - Classification and inheritance tests

## References

- Schema: `packages/db/migrations/0016_add_accounts_is_active.sql`, `packages/db/migrations/0017_create_account_types.sql`
- Shared schemas: `packages/shared/src/schemas/accounts.ts`, `packages/shared/src/schemas/account-types.ts`
- Services: `packages/modules/accounting/src/accounts-service.ts`, `packages/modules/accounting/src/account-types-service.ts`
- UI: `apps/backoffice/src/features/accounts-page.tsx`, `apps/backoffice/src/features/account-types-page.tsx`
