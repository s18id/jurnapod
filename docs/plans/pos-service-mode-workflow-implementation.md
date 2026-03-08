# POS Service Mode Workflow Implementation Plan

**Status:** Proposed  
**Date:** 2026-03-08  
**Context:** POS workflow restructuring, service mode selection, dine-in order management  
**Related ADRs:** ADR-0005, ADR-0006

---

## Overview

This document outlines the implementation plan for restructuring the POS UI workflow to align with the **"one page, one job"** principle established in ADR-0005. The plan introduces a clear service mode selection entry point and distinct workflows for Take-Away and Dine-In operations, reducing cashier errors and improving operational clarity.

---

## Objectives

1. **Reduce operational errors** by providing clear, dedicated workflows for each service type
2. **Align with ADR-0005** workflow redesign and outlet context guardrails
3. **Support real restaurant operations** with proper dine-in table management
4. **Maintain data integrity** through proper state management and confirmation flows
5. **Enable offline-first operation** with clear persistence boundaries

---

## Architecture Principles

### 1. One Page, One Job
Each screen has a single, well-defined responsibility (ADR-0005:58).

### 2. Guarded Context Changes
Service type, outlet, and table switches require explicit confirmation when active order state exists (ADR-0005:119-134).

### 3. Offline-First Safety with Persistence Policy
**All active orders persist to offline DB for recovery/sync safety**, but lifecycle policy differs by service type:
- **Takeaway:** Snapshots are ephemeral by policy—one open takeaway per outlet; auto-discards on explicit clear, logout, or outlet switch.
- **Dine-in:** Snapshots are durable operational state—persists until completion, cancellation, or explicit closure.

This approach maintains offline resilience (ADR-0005:346-354) while enforcing clear service-specific workflows.

### 4. Unified Order Lifecycle
All workflows use the shared order model with explicit `service_type`, `source_flow`, and `settlement_flow` dimensions (ADR-0006:60-65).

### 5. Data Type Consistency
- **Money values:** Stored as integer minor units (`*_amount` fields) to avoid floating-point drift, consistent with repo-wide accounting invariants.
- **IDs:** All entity IDs (`table_id`, `outlet_id`, `reservation_id`) use `number` type in TypeScript and `INTEGER` in SQL schemas, matching existing runtime implementation.

---

## Proposed Workflow Structure

### 1. Service Mode Landing Page

**Route:** `/service-mode` (new)  
**Responsibility:** Service type selection entry point

#### UI Components
- **Service Mode Selector**
  - Large, touch-friendly button: **Take Away**
  - Large, touch-friendly button: **Dine In**
- **Global Context Display** (persistent across all pages)
  - Current outlet name and ID
  - Sync status indicator
  - Active order summary (if exists)
  - Cashier name

#### Behavior
- Displayed immediately after login or outlet selection
- Selecting **Take Away**:
  - Sets `service_type = 'TAKEAWAY'` in active order context
  - Sets `source_flow = 'WALK_IN'`
  - Sets `settlement_flow = 'IMMEDIATE'`
  - Navigates to `/products`
- Selecting **Dine In**:
  - Sets `service_type = 'DINE_IN'` in active order context
  - Sets `source_flow = 'WALK_IN'`
  - Sets `settlement_flow = 'DEFERRED'`
  - Navigates to `/tables`

#### Data Model (Active Order Context)
```typescript
interface ActiveOrderContext {
  service_type: 'TAKEAWAY' | 'DINE_IN';
  source_flow: 'WALK_IN' | 'RESERVATION' | 'PHONE' | 'ONLINE' | 'MANUAL';
  settlement_flow: 'IMMEDIATE' | 'DEFERRED' | 'SPLIT';
  outlet_id: number;
  cashier_user_id: number;
  table_id?: number; // Required for DINE_IN
  reservation_id?: number; // Optional linkage
  guest_count?: number;
  is_finalized: boolean; // Committed snapshot exists
  order_status: 'OPEN' | 'READY_TO_PAY' | 'COMPLETED' | 'CANCELLED';
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

// Cart lines maintained separately with committed_qty tracking
interface CartLineState {
  product: ProductSnapshot;
  qty: number; // Current working quantity
  committed_qty: number; // Finalized snapshot quantity (clamp floor)
  discount_amount: number;
}
```

**Note:** The current implementation already persists active order snapshots to offline DB via `upsertActiveOrderSnapshot` (apps/pos/src/router/Router.tsx:508). This plan preserves that behavior for offline safety while adding lifecycle policy enforcement.

---

### 2. Take-Away Flow

**Route Sequence:** `/service-mode` → `/products` → `/checkout`

#### 2.1 Product Selection + Cart (Single Page)

**Route:** `/products`  
**Responsibility:** Product discovery, cart building, quantity adjustment

##### UI Components
- **Product Grid/List** with search and category filters
- **Cart Sidebar** showing:
  - Working items with quantities
  - Subtotal, tax, total (live calculation)
  - **Cancel** button (discards unsaved cart)
  - **Checkout** button (proceeds to payment)

