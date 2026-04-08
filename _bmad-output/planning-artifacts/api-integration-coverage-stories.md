# API Integration Test Expansion Planning Artifact

> **Scope:** apps/api integration tests  
> **Generated:** 2026-04-07  
> **Baseline:** Current coverage analysis of 29 route modules

---

## 1. Current Coverage Baseline

### Existing Integration Tests (8 files)
| File | Module | Endpoints Covered |
|------|--------|-------------------|
| `apps/api/__test__/integration/auth/login.test.ts` | auth | POST /api/auth/login |
| `apps/api/__test__/integration/accounts/crud.test.ts` | accounts | GET, POST, PATCH /api/accounts |
| `apps/api/__test__/integration/journals/crud.test.ts` | journals | GET, POST /api/journals |
| `apps/api/__test__/integration/items/crud.test.ts` | items | GET, POST /api/inventory/items |
| `apps/api/__test__/integration/sales/orders.test.ts` | sales | GET, POST /api/sales |
| `apps/api/__test__/integration/sync/endpoints.test.ts` | sync | GET /api/sync/* |
| `apps/api/__test__/integration/sync/push.test.ts` | sync | POST /api/sync/push |
| `apps/api/__test__/integration/sync/idempotency.test.ts` | sync | client_tx_id handling |

### Coverage Gap: 21 route modules uncovered

---

## 2. Route Inventory (from apps/api/src/app.ts)

| Route | Path Prefix | File | Lines | Auth | Priority |
|-------|-------------|------|-------|------|----------|
| stock | /api/outlets/:outletId/stock | routes/stock.ts | 373 | Yes | P1 |
| sync | /api/sync | routes/sync.ts | ~300 | Mixed | P1 |
| sales | /api/sales | routes/sales.ts | ~400 | Yes | P1 |
| health | /api/health | routes/health.ts | 131 | No | P2 |
| auth | /api/auth | routes/auth.ts | ~200 | Mixed | P1 |
| roles | /api/roles | routes/roles.ts | 257 | Yes | P1 |
| journals | /api/journals | routes/journals.ts | ~300 | Yes | P1 |
| reports | /api/reports | routes/reports.ts | 625 | Yes | P1 |
| accounts | /api/accounts | routes/accounts.ts | ~300 | Yes | P1 |
| companies | /api/companies | routes/companies.ts | 278 | Yes | P2 |
| dinein | /api/dinein | routes/dinein.ts | 191 | Yes | P2 |
| inventory | /api/inventory | routes/inventory.ts | 999 | Yes | P1 |
| users | /api/users | routes/users.ts | 523 | Yes | P1 |
| tax-rates | /api/settings/tax-rates | routes/tax-rates.ts | 350 | Yes | P1 |
| settings/modules | /api/settings/modules | routes/settings-modules.ts | 259 | Yes | P2 |
| settings/module-roles | /api/settings/module-roles | routes/settings-module-roles.ts | 93 | Yes | P2 |
| settings/pages | /api/settings/pages | routes/settings-pages.ts | 316 | Yes | P2 |
| settings/config | /api/settings/config | routes/settings-config.ts | 324 | Yes | P2 |
| outlets | /api/outlets | routes/outlets.ts | 407 | Yes | P1 |
| audit | /api/audit | routes/audit.ts | 198 | Yes | P2 |
| pos/items | /api/pos/items | routes/pos-items.ts | 110 | Yes | P1 |
| pos/cart | /api/pos/cart | routes/pos-cart.ts | 244 | Yes | P1 |
| recipes | /api/inventory/recipes | routes/recipes.ts | 280 | Yes | P2 |
| cash-bank-transactions | /api/cash-bank-transactions | routes/cash-bank-transactions.ts | 271 | Yes | P1 |
| supplies | /api/inventory/supplies | routes/supplies.ts | 300 | Yes | P2 |
| export | /api/export | routes/export.ts | 440 | Yes | P2 |
| import | /api/import | routes/import.ts | 1193 | Yes | P1 |
| progress | /api/operations | routes/progress.ts | 418 | Yes | P2 |
| admin/dashboard | /admin/dashboard | routes/admin-dashboards/*.ts | 336 | Yes | P3 |
| admin/runbook | /admin/runbook.md | routes/admin-runbook.ts | 443 | Yes | P3 |

---

## 3. File Splitting Policy

**Split when ANY of:**
- File exceeds 200 lines
- Contains more than 8 test cases
- Covers more than 2 distinct concerns (CRUD operations, auth, validation, etc.)

**Slice naming convention:**
- `{module}.test.ts` - Main module tests (if small enough)
- `{module}.{operation}.test.ts` - Specific operations (list, create, update, delete)
- `{module}.{concern}.test.ts` - Cross-cutting concerns (auth, tenant-scope, validation)

---

## 4. Backlog Stories by Priority Wave

### Wave 1: Core Operations (P1) - 9 Stories

#### Story API-INT-001: Users Module Integration Tests
**Priority:** P1 | **Module:** users | **Routes:** 11 endpoints

**New Test Files:**
```
apps/api/__test__/integration/users/
├── list.test.ts          # GET /users
├── me.test.ts            # GET /users/me
├── get-by-id.test.ts     # GET /users/:id
├── create.test.ts        # POST /users
├── update.test.ts        # PATCH /users/:id
├── roles.test.ts         # POST /users/:id/roles
├── outlets.test.ts       # POST /users/:id/outlets
├── password.test.ts      # POST /users/:id/password
├── activate.test.ts      # POST /users/:id/deactivate, /reactivate
└── tenant-scope.test.ts  # Cross-company access validation
```

**Acceptance Criteria:**
- [ ] GET /users returns users scoped to authenticated company
- [ ] GET /users/me returns current user with roles and outlets
- [ ] POST /users creates user with proper role assignment
- [ ] POST /users/:id/roles enforces role level hierarchy (cannot assign higher level)
- [ ] POST /users/:id/password requires update permission
- [ ] Deactivate/reactivate requires delete permission
- [ ] Cross-company access returns 403 for non-SUPER_ADMIN
- [ ] All endpoints enforce module permission bitmask

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/users/
```

---

#### Story API-INT-002: Roles Module Integration Tests
**Priority:** P1 | **Module:** roles | **Routes:** 5 endpoints

**New Test Files:**
```
apps/api/__test__/integration/roles/
├── list.test.ts          # GET /roles
├── get-by-id.test.ts     # GET /roles/:id
├── create.test.ts        # POST /roles
├── update.test.ts        # PATCH /roles/:id
└── delete.test.ts        # DELETE /roles/:id
```

**Acceptance Criteria:**
- [ ] GET /roles lists roles for authenticated company
- [ ] POST /roles creates role with unique code
- [ ] PATCH /roles/:id updates role name only
- [ ] DELETE /roles/:id soft-deletes role
- [ ] Write operations require roles module create/update/delete permissions
- [ ] Cannot modify system roles (SUPER_ADMIN, etc.)

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/roles/
```

---

#### Story API-INT-003: Outlets Module Integration Tests
**Priority:** P1 | **Module:** outlets | **Routes:** 6 endpoints

**New Test Files:**
```
apps/api/__test__/integration/outlets/
├── list.test.ts          # GET /outlets
├── get-by-id.test.ts     # GET /outlets/:id
├── access.test.ts        # GET /outlets/access
├── create.test.ts        # POST /outlets
├── update.test.ts        # PATCH /outlets/:id
├── delete.test.ts        # DELETE /outlets/:id
└── tenant-scope.test.ts  # SUPER_ADMIN cross-company operations
```

**Acceptance Criteria:**
- [ ] GET /outlets lists outlets for authenticated company
- [ ] GET /outlets/access validates outlet access for user
- [ ] POST /outlets creates outlet with valid timezone
- [ ] PATCH /outlets/:id updates outlet fields
- [ ] DELETE /outlets/:id soft-deletes outlet
- [ ] SUPER_ADMIN can create outlets in other companies
- [ ] Non-SUPER_ADMIN cannot access other companies' outlets

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/outlets/
```

---

#### Story API-INT-004: Inventory Module Integration Tests
**Priority:** P1 | **Module:** inventory | **Routes:** 15+ endpoints

**New Test Files:**
```
apps/api/__test__/integration/inventory/
├── items/
│   ├── list.test.ts          # GET /inventory/items
│   ├── get-by-id.test.ts     # GET /inventory/items/:id
│   ├── create.test.ts        # POST /inventory/items
│   ├── update.test.ts        # PATCH /inventory/items/:id
│   ├── delete.test.ts        # DELETE /inventory/items/:id
│   └── variant-stats.test.ts # GET /inventory/variant-stats
├── item-groups/
│   ├── list.test.ts          # GET /inventory/item-groups
│   ├── get-by-id.test.ts     # GET /inventory/item-groups/:id
│   ├── create.test.ts        # POST /inventory/item-groups
│   ├── bulk-create.test.ts   # POST /inventory/item-groups/bulk
│   ├── update.test.ts        # PATCH /inventory/item-groups/:id
│   └── delete.test.ts        # DELETE /inventory/item-groups/:id
└── item-prices/
    ├── list.test.ts          # GET /inventory/item-prices
    ├── active.test.ts        # GET /inventory/item-prices/active
│   ├── get-by-id.test.ts     # GET /inventory/item-prices/:id
    ├── create.test.ts        # POST /inventory/item-prices
    ├── update.test.ts        # PATCH /inventory/item-prices/:id
    ├── delete.test.ts        # DELETE /inventory/item-prices/:id
    └── variant-prices.test.ts # GET /inventory/items/:id/variants/:variantId/prices
```

**Acceptance Criteria:**
- [ ] Item CRUD operations enforce inventory module permissions
- [ ] Item creation validates SKU uniqueness within company
- [ ] Item groups support hierarchical parent-child relationships
- [ ] Bulk item group creation handles conflicts gracefully
- [ ] Item prices enforce outlet scoping (cannot see other outlet prices)
- [ ] Company default prices (outlet_id=null) require global role to manage
- [ ] Price updates validate outlet access for outlet-specific prices
- [ ] Variant stats endpoint returns aggregated variant data

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/inventory/
```

---

#### Story API-INT-005: Stock Module Integration Tests
**Priority:** P1 | **Module:** stock | **Routes:** 4 endpoints

**New Test Files:**
```
apps/api/__test__/integration/stock/
├── levels.test.ts          # GET /outlets/:outletId/stock
├── transactions.test.ts    # GET /outlets/:outletId/stock/transactions
├── low-stock.test.ts       # GET /outlets/:outletId/stock/low
└── adjustments.test.ts     # POST /outlets/:outletId/stock/adjustments
```

**Acceptance Criteria:**
- [ ] GET stock levels returns quantities for outlet's products
- [ ] Stock transactions include pagination and type filtering
- [ ] Low stock alerts return items below threshold
- [ ] POST adjustments creates manual stock adjustment with reason
- [ ] Negative adjustments validate sufficient stock exists
- [ ] All endpoints validate outlet access via path parameter
- [ ] Telemetry middleware captures stock operation metrics

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/stock/
```

---

#### Story API-INT-006: Tax Rates Module Integration Tests
**Priority:** P1 | **Module:** tax-rates | **Routes:** 7 endpoints

**New Test Files:**
```
apps/api/__test__/integration/tax-rates/
├── list.test.ts          # GET /settings/tax-rates
├── get-defaults.test.ts  # GET /settings/tax-rates/default
├── create.test.ts        # POST /settings/tax-rates
├── update.test.ts        # PUT /settings/tax-rates/:id
├── delete.test.ts        # DELETE /settings/tax-rates/:id
├── get-tax-defaults.test.ts # GET /settings/tax-defaults
└── update-tax-defaults.test.ts # PUT /settings/tax-defaults
```

**Acceptance Criteria:**
- [ ] GET tax-rates returns company-scoped tax rates
- [ ] POST tax-rates validates rate_percent is 0-100
- [ ] PUT tax-rates/:id updates rate with validation
- [ ] DELETE prevents deletion of referenced tax rates
- [ ] Tax defaults endpoints manage company default tax rates
- [ ] All endpoints require settings module permissions

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/tax-rates/
```

---

#### Story API-INT-007: Cash Bank Transactions Module Integration Tests
**Priority:** P1 | **Module:** cash-bank | **Routes:** 4 endpoints

**New Test Files:**
```
apps/api/__test__/integration/cash-bank/
├── list.test.ts          # GET /cash-bank-transactions
├── create.test.ts        # POST /cash-bank-transactions
├── post.test.ts          # POST /cash-bank-transactions/:id/post
└── void.test.ts          # POST /cash-bank-transactions/:id/void
```

**Acceptance Criteria:**
- [ ] GET returns transactions scoped to company/outlet
- [ ] POST creates transaction with type (MUTATION, TOP_UP, WITHDRAWAL, FOREX)
- [ ] POST validates source and destination accounts exist
- [ ] POST validates fiscal year is open
- [ ] Posting creates journal entries via treasury module
- [ ] Voiding reverses posted transactions
- [ ] Both posting and voiding require cash_bank module create permission

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/cash-bank/
```

---

#### Story API-INT-008: Reports Module Integration Tests
**Priority:** P1 | **Module:** reports | **Routes:** 8 endpoints

**New Test Files:**
```
apps/api/__test__/integration/reports/
├── trial-balance.test.ts       # GET /reports/trial-balance
├── profit-loss.test.ts         # GET /reports/profit-loss
├── pos-transactions.test.ts    # GET /reports/pos-transactions
├── journals.test.ts            # GET /reports/journals
├── daily-sales.test.ts         # GET /reports/daily-sales
├── pos-payments.test.ts        # GET /reports/pos-payments
├── general-ledger.test.ts      # GET /reports/general-ledger
├── worksheet.test.ts           # GET /reports/worksheet
└── receivables-ageing.test.ts  # GET /reports/receivables-ageing
```

**Acceptance Criteria:**
- [ ] Trial balance returns account balances with totals
- [ ] Profit/loss filters by date range and outlet
- [ ] POS transactions support pagination and status filtering
- [ ] Journals endpoint returns batch-level journal data
- [ ] Daily sales aggregates by date with timezone handling
- [ ] General ledger supports account filtering and line-level pagination
- [ ] Worksheet returns trial balance worksheet format
- [ ] Receivables ageing returns invoice ageing buckets
- [ ] All reports enforce module permissions (accounting or pos)
- [ ] Report context validates outlet access

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/reports/
```

---

#### Story API-INT-009: Import Module Integration Tests
**Priority:** P1 | **Module:** import | **Routes:** 4 endpoints

**New Test Files:**
```
apps/api/__test__/integration/import/
├── upload.test.ts        # POST /import/:entityType/upload
├── validate.test.ts      # POST /import/:entityType/validate
├── apply.test.ts         # POST /import/:entityType/apply
├── resume.test.ts        # POST /import/:entityType/apply (resume scenario)
├── template.test.ts      # GET /import/:entityType/template
└── session-expiry.test.ts # Session TTL and checkpoint validation
```

**Acceptance Criteria:**
- [ ] Upload accepts CSV/Excel and returns session ID
- [ ] Upload validates file size (50MB limit)
- [ ] Validate endpoint returns row-level validation errors
- [ ] Batch FK validation validates foreign keys in single query
- [ ] Apply creates/updates items or prices in batches
- [ ] Resume from checkpoint continues from last successful batch
- [ ] Session expiry guard rejects operations near expiry
- [ ] File hash mismatch detection prevents resume with different file
- [ ] Template endpoint returns CSV template for entity type

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/import/
```

---

### Wave 2: Supporting Modules (P2) - 8 Stories

#### Story API-INT-010: Companies Module Integration Tests
**Priority:** P2 | **Module:** companies | **Routes:** 4 endpoints

**New Test Files:**
```
apps/api/__test__/integration/companies/
├── list.test.ts          # GET /companies
├── get-by-id.test.ts     # GET /companies/:id
├── create.test.ts        # POST /companies
└── update.test.ts        # PATCH /companies/:id
```

**Acceptance Criteria:**
- [ ] GET /companies lists all for SUPER_ADMIN, own company for others
- [ ] GET /companies/:id validates company access
- [ ] POST /companies requires SUPER_ADMIN
- [ ] PATCH validates company code uniqueness
- [ ] Company timezone defaults to UTC if not specified

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/companies/
```

---

#### Story API-INT-011: Settings Modules Integration Tests
**Priority:** P2 | **Module:** settings-modules | **Routes:** 4 endpoints

**New Test Files:**
```
apps/api/__test__/integration/settings/
├── modules-list.test.ts          # GET /settings/modules
├── modules-update.test.ts        # PUT /settings/modules
├── modules-extended-list.test.ts # GET /settings/modules/extended
├── modules-extended-update.test.ts # PUT /settings/modules/extended
└── module-roles.test.ts          # PUT /settings/module-roles/:roleId/:module
```

**Acceptance Criteria:**
- [ ] List modules returns company module configurations
- [ ] Update modules enables/disables with config_json
- [ ] Extended endpoints support typed settings (pos_settings, inventory_settings)
- [ ] Module role permissions update requires settings module update permission

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/settings/modules*.test.ts
```

---

#### Story API-INT-012: Settings Config Integration Tests
**Priority:** P2 | **Module:** settings-config | **Routes:** 2 endpoints

**New Test Files:**
```
apps/api/__test__/integration/settings/
├── config-get.test.ts    # GET /settings/config
└── config-update.test.ts # PATCH /settings/config
```

**Acceptance Criteria:**
- [ ] GET config returns outlet settings with company fallback
- [ ] GET validates keys against SETTINGS_REGISTRY
- [ ] PATCH validates values using registry schema
- [ ] Settings fallback chain: outlet → company → registry default

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/settings/config*.test.ts
```

---

#### Story API-INT-013: Settings Pages Integration Tests
**Priority:** P2 | **Module:** settings-pages | **Routes:** 6 endpoints

**New Test Files:**
```
apps/api/__test__/integration/settings/
├── pages-list.test.ts      # GET /settings/pages
├── pages-create.test.ts    # POST /settings/pages
├── pages-update.test.ts    # PATCH /settings/pages/:id
├── pages-publish.test.ts   # POST /settings/pages/:id/publish
├── pages-unpublish.test.ts # POST /settings/pages/:id/unpublish
└── public-pages.test.ts    # GET /pages/:slug
```

**Acceptance Criteria:**
- [ ] Admin pages require settings module permissions
- [ ] Slug validation rejects invalid characters
- [ ] Duplicate slug returns 409 conflict
- [ ] Public pages endpoint requires no auth
- [ ] Public pages only return PUBLISHED status

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/settings/pages*.test.ts
```

---

#### Story API-INT-014: Supplies Module Integration Tests
**Priority:** P2 | **Module:** supplies | **Routes:** 5 endpoints

**New Test Files:**
```
apps/api/__test__/integration/supplies/
├── list.test.ts          # GET /inventory/supplies
├── get-by-id.test.ts     # GET /inventory/supplies/:id
├── create.test.ts        # POST /inventory/supplies
├── update.test.ts        # PATCH /inventory/supplies/:id
└── delete.test.ts        # DELETE /inventory/supplies/:id
```

**Acceptance Criteria:**
- [ ] Supply CRUD operations enforce inventory module permissions
- [ ] SKU uniqueness validated within company
- [ ] Delete prevents removal of referenced supplies

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/supplies/
```

---

#### Story API-INT-015: Recipes Module Integration Tests
**Priority:** P2 | **Module:** recipes | **Routes:** 5 endpoints

**New Test Files:**
```
apps/api/__test__/integration/recipes/
├── ingredients-list.test.ts   # GET /inventory/recipes/:id/ingredients
├── ingredients-create.test.ts # POST /inventory/recipes/:id/ingredients
├── ingredients-update.test.ts # PATCH /inventory/recipes/ingredients/:id
├── ingredients-delete.test.ts # DELETE /inventory/recipes/ingredients/:id
└── cost.test.ts               # GET /inventory/recipes/:id/cost
```

**Acceptance Criteria:**
- [ ] Recipe ingredients CRUD requires inventory module permissions
- [ ] Adding ingredient validates item exists and is active
- [ ] Recipe cost calculation returns ingredient costs
- [ ] Circular recipe references are prevented

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/recipes/
```

---

#### Story API-INT-016: Dine-in Module Integration Tests
**Priority:** P2 | **Module:** dinein | **Routes:** 2 endpoints

**New Test Files:**
```
apps/api/__test__/integration/dinein/
├── sessions.test.ts      # GET /dinein/sessions
└── tables.test.ts        # GET /dinein/tables
```

**Acceptance Criteria:**
- [ ] Sessions endpoint requires outlet_id query param
- [ ] Sessions support status and table filtering
- [ ] Tables endpoint returns table occupancy status
- [ ] Both endpoints validate outlet access
- [ ] POS module read permission required

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/dinein/
```

---

#### Story API-INT-017: POS Cart & Items Module Integration Tests
**Priority:** P2 | **Module:** pos | **Routes:** 3 endpoints

**New Test Files:**
```
apps/api/__test__/integration/pos/
├── item-variants.test.ts # GET /pos/items/:id/variants
├── cart-line.test.ts     # POST /pos/cart/line
└── cart-validate.test.ts # POST /pos/cart/validate
```

**Acceptance Criteria:**
- [ ] Item variants returns active variants with resolved prices
- [ ] Cart line resolves effective price using variant resolver
- [ ] Cart line validates variant belongs to item
- [ ] Cart validate checks stock availability
- [ ] Stock check returns available quantity

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/pos/
```

---

### Wave 3: Utility & Admin (P3) - 5 Stories

#### Story API-INT-018: Export Module Integration Tests
**Priority:** P3 | **Module:** export | **Routes:** 2 endpoints

**New Test Files:**
```
apps/api/__test__/integration/export/
├── items.test.ts         # POST /export/items
├── prices.test.ts        # POST /export/prices
└── columns.test.ts       # GET /export/:entityType/columns
```

**Acceptance Criteria:**
- [ ] Export items returns CSV or Excel based on format param
- [ ] Export supports column selection
- [ ] Export filters by search, type, group_id, is_active
- [ ] Excel limited to 50K rows
- [ ] CSV streaming for >10K rows
- [ ] Columns endpoint returns available columns and defaults

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/export/
```

---

#### Story API-INT-019: Progress Module Integration Tests
**Priority:** P3 | **Module:** progress | **Routes:** 2 endpoints

**New Test Files:**
```
apps/api/__test__/integration/progress/
├── get-progress.test.ts  # GET /operations/:operationId/progress
├── list-progress.test.ts # GET /operations
└── sse.test.ts           # SSE streaming progress updates
```

**Acceptance Criteria:**
- [ ] GET progress returns operation status with percentage and ETA
- [ ] List operations supports status and type filtering
- [ ] SSE endpoint streams real-time updates
- [ ] SSE includes keepalive messages
- [ ] Operation not found returns 404

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/progress/
```

---

#### Story API-INT-020: Audit Module Integration Tests
**Priority:** P3 | **Module:** audit | **Routes:** 2 endpoints

**New Test Files:**
```
apps/api/__test__/integration/audit/
├── period-transitions-list.test.ts   # GET /audit/period-transitions
└── period-transitions-get.test.ts    # GET /audit/period-transitions/:id
```

**Acceptance Criteria:**
- [ ] Period transitions queryable by fiscal_year_id, period_number, action
- [ ] Date range filtering supported
- [ ] Results scoped to authenticated company
- [ ] Settings module read permission required

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/audit/
```

---

#### Story API-INT-021: Health Module Integration Tests
**Priority:** P3 | **Module:** health | **Routes:** 3 endpoints

**New Test Files:**
```
apps/api/__test__/integration/health/
├── health.test.ts        # GET /health
├── live.test.ts          # GET /health/live
└── ready.test.ts         # GET /health/ready
```

**Acceptance Criteria:**
- [ ] Health endpoint returns 200 with subsystem status
- [ ] Detailed mode includes import/export/sync metrics
- [ ] Unhealthy database returns 503
- [ ] Live probe returns 200 without auth
- [ ] Ready probe returns 503 if database unavailable

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/health/
```

---

#### Story API-INT-022: Admin Dashboards Integration Tests
**Priority:** P3 | **Module:** admin-dashboards | **Routes:** 5 endpoints

**New Test Files:**
```
apps/api/__test__/integration/admin/
├── dashboard-sync.test.ts             # GET /admin/dashboard/sync
├── dashboard-financial.test.ts        # GET /admin/dashboard/financial
├── dashboard-reconciliation.test.ts   # GET /admin/dashboard/reconciliation
├── dashboard-trial-balance.test.ts    # GET /admin/dashboard/trial-balance
├── dashboard-period-close.test.ts     # GET /admin/dashboard/period-close-workspace
└── runbook.test.ts                    # GET /admin/runbook.md
```

**Acceptance Criteria:**
- [ ] All dashboard endpoints require settings module read permission
- [ ] Dashboards return HTML with embedded metrics
- [ ] Runbook returns markdown content
- [ ] Metrics are tenant-scoped to authenticated company

**Verify Command:**
```bash
npm run test:integration -- apps/api/__test__/integration/admin/
```

---

## 5. Test File Summary

| Wave | Stories | New Test Files | Est. Lines |
|------|---------|----------------|------------|
| Wave 1 (P1) | 9 | 58 | ~4,500 |
| Wave 2 (P2) | 8 | 32 | ~2,500 |
| Wave 3 (P3) | 5 | 16 | ~1,200 |
| **Total** | **22** | **106** | **~8,200** |

---

## 6. Common Test Patterns

### RWLock Setup (All Integration Tests)
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock } from '../helpers/setup';
import { getTestDb, closeTestDb } from '../helpers/db';
import { createTestCompany, cleanupTestFixtures } from '../fixtures';

describe('module.feature', () => {
  beforeAll(async () => { await acquireReadLock(); });
  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });
});
```

### Auth Helper Pattern
```typescript
import { createTestUser, setupUserPermission, getAuthToken } from '../fixtures';

const user = await createTestUser(company.id);
await setupUserPermission({ 
  userId: user.id, 
  companyId: company.id, 
  roleCode: 'ADMIN', 
  module: 'inventory', 
  permission: 'read' 
});
const token = await getAuthToken(user.id);
```

---

## 7. Sprint Planning Recommendations

### Sprint 1: Core Auth & Users (Stories 001-003)
- Users module (11 endpoints)
- Roles module (5 endpoints)
- Outlets module (6 endpoints)

### Sprint 2: Inventory Foundation (Stories 004-005)
- Inventory items, groups, prices (15+ endpoints)
- Stock management (4 endpoints)

### Sprint 3: Financial Operations (Stories 006-008)
- Tax rates (7 endpoints)
- Cash bank transactions (4 endpoints)
- Reports (8 endpoints)

### Sprint 4: Data Import/Export (Story 009 + 018)
- Import with resume support
- Export with streaming

### Sprint 5: Supporting Modules (Stories 010-017)
- Companies, settings, supplies, recipes
- Dine-in, POS cart

### Sprint 6: Admin & Utilities (Stories 019-022)
- Progress, audit, health
- Admin dashboards

---

## 8. Dependencies & Blockers

| Story | Depends On | Notes |
|-------|------------|-------|
| API-INT-001 | None | Foundation story |
| API-INT-002 | API-INT-001 | Uses user/role fixtures |
| API-INT-003 | API-INT-001 | Uses company fixtures |
| API-INT-004 | API-INT-003 | Requires outlet for stock |
| API-INT-005 | API-INT-004 | Inventory items for stock |
| API-INT-009 | API-INT-004 | Import creates items |
| API-INT-015 | API-INT-004 | Recipes use items |
| API-INT-016 | None | Standalone |
| API-INT-017 | API-INT-004 | Uses item variants |

---

## 9. File Manifest

### Test Infrastructure Files (Required)
```
apps/api/__test__/
├── helpers/
│   ├── setup.ts              # RWLock server management
│   ├── db.ts                 # Test database access
│   └── env.ts                # Test environment
└── fixtures/
    └── index.ts              # Re-exports from src/lib/test-fixtures.ts
```

### New Test Files by Module (106 total)
```
apps/api/__test__/integration/
├── users/                    # 10 files (Story 001)
├── roles/                    # 5 files (Story 002)
├── outlets/                  # 7 files (Story 003)
├── inventory/                # 19 files (Story 004)
│   ├── items/
│   ├── item-groups/
│   └── item-prices/
├── stock/                    # 4 files (Story 005)
├── tax-rates/                # 7 files (Story 006)
├── cash-bank/                # 4 files (Story 007)
├── reports/                  # 9 files (Story 008)
├── import/                   # 6 files (Story 009)
├── companies/                # 4 files (Story 010)
├── settings/                 # 11 files (Stories 011-013)
├── supplies/                 # 5 files (Story 014)
├── recipes/                  # 5 files (Story 015)
├── dinein/                   # 2 files (Story 016)
├── pos/                      # 3 files (Story 017)
├── export/                   # 3 files (Story 018)
├── progress/                 # 3 files (Story 019)
├── audit/                    # 2 files (Story 020)
├── health/                   # 3 files (Story 021)
└── admin/                    # 6 files (Story 022)
```

---

## 10. Verification Checklist

### Per Story
- [ ] All new test files created per splitting policy
- [ ] Each test file has proper RWLock setup
- [ ] Tests use test-fixtures for data setup
- [ ] All acceptance criteria have test coverage
- [ ] Module permission bitmask enforcement tested
- [ ] Tenant isolation (company_id/outlet_id) validated
- [ ] Error responses (400, 403, 404, 409) tested
- [ ] Verify command passes: `npm run test:integration -- <path>`

### Global
- [ ] No test file exceeds 200 lines (or split per policy)
- [ ] All tests pass: `npm run test:integration`
- [ ] Type check passes: `npm run typecheck -w @jurnapod/api`
- [ ] Build passes: `npm run build -w @jurnapod/api`

---

*Generated by BMAD Scrum Master for sprint planning*
