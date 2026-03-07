# ADR-0004: Item Pricing Scope - Company Default + Outlet Override

**Status:** Accepted  
**Date:** 2026-03-07  
**Context:** Master data pricing architecture  

---

## Context

The Jurnapod ERP supports multi-outlet operations where:
- **Items** (products/services) are defined at the **company level** (single source of truth).
- **Prices** need flexibility to support both:
  - **Company-wide default pricing** (e.g., standard menu price across all outlets)
  - **Outlet-specific price overrides** (e.g., airport location charges premium, suburban outlet offers discount)

Previously, all prices were **outlet-scoped only** (`item_prices.outlet_id` was `NOT NULL`), which meant:
- Every outlet had to explicitly define a price for every item, even if prices were identical.
- No central default price management — changes required updating prices across all outlets.
- POS sync only received prices for its specific outlet; items without outlet prices were unpriceable.

**Problem:** Multi-outlet businesses need:
1. **Centralized default pricing** for consistent company-wide menus.
2. **Outlet overrides** for location-specific adjustments (without affecting other outlets).
3. **Automatic fallback** so outlets inherit company defaults unless overridden.

---

## Decision

We introduce a **two-tier pricing model**:

### 1. Company Default Price
- Stored in `item_prices` table with `outlet_id = NULL`.
- Represents the **fallback price** for all outlets.
- Managed at **company level** (no outlet-specific access control).
- One default per item: `UNIQUE (company_id, item_id) WHERE outlet_id IS NULL`.

### 2. Outlet Override Price
- Stored in `item_prices` table with `outlet_id = <specific_outlet>`.
- Represents an **outlet-specific override** that takes precedence over company default.
- Managed at **outlet level** (requires outlet access).
- One override per outlet per item: `UNIQUE (company_id, outlet_id, item_id) WHERE outlet_id IS NOT NULL`.

### 3. Effective Price Resolution
When resolving price for an item at a specific outlet:
```
effective_price = outlet_override ?? company_default ?? null
```

**Priority order:**
1. Check for outlet override (`item_id` + `outlet_id` match)
2. If not found, fallback to company default (`item_id` + `outlet_id IS NULL`)
3. If neither exists, item has no price (cannot be sold via POS)

---

## Database Schema

### Migration: `item_prices.outlet_id` Nullable

**Before:**
```sql
CREATE TABLE item_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,  -- ❌ Always required
  item_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(18,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  ...
  UNIQUE KEY uq_item_prices_company_outlet_item (company_id, outlet_id, item_id)
);
```

**After:**
```sql
CREATE TABLE item_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,  -- ✅ NULL = company default
  item_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(18,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  ...
  -- Two separate uniqueness constraints:
  UNIQUE KEY uq_item_prices_company_default (company_id, item_id) 
    WHERE outlet_id IS NULL,
  UNIQUE KEY uq_item_prices_outlet_override (company_id, outlet_id, item_id) 
    WHERE outlet_id IS NOT NULL
);
```

**Key Changes:**
- `outlet_id` changed from `NOT NULL` to `NULL`.
- Split uniqueness into two conditional constraints:
  - **Default scope:** `(company_id, item_id)` when `outlet_id IS NULL`
  - **Override scope:** `(company_id, outlet_id, item_id)` when `outlet_id IS NOT NULL`

**Foreign Key Behavior:**
- Outlet FK (`outlet_id → outlets.id`) only enforced when `outlet_id IS NOT NULL`.
- Company FK and item FK always enforced.

---

## API Contracts

### Shared Schemas (`packages/shared/src/schemas/master-data.ts`)

#### Create Price Request
```typescript
export const ItemPriceCreateRequestSchema = z.object({
  item_id: NumericIdSchema,
  outlet_id: NumericIdSchema.nullable(),  // ✅ NULL = company default
  price: z.coerce.number().finite().nonnegative(),
  is_active: z.boolean().optional()
});
```

#### Update Price Request
```typescript
export const ItemPriceUpdateRequestSchema = z.object({
  item_id: NumericIdSchema.optional(),
  outlet_id: NumericIdSchema.nullable().optional(),  // ✅ Can change scope
  price: z.coerce.number().finite().nonnegative().optional(),
  is_active: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0);
```

### API Endpoints

#### `POST /api/inventory/item-prices`
**Create company default price:**
```json
{
  "item_id": 42,
  "outlet_id": null,
  "price": 25000,
  "is_active": true
}
```

**Create outlet override:**
```json
{
  "item_id": 42,
  "outlet_id": 5,
  "price": 32000,
  "is_active": true
}
```

**Access Control:**
- Company default (`outlet_id = null`): requires company-level inventory `create` permission.
- Outlet override: requires outlet-level inventory `create` permission + user must have access to that outlet.