##### Behavior
- Quantities can be freely increased or decreased
- Cart **auto-persists to offline DB** (for recovery/offline safety)
  - Takeaway snapshots treated as ephemeral by policy (one per outlet)
  - Auto-cleared on logout, outlet switch, or explicit discard
- No table selection required or displayed
- **Cancel** action:
  - Shows confirmation: "Discard current order?"
  - If confirmed: closes active order snapshot, clears working state, returns to `/service-mode`
- **Checkout** action:
  - Validates cart has items
  - Navigates to `/checkout` (existing `/` route, optional `/checkout` alias)

##### Route Change Confirmation
If cashier attempts to navigate away (e.g., to `/settings`, outlet switcher):
- Display modal: **"You have an unsaved order. What would you like to do?"**
  - **Option 1:** "Save as Dine-In Order" (converts to dine-in, prompts for table selection, persists snapshot)
  - **Option 2:** "Discard Order" (clears working state)
  - **Option 3:** "Cancel" (stays on current page)

#### 2.2 Checkout (Payment Only)

**Route:** `/checkout` (existing `/`)  
**Responsibility:** Payment collection and sale finalization

##### UI Components
- Order summary (read-only)
- Payment method selection
- Amount tendered input
- Change calculation
- **Complete Sale** button

##### Behavior
- Displays service type (`TAKEAWAY`), outlet, cashier
- Collects payment details
- On completion:
  - Persists finalized sale to offline DB
  - Triggers sync outbox entry
  - Shows receipt/confirmation
  - Clears active order context
  - Returns to `/service-mode`

---

### 3. Dine-In Flow

**Route Sequence:** `/service-mode` → `/tables` → `/products` → `/checkout`

#### 3.1 Table Grid

**Route:** `/tables` (as defined in ADR-0005:98-105)  
**Responsibility:** Table status display, table selection, table operations

##### UI Components
- **Visual Table Grid**
  - Color-coded by status:
    - `AVAILABLE` (green)
    - `RESERVED` (yellow)
    - `OCCUPIED` (red)
    - `UNAVAILABLE` (grey)
  - Shows table code/name, zone, capacity
- **Table Action Sheet** (on tap)

##### Table Entity (Persistent)
```typescript
interface Table {
  table_id: number;
  company_id: number;
  outlet_id: number;
  code: string; // e.g., "T01", "A-05"
  name: string | null;
  zone: string | null; // e.g., "Patio", "Main Hall"
  capacity: number | null;
  status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'UNAVAILABLE';
  created_at: string;
  updated_at: string;
}
```

##### Behavior: Available Table

On tap of `AVAILABLE` table:
- Sets `table_id` in active order context
- Sets order `status = 'OPEN'`
- Navigates to `/products` with table context visible

##### Behavior: Occupied Table

On tap of `OCCUPIED` table, show action sheet with **four actions**:

1. **Resume Order**
   - Loads persisted order snapshot into working state
   - Navigates to `/products`
   - Allows quantity increases
   - **Prevents reductions below snapshot quantities** (business rule)
   - Finalize updates the snapshot

2. **Cancel Items**
   - Shows item list from snapshot
   - Allows quantity reductions only
   - **Requires reason input** for each reduction
   - On finalize:
     - Updates snapshot with reduced quantities
     - Records cancellation history with reason and timestamp
     - Returns to `/tables`

3. **Move Table**
   - Shows table selection dialog (only `AVAILABLE` or `RESERVED` tables)
   - On confirmation:
     - Transfers order snapshot to new `table_id`
     - Releases old table (status → `AVAILABLE`)
     - Marks new table (status → `OCCUPIED`)
     - Preserves reservation linkage if applicable
     - Returns to `/tables`

4. **Checkout**
   - Loads order snapshot as read-only
   - Navigates to `/checkout`
   - Completes payment
   - Releases table on completion

##### Behavior: Reserved Table

On tap of `RESERVED` table:
- Shows reservation details (customer name, phone, guest count, time)
- Actions:
  - **Check In:** Converts reservation to active dine-in order
  - **View Details:** Shows full reservation info
  - **Cancel Reservation:** Marks reservation as `CANCELLED`, releases table

#### 3.2 Product Selection + Cart (with Table Context)

**Route:** `/products`  
**Responsibility:** Same as take-away, but with table awareness

##### UI Additions
- **Table Context Display** (persistent header/banner)
  - Shows selected table code/name
  - Shows guest count input (editable)
  - Shows reservation link (if applicable)

##### Behavior Differences
- Cart shows both **working quantities** and **snapshot quantities** (if resuming)
- Finalize action:
  - Persists cart as order snapshot to offline DB
  - Marks table as `OCCUPIED`
  - Returns to `/tables`
- Cancel action:
  - Same confirmation modal as take-away
  - If discarding: releases table if not previously occupied

##### Quantity Validation Rules
- **New orders (no snapshot):** Any quantity allowed
- **Resuming order (snapshot exists):**
  - Increases allowed freely
  - Decreases cannot go below snapshot quantity
  - If reduction needed: must use "Cancel Items" flow from table grid

