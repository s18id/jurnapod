# Story 67-3: Pricing Management — Default vs Outlet Override Visibility

Status: done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 67 --story 67-3 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or pricing manager**,  
I want **to see default prices and outlet-specific overrides in a single view with clear visual distinction**,  
So that **I can understand pricing scope at a glance and manage outlet overrides efficiently**.

## Context

Pricing in Jurnapod supports outlet-level overrides: `item_prices.outlet_id` is NULL for default prices and set to a specific `outlet_id` for overrides. The existing `prices-page.tsx` already has basic default vs outlet view modes, but it uses an older inline table and lacks the visual distinction and override management workflow required by the hardened design.

This story redesigns pricing management using the shared primitives from Story 67-1 and makes "default vs outlet override" a first-class visible state space.

**Dependencies:** Story 67-2 (items detail), Story 67-1 (EntityTable, FilterBar, DetailDrawer, ScopeBadge)

**Backend endpoints:**
- `GET /api/inventory/item-prices` — List prices with pagination, search, filter
- `GET /api/inventory/item-prices/active` — Get active prices for outlet
- `POST /api/inventory/item-prices` — Create price (default or override)
- `PATCH /api/inventory/item-prices/:id` — Update price
- `DELETE /api/inventory/item-prices/:id` — Delete price override

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Price list shows default and overrides; outlet scope filters; override editor works; revert to default works
- [ ] **Error paths identified:** API failure; invalid price value; duplicate price for same item+outlet; permission denied
- [ ] **Edge cases identified:** Item with no default price; item with only default price; item with multiple outlet overrides; zero price; very large price
- [ ] **Test fixture needs identified:** Items with default prices; items with outlet overrides; multiple outlets
- [ ] **Integration test scope defined:** API integration for CRUD; UI unit for visual state mapping
- [ ] **Negative auth test role selected:** `CASHIER` for price mutations (CASHIER has READ on inventory)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Price list shows default price and outlet override side by side | Happy | Unit |
| Visual distinction: default (normal) vs override (pinned icon, different bg) | Happy | Unit |
| Outlet scope change filters to show only that outlet's overrides + defaults | Happy | Integration |
| Set outlet override price | Happy | Integration |
| Remove override reverts to default | Happy | Integration |
| Item with no default price shows "—" | Edge | Unit |
| Invalid price value (negative) rejected | Error | Integration |
| CASHIER cannot set prices (403) | Error | Integration |
| Large dataset performance (>500 prices) | Edge | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `InventoryConflictError` (duplicate price), `InventoryReferenceError` (invalid item/outlet)
- [ ] Consumer catch paths: Form shows field-level errors; table shows Alert for load errors
- [ ] Fallback handling: `error.message` for unknown errors
- [ ] Error response mapping: 409 → "Price already exists for this item and outlet"; 422 → "Invalid price value"

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| `InventoryConflictError` | Form shows "Price already exists" | Generic "Conflict" |
| `InventoryReferenceError` | Form shows "Invalid item or outlet" | Generic "Invalid reference" |
| Validation error (negative price) | Field-level error on price input | Generic "Invalid value" |

---

## Acceptance Criteria

### AC1: Price list with default and override visibility
**Given** the pricing page  
**When** it loads  
**Then** EntityTable displays columns: Item Name, SKU, Default Price, Outlet Override Price, Status  
**And** each row shows both default price and outlet-specific override (if any)

### AC2: Visual distinction
**Given** an item with a default price of 10000 and an outlet override of 12000  
**When** viewing the price list  
**Then** the default price is shown in normal font weight  
**And** the outlet override is shown with a "pinned" icon and different background color  
**And** the effective price (override if present, else default) is clearly indicated

### AC3: ScopeBadge integration
**Given** the pricing view  
**When** viewing default prices (no outlet selected)  
**Then** ScopeBadge shows "Default Prices"  

**Given** the pricing view  
**When** viewing prices scoped to "Main Outlet"  
**Then** ScopeBadge shows "Outlet: Main Outlet"  
**And** only prices for Main Outlet and default prices are shown

### AC4: Outlet scope filtering
**Given** the outlet selector in FilterBar  
**When** "Main Outlet" is selected  
**Then** the list shows: all default prices + all overrides for Main Outlet  
**And** overrides for other outlets are hidden  

**Given** the outlet selector  
**When** "All Outlets" is selected  
**Then** all prices are shown with outlet columns for each outlet  
**And** a maximum of 5 outlet columns are displayed by default (most recently active first)  
**And** additional outlets are accessible via "Show more" expander  
**And** "All Outlets" mode renders within 2 seconds for companies with up to 20 outlets (P2-6 Fix)