#### `GET /api/inventory/item-prices?outlet_id=<id>`
Returns **effective prices** for the specified outlet:
- Outlet overrides for this outlet
- Company defaults (for items without outlet override)

**Response includes scope indicator:**
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "company_id": 1,
      "outlet_id": 5,
      "item_id": 42,
      "price": 32000,
      "is_active": true,
      "is_override": true  // ✅ Indicates this is outlet-specific
    },
    {
      "id": 99,
      "company_id": 1,
      "outlet_id": null,
      "item_id": 43,
      "price": 18000,
      "is_active": true,
      "is_override": false  // ✅ Indicates fallback to company default
    }
  ]
}
```

#### `GET /api/inventory/item-prices` (no outlet filter)
Returns **all prices** user has access to:
- All company defaults (if user has company-level access)
- All outlet overrides for outlets user has access to

---

## Sync Pull Behavior (POS-Critical)

### Endpoint: `GET /api/sync/pull?outlet_id=<id>&since_version=<n>`

**Server-side effective price resolution:**

When POS requests master data for outlet `5`:
1. Server queries all active items (company-scoped).
2. For each item, resolve effective price for outlet `5`:
   - Check `item_prices WHERE company_id = X AND outlet_id = 5 AND item_id = Y`
   - If not found, fallback to `item_prices WHERE company_id = X AND outlet_id IS NULL AND item_id = Y`
3. Return only items with resolved prices (skip items without any price).

**Sync payload structure (unchanged for POS compatibility):**
```json
{
  "success": true,
  "data": {
    "data_version": 123,
    "items": [
      { "id": 42, "name": "Latte", "type": "PRODUCT", ... },
      { "id": 43, "name": "Espresso", "type": "PRODUCT", ... }
    ],
    "prices": [
      { "id": 101, "item_id": 42, "outlet_id": 5, "price": 32000, ... },
      { "id": 99, "item_id": 43, "outlet_id": 5, "price": 18000, ... }
    ],
    "config": { ... }
  }
}
```

**Key behaviors:**
- POS receives **effective prices only** (already resolved server-side).
- All prices in payload have `outlet_id = <requested_outlet>` (even defaults are represented as outlet-specific for POS simplicity).
- POS does not need to understand default/override distinction; it just uses the price for each item.
- Server handles fallback logic transparently.

---

## Backoffice UI Behavior

### Items + Prices Page (`apps/backoffice/src/features/items-prices-page.tsx`)

**Two-section layout:**

#### Section 1: Company Default Prices
- Lists all items with company default prices.
- Shows `outlet_id = null` rows.
- Allows creating/editing/deleting company defaults.
- **Permission:** Company-level inventory module access.
- **UI indicator:** "Default Price" badge or icon.

#### Section 2: Outlet Override Prices
- Outlet selector (existing behavior).
- Lists items with outlet-specific overrides for selected outlet.
- Shows items **without override but with default** (grayed out, read-only default value).
- **Create override action:** 
  - If item has no override for this outlet, show "Set Override" button.
  - On edit, creates new `item_prices` row with `outlet_id = <selected_outlet>`.
- **Edit override action:**
  - Updates existing override row.
- **Delete override action:**
  - Deletes override row → outlet falls back to company default.
- **Permission:** Outlet-level inventory module access.
- **UI indicators:**
  - Override rows: highlight with "Override" badge.
  - Fallback rows: show default price in italic/grayed out with "(using company default)" label.

**User flow example:**
1. User selects "Airport Outlet" from dropdown.
2. Table shows:
   - Latte: 32,000 **[Override]** ← can edit/delete
   - Espresso: *18,000 (using company default)* ← show "Set Override" button
3. User clicks "Set Override" for Espresso, enters 22,000 → creates outlet override.
4. User clicks "Delete" on Latte override → Latte now shows *(25,000 using company default)*.

---

## Data Migration Strategy

### Migrating Existing Outlet-Only Prices

**Option A: Keep as outlet overrides (recommended for backward compatibility)**
- No data migration needed.
- All existing `item_prices` rows have `outlet_id` set → treated as overrides.
- Admins can later consolidate identical prices into company defaults manually.

**Option B: Consolidate identical prices into defaults**
- Identify items where all outlets have identical prices.
- Create company default for those items.
- Delete outlet overrides where price matches new default.
- Keep outlet overrides only where price differs from majority.

**Recommended:** **Option A** for initial release (zero risk), then provide admin tool for consolidation later.

---

## Access Control Rules

### Company Default Price (`outlet_id = NULL`)
- **Create/Update/Delete:** Requires company-level inventory module permission (OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT with inventory `create`/`update`/`delete`).
- **Read:** Any user with inventory module read access can see company defaults.
- **No outlet access check needed** (company-scoped data).

### Outlet Override Price (`outlet_id = <number>`)
- **Create/Update/Delete:** Requires:
  1. Outlet-level inventory module permission (OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT with inventory `create`/`update`/`delete`).
  2. User must have access to the specific outlet (via `user_outlet_roles` or global role).
- **Read:** User can only see overrides for outlets they have access to.
- **Enforcement:** 
  - Pre-check outlet access before mutation.
  - TOCTOU protection: re-check outlet access inside transaction after locking row.

---

## Testing Requirements

### Unit Tests (Master-Data Service)
- ✅ Create company default price (`outlet_id = null`).
- ✅ Create outlet override price (`outlet_id = 5`).
- ✅ Uniqueness: duplicate default throws conflict.
- ✅ Uniqueness: duplicate override for same outlet throws conflict.
- ✅ Allow: same item can have default + multiple outlet overrides.
- ✅ Effective price resolution: override takes precedence over default.
- ✅ Effective price resolution: fallback to default when no override exists.

### Integration Tests (`apps/api/tests/integration/master-data.integration.test.mjs`)
- ✅ Sync pull returns effective prices (override preferred, default fallback).
- ✅ Sync pull with outlet override returns override price.
- ✅ Sync pull without outlet override returns default price.
- ✅ Sync pull skips items with no price (neither default nor override).
- ✅ API create default price (OWNER can create `outlet_id = null`).
- ✅ API create outlet override (ADMIN can create `outlet_id = 5` if has access).
- ✅ API list prices for outlet returns effective prices (mixed defaults + overrides).
- ✅ RBAC: user without outlet access cannot create override for that outlet.
- ✅ RBAC: user without outlet access cannot see overrides for that outlet.
- ✅ Concurrent duplicate protection (default scope + override scope separately).

### E2E Tests (POS)
- ✅ POS sync pull receives effective prices.
- ✅ POS can sell item with default price (no override).
- ✅ POS can sell item with override price.
- ✅ POS does not show items without any price.

---

## Rollback Plan

If issues arise post-deployment:

1. **DB rollback:**
   - Revert migration to make `outlet_id NOT NULL` again.
   - Requires data fix: delete or assign outlet to any `outlet_id IS NULL` rows.

2. **API rollback:**
   - Revert code changes to price creation/listing logic.
   - Re-enforce `outlet_id` required in request schemas.

3. **Backoffice rollback:**
   - Revert UI to outlet-only pricing (remove default price section).

**Risk mitigation:**
- Deploy DB migration first, let it settle (existing data unaffected).
- Deploy API changes with feature flag (`PRICING_DEFAULTS_ENABLED`).
- Enable backoffice UI for company defaults only after API stable.

---

## Future Enhancements

### Hierarchical Pricing (Future)
- Outlet groups (e.g., "Airport Outlets", "Suburban Outlets").
- Group-level price overrides (between company default and outlet override).
- Resolution priority: `outlet_override > group_override > company_default`.

### Bulk Price Management Tools
- Admin UI: "Copy company default to all outlets as overrides".
- Admin UI: "Consolidate identical outlet prices into default".
- Admin UI: "Apply % adjustment to all outlet overrides".

### Price History/Audit
- Track price changes over time for reporting.
- Show "price changed from X to Y on date Z" in audit logs.

### Price Scheduling
- Future-dated price changes (e.g., "raise price to 30,000 starting next month").
- Automatic price tier switching based on time/day (happy hour pricing).

---

## Related Documents

- **Database Schema:** `packages/db/migrations/0059_item_prices_company_default.sql`
- **API Implementation:** `apps/api/src/lib/master-data.ts`
- **Shared Contracts:** `packages/shared/src/schemas/master-data.ts`
- **Backoffice UI:** `apps/backoffice/src/features/items-prices-page.tsx`
- **Integration Tests:** `apps/api/tests/integration/master-data.integration.test.mjs`

---

## Consequences

### Positive
✅ **Centralized default pricing** reduces redundant data entry across outlets.  
✅ **Outlet overrides** provide location-specific flexibility without affecting other outlets.  
✅ **Automatic fallback** simplifies multi-outlet operations (new outlets inherit defaults).  
✅ **POS compatibility** maintained (server resolves effective prices transparently).  
✅ **RBAC clarity** — company-level vs outlet-level permissions align with data scope.  

### Negative
⚠️ **Migration complexity** — need to decide how to handle existing outlet-only prices.  
⚠️ **UI complexity** — backoffice must clearly distinguish default vs override.  
⚠️ **Testing burden** — need comprehensive coverage for fallback logic.  

### Neutral
- Existing outlet-only workflows remain functional (all prices can stay as overrides).
- Gradual adoption: companies can continue outlet-only pricing or adopt defaults incrementally.

---

**Approved by:** Ahmad Faruk (Signal18 ID)  
**Implementation Milestone:** v0.9.0 (Q1 2026)