#### 3.3 Checkout (with Table Release)

**Route:** `/checkout`  
**Responsibility:** Same as take-away, plus table release

##### Behavior Additions
- On successful payment completion:
  - Marks order as `COMPLETED`
  - Releases table (status → `AVAILABLE`)
  - Clears reservation linkage (if any)
  - Returns to `/service-mode`

---

### 4. Persisted Snapshots and Working Quantities

#### Concept
Dine-in orders maintain two quantity states:

1. **Snapshot (Committed):** Persisted to offline DB, represents finalized order state
2. **Working (In-Memory):** Editable quantities during resume/edit session

#### Rules
- **Finalization** clamps working quantities at or above snapshot values
- **Cancellation flow** explicitly allows reductions with reason capture
- **Switching tables/services** prompts save-or-discard confirmation

#### Active Order Schema (Persistent Offline DB)
**Note:** The current implementation uses `active_orders` and `active_order_lines` tables (see apps/pos/src/services/runtime-service.ts:825). This plan extends those tables rather than creating separate snapshot tables.

```typescript
interface ActiveOrder {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: 'TAKEAWAY' | 'DINE_IN';
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  is_finalized: boolean;
  order_status: 'OPEN' | 'READY_TO_PAY' | 'COMPLETED' | 'CANCELLED';
  order_state: 'OPEN' | 'CLOSED';
  paid_amount: number; // Integer minor units (e.g., cents)
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  updated_at: string;
}

interface ActiveOrderLine {
  order_id: string;
  item_id: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  item_type_snapshot: string;
  unit_price_snapshot: number; // Integer minor units
  qty: number;
  discount_amount: number; // Integer minor units
  updated_at: string;
}

// Future enhancement: Item cancellation audit trail
interface ItemCancellation {
  cancellation_id: string;
  order_id: string;
  item_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id: number;
  cancelled_at: string;
}
```

---

### 5. Data and Navigation Integrity

#### Outlet Switching (ADR-0005:119-134)
- **Always requires confirmation** when active order exists
- Confirmation modal explains:
  - Current cart/order will be cleared
  - Payment draft will be reset
  - Product context will reload
  - New order will start in selected outlet
- On confirm:
  - Clears `ActiveOrderContext`
  - Updates `outlet_id` in session
  - Navigates to `/service-mode`

#### Service Type Switching
- If switching from Take-Away → Dine-In with active cart:
  - Prompt: "Save order to a table?"
  - If yes: show table selector, persist snapshot
  - If no: discard cart
- If switching from Dine-In → Take-Away with active order:
  - Block if order has snapshot (must complete or cancel first)
  - If only working state: prompt save-or-discard

#### Navigation Guards
- `/products` in Dine-In mode:
  - Blocks product addition if no `table_id` set
  - Shows alert: "Please select a table first"
- `/checkout`:
  - Validates service-specific requirements:
    - Take-Away: items + payment
    - Dine-In: items + payment + valid table
  - Shows completion blockers clearly

---

## Current Implementation Status

### Already Implemented (Verified)
The following features from this plan **already exist** in the current codebase:

✅ **Active Order Persistence**
- `upsertActiveOrderSnapshot` (apps/pos/src/router/Router.tsx:508)
- `resolveActiveOrder` for finding/creating orders (runtime-service.ts:749)
- `getActiveOrderSnapshot` for loading snapshots (runtime-service.ts:729)
- Auto-hydration on app load (Router.tsx:650-696)

✅ **Table Management**
- Full table CRUD and status management (runtime-service.ts:540-707)
- Table grid UI with status colors (TablesPage.tsx:17-220)
- Table selection and occupation flow (TablesPage.tsx:174)
- Table transfer with validation (runtime-service.ts:932, CartPage.tsx:237)

✅ **Dine-In Order Lifecycle**
- Service type switching (ProductsPage.tsx:99-132)
- Table context display (ProductsPage.tsx:137-143)
- Finalize order flow (CartPage.tsx:206-223)
- Table release on completion (CheckoutPage.tsx:167, runtime-service.ts:1040)

✅ **Reservation Management**
- Full reservation lifecycle (ReservationsPage.tsx)
- Reservation-to-order conversion (ReservationsPage.tsx:244)
- Table assignment with status sync (runtime-service.ts:1216)

✅ **Quantity Clamp Enforcement**
- `committed_qty` tracking (useCart.ts:27)
- Prevents reductions below finalized quantities (useCart.ts:103)

✅ **Outlet Switching Guards**
- Confirmation modal (OutletContextSwitcher component)
- Table release on outlet change (Router.tsx:321-323)

### Missing Features (To Be Implemented)

❌ **Service Mode Landing Page**
- New `/service-mode` route and component
- Large touch-friendly service type selector
- Post-login redirect to service mode (currently goes to `/products`)

❌ **Route Change Confirmation**
- Guard hook for unsaved cart navigation
- "Save as Dine-In" / "Discard" / "Cancel" modal
- Integration with router navigation events