### AC5: Set outlet override
**Given** an item with a default price  
**When** the user sets an outlet-specific price  
**Then** `POST /api/inventory/item-prices` is called with `outlet_id` set  
**And** the list updates showing the new override  
**And** the override has visual distinction

### AC6: Remove outlet override
**Given** an item with an outlet override  
**When** the user removes the override  
**Then** `DELETE /api/inventory/item-prices/:id` is called for the override  
**And** the list updates showing "—" or "Default" in the override column  
**And** the effective price reverts to the default

### AC7: Drawer editor
**Given** a price row  
**When** the user triggers edit  
**Then** a drawer opens for price entry (P2-7 Fix: drawer pattern chosen for consistency with DetailDrawer primitive)  
**And** the editor shows context: item name, current default price, target outlet  
**And** validation prevents negative prices and non-numeric values

### AC8: Effective price resolution
**Given** an item with default price 10000 and no override  
**Then** the effective price is 10000  

**Given** an item with default price 10000 and outlet override 12000  
**Then** the effective price for that outlet is 12000  
**And** the effective price for other outlets is 10000

### AC9: Permission gating
**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'UPDATE' })` returning true  
**Then** price edit actions are visible  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'UPDATE' })` returning false  
**Then** price edit actions are hidden  
**And** prices are displayed read-only

### AC10: Mobile viewport (P2-10 Fix)
**Given** a mobile viewport (width <= 48em)  
**When** the pricing page loads  
**Then** prices render as cards with: item name, default price, outlet override (if any)  
**And** effective price is prominently displayed  
**And** outlet selector is a bottom sheet or dropdown  
**And** price editor opens as a full-screen modal (not drawer)

---

## Technical Notes

### Files to Modify
- `apps/backoffice/src/features/prices-page.tsx` — Complete rewrite using EntityTable
- `apps/backoffice/src/features/prices-page/prices-table.tsx` — Align with EntityTable or remove

### Files to Create
- `apps/backoffice/src/features/prices/price-list.tsx` — EntityTable-based price list
- `apps/backoffice/src/features/prices/price-override-editor.tsx` — Override create/edit drawer
- `apps/backoffice/src/features/prices/price-detail-drawer.tsx` — DetailDrawer content for prices
- `apps/backoffice/src/hooks/use-item-prices.ts` — TanStack Query hook for prices
- `apps/backoffice/src/hooks/use-price-mutations.ts` — Mutations for create/update/delete
- `apps/backoffice/src/__test__/integration/prices/price-crud.test.tsx` — CRUD integration tests
- `apps/backoffice/src/__test__/unit/prices/price-visual-state.test.tsx` — Visual state unit tests

### API Contracts
- `GET /api/inventory/item-prices?page=1&limit=25&outlet_id=123`
- Response: `{ prices: ItemPrice[], total: number }`
- `ItemPrice`: `{ id, company_id, outlet_id, item_id, price, is_active, updated_at }`
- `POST /api/inventory/item-prices` — Body: `{ item_id, outlet_id?, price, is_active }`
- `DELETE /api/inventory/item-prices/:id`

### Permission Requirements
All permission checks use canonical `requireAccess({ module, resource, permission })` format per Epic 39:
- `requireAccess({ module: 'inventory', resource: 'items', permission: 'READ' })` — View prices
- `requireAccess({ module: 'inventory', resource: 'items', permission: 'UPDATE' })` — Create/update/delete price overrides

### State Management
- TanStack Query for price list fetching
- Optimistic updates for override create/delete
- Outlet scope selection synced with URL params

### Visual Design
- Default price: normal font weight, neutral background
- Outlet override: bold font, "pinned" icon (`IconPinned`), light blue background tint
- Effective price: highlighted (slightly larger or bolder)
- Missing override: "—" or "Default" in muted text

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R67-3-001 | P1 | Effective price resolution logic must match backend exactly | Document resolution algorithm; test against backend behavior |
| R67-3-002 | P2 | Many outlets × many items = very wide table | Show outlet selector instead of all columns; "All Outlets" mode shows compact summary |
| R67-3-003 | P2 | Existing `prices-page.tsx` has import/export wizard integration | Preserve import/export functionality; migrate wizard to staged batch API in Story 67-4 |

---

## Story Points
**8 points** (medium-high complexity — visual state management + CRUD)

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] Integration tests for price CRUD operations
- [ ] Unit tests for visual state mapping and effective price resolution
- [ ] Permission gating verified with CASHIER negative tests
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-67.3.completion.md`) with reviewer GO and owner sign-off

---

_Last Updated: 2026-05-18_