❌ **Explicit Cancel Items Flow**
- Dedicated UI for reducing finalized quantities
- Reason input requirement
- Audit trail persistence (deferred to Phase 5)

❌ **Source/Settlement Flow Fields**
- Add `source_flow` and `settlement_flow` to active order context
- UI for setting/displaying these fields
- Schema extension (optional, for ADR-0006 alignment)

❌ **Takeaway Lifecycle Policy**
- Auto-close abandoned takeaway orders on logout/outlet switch
- One-takeaway-per-outlet enforcement
- Clear distinction from durable dine-in snapshots

---

## Implementation Phases

### Phase 1: Foundation and Take-Away Flow
**Scope:** Service mode selection, take-away workflow, outlet switching guards

#### Tasks
1. Create `/service-mode` landing page with service type selector (new route)
2. Extend existing `ActiveOrderContext` with `source_flow` and `settlement_flow` fields
3. Refactor `/products` to be service-aware (currently exists, add service mode switcher)
4. Implement route change confirmation modal (guard hook)
5. Add outlet switching confirmation flow (extend existing OutletContextSwitcher)
6. Update `/checkout` to clear context on completion (already does via completeOrderSession)
7. Add navigation guards for dine-in blocking (ProductsPage guard)

**Deliverables:**
- Working take-away flow end-to-end
- Guarded outlet and route changes
- Takeaway snapshots persist (existing behavior) but treated as ephemeral by policy

**Implementation Notes:**
- Current default route post-login is `/products` (apps/pos/src/router/Router.tsx:1045)
- Change to redirect to `/service-mode` after login
- Preserve `/` as checkout route alias for backward compatibility

---

### Phase 2: Dine-In Foundation
**Scope:** Table entity, table grid, basic dine-in order creation

#### Tasks
1. ~~Create `tables` schema in offline DB~~ (already exists: `outlet_tables` in storage)
2. ~~Add table sync pull/push contracts~~ (already exists, may need extension)
3. ~~Build `/tables` route with visual grid~~ (already exists: apps/pos/src/pages/TablesPage.tsx)
4. ~~Implement table status color coding~~ (already exists: TablesPage.tsx:17)
5. ~~Add table selection flow for available tables~~ (already exists: TablesPage.tsx:174)
6. ~~Extend `ActiveOrderContext` with `table_id` and `guest_count`~~ (already exists: useCart.ts:14)
7. ~~Update `/products` to show table context~~ (already exists: ProductsPage.tsx:137)
8. ~~Implement finalize-to-snapshot logic~~ (already exists: CartPage.tsx:206 setOrderFinalized)
9. ~~Update `/checkout` to release table on completion~~ (already exists: CheckoutPage.tsx:167 completeOrderSession)

**Deliverables:**
- **Already implemented** — verify behavior matches plan
- Review and align finalize workflow with "one page, one job" principle
- Add service-mode entry point integration

**Implementation Notes:**
- Current implementation already has full dine-in foundation
- Focus this phase on workflow alignment and guardrail enforcement

---

### Phase 3: Resume and Order Management
**Scope:** Occupied table actions, resume order, cancel items

#### Tasks
1. ~~Create `order_snapshots` schema in offline DB~~ (use existing `active_orders` + `active_order_lines`)
2. Create `item_cancellations` schema for audit trail (new table, deferred to Phase 5)
3. ~~Implement "Resume Order" action~~ (already exists: TablesPage.tsx:174 resolveActiveOrder)
4. ~~Add quantity validation (prevent reductions below snapshot)~~ (already exists: useCart.ts:103 committed_qty clamp)
5. Implement "Cancel Items" flow with reason capture (new feature)
6. Build cancellation history display (new feature, deferred to Phase 5)
7. ~~Add snapshot versioning logic~~ (implicit via `updated_at` in active_orders)

**Deliverables:**
- **Mostly implemented** — verify committed_qty clamp enforcement
- Add explicit "Cancel Items" UI flow (currently users can reduce via cart, blocked by clamp)
- Defer audit trail to Phase 5

**Implementation Notes:**
- Current `committed_qty` in useCart.ts:99 already prevents reductions below finalized quantities
- TablesPage currently shows "Resume table order" button (TablesPage.tsx:203)
- Need to add explicit cancel-items modal with reason input

---

### Phase 4: Table Operations
**Scope:** Move table, reservation integration

#### Tasks
1. ~~Implement "Move Table" flow~~ (already exists: CartPage.tsx:237 transferActiveOrderTable)
2. ~~Add table transfer validation (preserve reservation links)~~ (already exists: runtime-service.ts:1017)
3. ~~Create `reservations` schema in offline DB~~ (already exists: storage layer)
4. ~~Build reservation check-in flow~~ (already exists: ReservationsPage.tsx:119)
5. ~~Add reservation-to-order conversion~~ (already exists: ReservationsPage.tsx:244)
6. ~~Implement reserved table actions~~ (already exists: ReservationsPage.tsx:310)
7. ~~Add guest count tracking~~ (already exists: ActiveOrderContext.guest_count)

**Deliverables:**
- **Fully implemented** — verify integration with service-mode workflow
- Ensure reservation flow works with new service-mode entry point

**Implementation Notes:**
- All table operations already implemented in current codebase
- CartPage has full table transfer UI (CartPage.tsx:225-331)
- ReservationsPage has full lifecycle (create, assign, check-in, seat, complete)
- Focus this phase on workflow consistency and documentation

---

### Phase 5: Polish and Edge Cases
**Scope:** Error handling, sync reliability, UX refinements

#### Tasks
1. Add comprehensive error messages
2. Implement retry logic for snapshot persistence failures
3. Add offline/online state indicators
4. Build sync conflict resolution for table status
5. Add cashier permission checks for cancel items
6. Implement split-bill foundations (if in scope)
7. Add operational analytics hooks

**Deliverables:**
- Production-ready stability
- Full offline resilience
- Audit and reporting readiness

---

## Data Flow Diagrams

### Take-Away Flow
```
┌─────────────────┐
│  Service Mode   │
│   Select: TA    │
└────────┬────────┘
         │ Set service_type='TAKEAWAY'
         │ source_flow='WALK_IN'
         │ settlement_flow='IMMEDIATE'
         v
┌─────────────────┐
│    Products     │
│  Add to Cart    │◄── In-Memory Working State
└────────┬────────┘
         │ Checkout
         v
┌─────────────────┐
│    Checkout     │
│  Take Payment   │
└────────┬────────┘
         │ Complete
         v
    Persist to
   Offline DB
   (Finalized Sale)
```

### Dine-In Walk-In Flow
```
┌─────────────────┐
│  Service Mode   │
│   Select: DI    │
└────────┬────────┘
         │ Set service_type='DINE_IN'
         │ source_flow='WALK_IN'
         v
┌─────────────────┐
│   Table Grid    │
│ Select Available│
└────────┬────────┘
         │ Set table_id
         v
┌─────────────────┐
│    Products     │
│  Build Order    │◄── In-Memory Working State
└────────┬────────┘
         │ Finalize
         v
    Persist to
   Offline DB
  (Order Snapshot)
         │
         v
┌─────────────────┐
│   Table Grid    │
│ Table: OCCUPIED │
└────────┬────────┘
         │ Checkout
         v
┌─────────────────┐
│    Checkout     │
│  Take Payment   │
└────────┬────────┘
         │ Complete
         v
  Release Table
  (status → AVAILABLE)
```

### Dine-In Resume Flow
```
┌─────────────────┐
│   Table Grid    │
│ Select OCCUPIED │
└────────┬────────┘
         │ Action: Resume
         v
    Load Snapshot
         │
         v
┌─────────────────┐
│    Products     │
│ Working Qty ≥   │
│ Snapshot Qty    │◄── Validation Rule
└────────┬────────┘
         │ Finalize
         v
  Update Snapshot
  (version += 1)
         │
         v
┌─────────────────┐
│   Table Grid    │
│ (Still OCCUPIED)│
└─────────────────┘
```

---

## Validation Rules Summary

### Global Rules
1. Every order belongs to exactly one outlet
2. Active order context is outlet-scoped
3. Outlet change requires confirmation and clears context
4. Route changes with active cart require confirmation

### Take-Away Rules
1. No table selection allowed or required
2. `service_type = 'TAKEAWAY'`
3. `settlement_flow = 'IMMEDIATE'` (default)
4. Cart exists only in memory until checkout

### Dine-In Rules
1. Must select table before adding products
2. `service_type = 'DINE_IN'`
3. `table_id` is required and validated
4. Snapshot persisted on finalize
5. Working quantities cannot drop below snapshot quantities (except via cancel flow)
6. Table released only on order completion or cancellation
7. One active order per table (no double-occupancy without explicit merge)

### Cancellation Rules
1. Reductions require reason input
2. Cancellation history persisted separately
3. Snapshot updated with new quantities
4. Audit trail includes user, timestamp, reason

### Checkout Rules
1. Cannot complete without items
2. Cannot complete without valid payment
3. Cannot complete without valid outlet context
4. Dine-In: cannot complete without valid `table_id`
5. Take-Away: cannot complete with `table_id` set

---

## Sync and Offline Considerations

### Offline-First Principles (ADR-0005:346-354)
1. Working state remains in memory only
2. Snapshots persist to offline DB (SQLite)
3. Finalized sales persist to offline DB with outbox entry
4. Sync push sends completed sales via `client_tx_id` idempotency

### Sync Pull Requirements
- Table metadata (code, name, zone, capacity, status)
- Reservation summaries (for active horizon, e.g., next 7 days)
- Order snapshots (for recovery/handoff scenarios)

### Sync Push Payloads
- Completed sales with `service_type`, `table_id`, `reservation_id`
- Order lifecycle events (open, finalize, complete, cancel)
- Item cancellations with audit trail

### Conflict Resolution
- Table status conflicts: server wins, warn cashier
- Order conflicts: prevent via `client_tx_id` and snapshot versioning
- Reservation conflicts: server wins, show alert

---

## Testing Requirements

### Unit Tests
- Service mode selection sets correct context fields
- Outlet switching clears active order context
- Route change confirmation shows when cart exists
- Quantity validation prevents reductions below snapshot
- Cancellation reason required for item reductions
- Table release on order completion

### Integration Tests
- Take-away flow end-to-end (service mode → products → checkout → completion)
- Dine-in walk-in flow end-to-end (service mode → tables → products → finalize → checkout)
- Resume order with quantity increases
- Cancel items with reason capture
- Move table preserves order state
- Outlet switch with active order prompts confirmation

### E2E Tests (Manual/Automated)
1. **Takeaway Happy Path**
   - Login → Service Mode → Take Away → Add items → Checkout → Complete
   - Verify: Sale persisted, context cleared, sync queued

2. **Dine-In Walk-In Happy Path**
   - Login → Service Mode → Dine In → Select available table → Add items → Finalize
   - Verify: Snapshot persisted, table marked OCCUPIED
   - Resume → Add more items → Finalize → Checkout → Complete
   - Verify: Table released, sale completed

3. **Dine-In Cancel Items**
   - Select occupied table → Cancel Items → Reduce quantity → Enter reason → Finalize
   - Verify: Snapshot updated, cancellation recorded

4. **Outlet Switching**
   - Start order → Switch outlet → Confirm → Verify context cleared

5. **Table Move**
   - Select occupied table → Move Table → Select new table → Confirm
   - Verify: Old table available, new table occupied, order intact

6. **Route Change Guard**
   - Add items to cart → Navigate to settings → Verify confirmation modal
   - Choose "Save as Dine-In" → Select table → Verify snapshot created

---

## UI/UX Specifications

### Service Mode Landing Page
- **Layout:** Full-screen, centered
- **Buttons:** Minimum 200x120px touch targets
- **Icons:** Consistent with existing POS icon set
- **Header:** Show outlet name, sync status, cashier name
- **Footer:** Quick access to settings (non-destructive)

### Table Grid
- **Layout:** Responsive grid (2-4 columns based on screen width)
- **Table Card:**
  - Color border/background by status
  - Large table code/name (24px font)
  - Capacity and zone (12px font, grey)
  - Tap target: entire card
- **Status Colors:**
  - Available: `#22C55E` (green)
  - Reserved: `#EAB308` (yellow)
  - Occupied: `#EF4444` (red)
  - Unavailable: `#9CA3AF` (grey)

### Cart Sidebar (Products Page)
- **Sticky:** Fixed to right side or bottom (mobile)
- **Sections:**
  1. Items list with quantity controls
  2. Subtotal/Tax/Total summary
  3. Action buttons (Cancel, Finalize/Checkout)
- **Snapshot Indicator (Dine-In):**
  - Show "Previously: X" for items with snapshot quantities
  - Disable decrease button when at snapshot quantity

### Confirmation Modals
- **Style:** Centered overlay with blur backdrop
- **Actions:** Clearly labeled primary/secondary buttons
- **Copy:** Concise, action-oriented language
- **Example:**
  ```
  You have an unsaved order
  
  What would you like to do?
  
  [Save as Dine-In Order]  (primary)
  [Discard Order]          (destructive)
  [Cancel]                 (secondary)
  ```

---

## API and Schema Changes

### New Offline DB Tables

#### `outlet_tables` (existing table, no changes needed)
```sql
-- Already exists in offline DB schema
CREATE TABLE outlet_tables (
  pk TEXT PRIMARY KEY,
  table_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  outlet_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT,
  zone TEXT,
  capacity INTEGER,
  status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'UNAVAILABLE')),
  updated_at TEXT NOT NULL
);
```

#### `active_orders` and `active_order_lines` (existing tables, extend if needed)
```sql
-- Already exists in offline DB schema
CREATE TABLE active_orders (
  pk TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  outlet_id INTEGER NOT NULL,
  service_type TEXT NOT NULL,
  table_id INTEGER,
  reservation_id INTEGER,
  guest_count INTEGER,
  is_finalized INTEGER NOT NULL DEFAULT 0,
  order_status TEXT NOT NULL,
  order_state TEXT NOT NULL,
  paid_amount INTEGER NOT NULL, -- Minor units (cents)
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE active_order_lines (
  pk TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  outlet_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  sku_snapshot TEXT,
  name_snapshot TEXT NOT NULL,
  item_type_snapshot TEXT NOT NULL,
  unit_price_snapshot INTEGER NOT NULL, -- Minor units (cents)
  qty INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL, -- Minor units (cents)
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES active_orders(order_id)
);
```

#### `item_cancellations` (future enhancement, deferred to Phase 5)
```sql
-- To be implemented in Phase 5 for audit trail
CREATE TABLE item_cancellations (
  cancellation_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  cancelled_quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  cancelled_by_user_id INTEGER NOT NULL,
  cancelled_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES active_orders(order_id)
);
CREATE INDEX idx_cancellations_order ON item_cancellations(order_id);
```

### Extended Active Order Fields
**Note:** The `active_orders` table already includes most required fields. The following fields need to be added:

```typescript
// Fields to add to existing ActiveOrder interface:
interface ActiveOrderExtensions {
  source_flow?: 'WALK_IN' | 'RESERVATION' | 'PHONE' | 'ONLINE' | 'MANUAL';
  settlement_flow?: 'IMMEDIATE' | 'DEFERRED' | 'SPLIT';
}

// Complete ActiveOrder interface (already exists with these fields):
interface ActiveOrder {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: 'TAKEAWAY' | 'DINE_IN'; // Already exists
  table_id: number | null; // Already exists
  reservation_id: number | null; // Already exists
  guest_count: number | null; // Already exists
  is_finalized: boolean; // Already exists
  order_status: 'OPEN' | 'READY_TO_PAY' | 'COMPLETED' | 'CANCELLED'; // Already exists
  order_state: 'OPEN' | 'CLOSED'; // Already exists
  paid_amount: number; // Already exists (integer minor units)
  opened_at: string; // Already exists
  closed_at: string | null; // Already exists
  notes: string | null; // Already exists
  
  // Optional extensions for ADR-0006 alignment:
  source_flow?: 'WALK_IN' | 'RESERVATION' | 'PHONE' | 'ONLINE' | 'MANUAL';
  settlement_flow?: 'IMMEDIATE' | 'DEFERRED' | 'SPLIT';
}
```

### Sync Contracts

#### Pull: Tables
**Endpoint:** `GET /api/sync/pull` (existing sync pull endpoint)
**Query Params:** `outlet_id`, `last_sync_at`
**Response:** (extend existing sync pull response)
```json
{
  "tables": [
    {
      "table_id": 123,
      "code": "T01",
      "name": "Table 1",
      "zone": "Main Hall",
      "capacity": 4,
      "status": "AVAILABLE",
      "updated_at": "2026-03-08T10:00:00Z"
    }
  ]
}
```

**Note:** Tables may already be included in existing sync pull contract. Verify and extend if needed.

#### Push: Completed Sales (existing)
**Endpoint:** `POST /api/sync/push` (existing outbox sync)
**Payload:** (extend existing sale push payload)
```json
{
  "sales": [
    {
      "client_tx_id": "uuid-...",
      "company_id": 1,
      "outlet_id": 10,
      "service_type": "DINE_IN",
      "table_id": 123,
      "reservation_id": 456,
      "guest_count": 4,
      "items": [...],
      "payments": [...],
      "subtotal_amount": 5000,
      "tax_amount": 500,
      "total_amount": 5500,
      "sale_date": "2026-03-08T11:30:00Z"
    }
  ]
}
```

**Note:** Active order snapshots are not synced to server in real-time (offline-first). Only completed sales are pushed via outbox.

#### Push: Item Cancellation (future, Phase 5)
**Endpoint:** `POST /api/sync/push` (extend existing outbox)
**Payload:**
```json
{
  "item_cancellations": [
    {
      "cancellation_id": "uuid-...",
      "order_id": "uuid-...",
      "item_id": 555,
      "cancelled_quantity": 2,
      "reason": "Customer changed mind",
      "cancelled_by_user_id": 111,
      "cancelled_at": "2026-03-08T11:45:00Z"
    }
  ]
}
```

---

## Rollout and Migration

### Compatibility Strategy
- **Graceful Degradation:** Outlets without tables enabled continue using take-away flow only
- **Feature Flag:** `ENABLE_DINE_IN` per outlet in settings
- **Data Migration:** No breaking changes to existing sales schema (only additive fields)

### Deployment Sequence
1. **Phase 1 (Take-Away):** Deploy service mode selection, route guards
2. **Phase 2 (Dine-In Foundation):** Enable for pilot outlets with tables configured
3. **Phase 3 (Resume/Cancel):** Roll out to all dine-in outlets
4. **Phase 4 (Reservations):** Integrate reservation system (separate ADR/plan)

### Rollback Plan
- Service mode landing can be bypassed via feature flag
- Revert to direct `/products` entry if critical issues arise
- Existing offline DB remains compatible (new tables optional)

---

## Success Metrics

### Operational Metrics
- **Error Reduction:** Track wrong-outlet sales (target: <1% of daily transactions)
- **Order Accuracy:** Track item cancellations due to cashier error (target: <5%)
- **Table Turnover:** Average time from open → checkout per table
- **Snapshot Finalization Rate:** % of dine-in orders finalized before payment (target: >90%)

### User Experience Metrics
- **Tap Count:** Average taps to complete take-away sale (target: <8)
- **Tap Count:** Average taps to complete dine-in walk-in sale (target: <12)
- **Confusion Events:** Support tickets related to workflow navigation (target: <10/month)

### Technical Metrics
- **Sync Success Rate:** Order/snapshot sync completion (target: >99%)
- **Offline Resilience:** Sales completed during offline periods (no target failures)
- **State Consistency:** Zero cases of orphaned tables or duplicate orders

---

## Related Documents

- **ADR-0005:** POS Workflow Redesign, Outlet Context Guardrails, Dine-In Tables, and Reservations
- **ADR-0006:** POS Cashier Service Flows and Unified Order Lifecycle
- **POS Refactor Plan:** `apps/pos/REFACTOR_PLAN.md`
- **Offline Sale Flow:** `apps/pos/src/offline/sales.ts`
- **POS Routes:** `apps/pos/src/router/routes.ts`

---

## Open Questions and Decisions

### 1. Cancel Items Permissions
**Question:** Should cancel items require manager approval for high-value items?  
**Recommendation:** Implement role-based threshold (e.g., >$50 requires manager PIN)

### 2. Snapshot Versioning Conflicts
**Question:** How to handle concurrent edits from multiple devices?  
**Recommendation:** Use optimistic locking with `snapshot_version`; show conflict alert if mismatch

### 3. Table Auto-Release Timeout
**Question:** Should tables auto-release after X hours of inactivity?  
**Recommendation:** Add configurable timeout (default: 4 hours) with cashier notification

### 4. Split Bill in Initial Scope?
**Question:** Should Phase 4 include split bill, or defer to Phase 5?  
**Recommendation:** Defer to Phase 5; foundational `settlement_flow='SPLIT'` is present but not implemented

---

## Appendix: Workflow State Machine

### Take-Away Order State
```
┌─────────┐
│ PENDING │ (Service mode selected, no items)
└────┬────┘
     │ Add items
     v
┌─────────┐
│  DRAFT  │ (In-memory working state)
└────┬────┘
     │ Checkout
     v
┌─────────┐
│COMPLETED│ (Persisted sale)
└─────────┘
```

### Dine-In Order State
```
┌─────────┐
│  OPEN   │ (Table selected, no items)
└────┬────┘
     │ Add items
     v
┌───────────┐
│IN_PROGRESS│ (Working state, not finalized)
└────┬──────┘
     │ Finalize
     v
┌───────────┐
│READY_TO   │ (Snapshot persisted, table occupied)
│   PAY     │
└────┬──────┘
     │ Resume → IN_PROGRESS (can increase quantities)
     │ Cancel Items → READY_TO_PAY (with audit trail)
     │ Checkout
     v
┌───────────┐
│ COMPLETED │ (Sale finalized, table released)
└───────────┘
```

---

## Implementation Notes and Corrections

### Money Type Handling
**CRITICAL:** The initial draft of this plan used `REAL`/`DOUBLE` for money fields, which violates repo-wide accounting invariants. All money values MUST use integer minor units (cents) to prevent floating-point drift:

- ✅ Correct: `paid_amount INTEGER` (stores 5500 for $55.00)
- ❌ Incorrect: `paid_amount REAL` (stores 55.00, risks drift)

All schemas and interfaces in this plan have been corrected to use integer types.

### ID Type Consistency
**IMPORTANT:** The initial draft used `string` types for IDs inconsistently. The current implementation uses `number` for all entity IDs:

- ✅ `table_id: number`
- ✅ `outlet_id: number`
- ✅ `reservation_id: number`
- ❌ `table_id: string` (incorrect in original draft)

All TypeScript interfaces in this plan have been corrected to match the runtime implementation.

### Persistence Policy Clarification
**KEY DECISION:** The plan originally stated "cart remains in-memory only" for takeaway, which conflicted with the existing auto-persist behavior. The **recommended approach** (adopted in this plan):

- **All orders persist to offline DB** for recovery/sync safety
- **Lifecycle policy differs by service type:**
  - Takeaway: ephemeral by policy (auto-discard on logout/outlet switch)
  - Dine-in: durable operational state (persist until completion)

This preserves offline resilience while enforcing clear workflow boundaries.

### Reuse Existing Implementation
The majority of the workflow described in this plan **already exists** in the current codebase. Implementation should focus on:

1. **Service mode entry point** (new `/service-mode` route)
2. **Route change guards** (confirmation modal)
3. **Workflow refinements** (align with "one page, one job")
4. **Documentation and testing** (verify existing behavior)

Rather than rebuilding from scratch, extend and refine the existing runtime-service.ts and page components.

### Route Compatibility
The plan uses `/checkout` as the payment route, but the current implementation uses `/` (root). To avoid breaking changes:

- Keep `/` as the primary checkout route
- Optionally add `/checkout` as an alias
- Update post-login redirect from `/products` to `/service-mode`

### Testing Priorities
Given the high level of existing implementation, testing should focus on:

1. **Lifecycle policy enforcement** (takeaway auto-close, dine-in persistence)
2. **Route guard behavior** (save/discard/cancel confirmation)
3. **Quantity clamp edge cases** (committed_qty enforcement)
4. **Table release atomicity** (rollback on failure, verified in runtime-service.test.mjs:30)

---

**End of Implementation Plan**
