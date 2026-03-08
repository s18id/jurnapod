# Order Checkpoint & Navigation Guards

**Feature:** Kitchen-sent order checkpointing with comprehensive navigation guards  
**Target:** POS app - Dine-in order flow  
**Status:** Design Complete - Ready for Implementation  
**Version:** 1.0  
**Date:** 2026-03-08

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [User Flows](#user-flows)
5. [Technical Specification](#technical-specification)
6. [Implementation Plan](#implementation-plan)
7. [Testing Strategy](#testing-strategy)
8. [Risk Assessment](#risk-assessment)
9. [Appendices](#appendices)

---

## Overview

### Purpose

Enable dine-in cashiers to create **order checkpoints** by sending items to the kitchen, preventing accidental loss of kitchen-sent items when discarding draft additions or navigating away from the order.

### Key Capabilities

1. **Kitchen Checkpoint Creation:** Mark items as "sent to kitchen" (finalized for kitchen processing)
2. **Draft Item Management:** Add items after checkpoint without affecting kitchen-sent items
3. **Selective Discard:** Discard only unsent (draft) items while preserving kitchen-sent items
4. **Navigation Guards:** Prevent accidental navigation away from unsent items
5. **Multi-Device Safety:** Checkpoint state syncs across devices for same order

### Business Value

- **Prevents data loss:** Kitchen-sent items are never accidentally cleared
- **Improves workflow:** Cashiers can build orders incrementally (send to kitchen, add more, send again)
- **Reduces errors:** Navigation guards prevent accidental abandonment of unsent items
- **Supports dine-in patterns:** Aligns with real-world restaurant workflows (send first course, add second course later)

---

## Problem Statement

### Current Behavior (Before)

**Scenario:** Cashier takes dine-in order for Table 5
1. Adds 3 items (appetizers)
2. Wants to send to kitchen
3. **Problem:** No way to "finalize" these items
4. Adds 2 more items (mains)
5. Clicks "Clear Cart" to start over
6. **Result:** All 5 items cleared, including the 3 already sent to kitchen ❌

**Issues:**
- `is_finalized` flag exists but is not user-controlled
- No distinction between "draft items" and "kitchen-sent items"
- Discarding cart clears everything
- Navigating away with unsent items loses data silently

### Desired Behavior (After)

**Scenario:** Same cashier workflow
1. Adds 3 items (appetizers)
2. Clicks **"Send to kitchen"** → Creates checkpoint
3. Adds 2 more items (mains)
4. Clicks **"Discard Unsent"** → Only the 2 mains are removed
5. **Result:** Original 3 appetizers remain, ready for payment ✅

**Benefits:**
- Kitchen-sent items are protected
- Cashier can build orders incrementally
- Navigation guards prevent accidental loss
- Clear UI states guide the workflow

---

## Solution Architecture

### State Model

#### Active Order Context

```typescript
interface ActiveOrderContextState {
  service_type: OrderServiceType;        // "DINE_IN" | "TAKEAWAY"
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  kitchen_sent: boolean;                 // ← RENAMED from is_finalized
  order_status: OrderLifecycleStatus;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}
```

**Key change:** `is_finalized` → `kitchen_sent`
- **Rationale:** More explicit about what the flag means ("sent to kitchen" vs. vague "finalized")
- **Scope:** UI layer only (database still uses `is_finalized`)

#### Cart Line State

```typescript
interface CartLineState {
  product: RuntimeProductCatalogItem;
  qty: number;                           // Current quantity
  kitchen_sent_qty: number;              // ← RENAMED from committed_qty
  discount_amount: number;
}
```

**Key change:** `committed_qty` → `kitchen_sent_qty`
- **Rationale:** Explicit about what quantity is protected
- **Behavior:** User cannot reduce `qty` below `kitchen_sent_qty`

#### Computed Helper State

```typescript
// Exported from pos-app-state.ts
hasUnsentDineInItems: boolean;  // = service_type === "DINE_IN" && !kitchen_sent && cartLines.length > 0
```

**Usage:** Drives navigation guard decisions

### Order Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DRAFT STATE                                              │
│    - User adds items to cart                                │
│    - kitchen_sent = false                                   │
│    - kitchen_sent_qty = 0 for all items                     │
│    - Footer shows: "Send to kitchen" button (dine-in)       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. CHECKPOINT CREATED (Send to Kitchen)                     │
│    - User clicks "Send to kitchen"                          │
│    - kitchen_sent = true                                    │
│    - kitchen_sent_qty = current qty for all items           │
│    - Footer button changes to: "Continue to cart"           │
│    - Order persisted with checkpoint flag                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. INCREMENTAL ADDITIONS (Optional)                         │
│    - User adds more items                                   │
│    - New items: kitchen_sent_qty = 0                        │
│    - Old items: kitchen_sent_qty = previous qty             │
│    - Cart now has MIX of sent and unsent items              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. SELECTIVE DISCARD (Optional)                             │
│    - User navigates to Cart                                 │
│    - Clicks "Discard Unsent"                                │
│    - Only items with kitchen_sent_qty = 0 are removed       │
│    - Items with kitchen_sent_qty > 0 remain                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CHECKOUT                                                 │
│    - User proceeds to checkout                              │
│    - Only kitchen-sent items can be paid                    │
│    - Validation: require kitchen_sent = true for dine-in    │
│    - After payment: order closed, table released            │
└─────────────────────────────────────────────────────────────┘
```

### Navigation Architecture

#### Navigation Points

The POS app has **two navigation systems**:

1. **Desktop/Tablet:** Header navigation bar
   - Products, Tables, Reservations, Cart, Checkout, Settings
   - "Pay now" quick button
   - "Settings" button
   
2. **Mobile:** Bottom tab bar
   - Tables, Reservations, Products, Cart, Checkout

#### Guard Scope

**When to block navigation:**
- ✅ User is on ProductsPage
- ✅ Service type is DINE_IN
- ✅ `kitchen_sent = false` (not sent to kitchen yet)
- ✅ `cartLines.length > 0` (has items)
- ✅ Attempting to navigate away

**When to allow navigation:**
- ✅ Service type is TAKEAWAY (no checkpoint needed)
- ✅ `kitchen_sent = true` (already sent to kitchen)
- ✅ No items in cart
- ✅ User clicks "Send to kitchen" first (creates checkpoint, then navigates)

#### Guard Modal Flow

```
User attempts navigation
         ↓
   Has unsent dine-in items?
         ↓
    [YES] → Show Guard Modal
         ↓
    ┌─────────────────────────────────┐
    │  "Unsent items in order"        │
    │  What would you like to do?     │
    │                                 │
    │  [Send to kitchen and continue] │ → Creates checkpoint → Navigates
    │  [Discard unsent items]         │ → Clears cart → Navigates
    │  [Stay on this page]            │ → Closes modal → Stays
    └─────────────────────────────────┘
         ↓
    [NO] → Navigate directly
```

---

## User Flows

### Flow 1: Dine-In Order with Checkpoint

**Actor:** Cashier at Table 5

1. **Select Table**
   - Navigate to Tables page
   - Click "Use table" on Table 5
   - Redirected to ProductsPage

2. **Add Initial Items**
   - Add 3 appetizer items
   - Footer shows: "Draft order • Send to kitchen before payment"
   - Footer button: **"Send to kitchen"** (enabled)

3. **Send to Kitchen**
   - Click "Send to kitchen"
   - Checkpoint created:
     - `kitchen_sent = true`
     - All 3 items: `kitchen_sent_qty = 1`
   - Footer shows: "✓ Sent to kitchen • Ready for payment or add more items"
   - Footer button changes to: **"Continue to cart"**

4. **Add More Items (Optional)**
   - Add 2 main course items
   - New items: `kitchen_sent_qty = 0`
   - Cart now has:
     - Items 1-3: `qty = 1, kitchen_sent_qty = 1` (protected)
     - Items 4-5: `qty = 1, kitchen_sent_qty = 0` (draft)

5. **Navigate to Cart**
   - Click "Continue to cart" (no guard, already sent)
   - Cart page shows:
     - Two buttons: **"Discard Unsent"** | **"Clear All"**
     - "Discard Unsent" enabled (has unsent items)

6. **Discard Unsent Items**
   - Click "Discard Unsent"
   - Items 4-5 removed
   - Items 1-3 remain
   - Buttons change to: **"Discard Unsent"** (disabled) | **"Clear All"**

7. **Proceed to Checkout**
   - Click "Checkout"
   - Pay for 3 items
   - Order closed, table released

### Flow 2: Navigation Guard Trigger

**Actor:** Cashier with unsent items

1. **Add Items (No Send)**
   - On ProductsPage, dine-in mode
   - Add 3 items
   - **Do NOT click "Send to kitchen"**

2. **Attempt Navigation**
   - Click header "Cart" button (or any nav button)
   - **Navigation blocked** → Guard modal appears

3. **Guard Modal - Option A**
   - Click **"Send to kitchen and continue"**
   - Checkpoint created
   - Navigates to Cart page

4. **Guard Modal - Option B**
   - Click **"Discard unsent items"**
   - Cart cleared
   - Table released
   - Navigates to Cart page (empty)

5. **Guard Modal - Option C**
   - Click **"Stay on this page"**
   - Modal closes
   - Stays on ProductsPage
   - Cart unchanged

### Flow 3: Service Type Switching with Unsent Items

**Actor:** Cashier switching from dine-in to takeaway

1. **Dine-in with Unsent Items**
   - Table 5 selected
   - 3 items added (not sent to kitchen)

2. **Click Takeaway Button**
   - Guard modal appears (same as navigation guard)
   - Options:
     - "Send to kitchen and switch" → Creates checkpoint first, then switches
     - "Discard and switch" → Clears cart, releases table, switches
     - "Cancel" → Stays in dine-in mode

### Flow 4: Takeaway Order (No Guard)

**Actor:** Cashier taking takeaway order

1. **Select Takeaway**
   - On ProductsPage, select "Takeaway" mode

2. **Add Items**
   - Add 5 items
   - Footer shows: **"Continue to cart"** (always)
   - No "Send to kitchen" button (not applicable)

3. **Navigate Freely**
   - Click any navigation button
   - **No guard** (takeaway doesn't use checkpoints)
   - Direct navigation

4. **Checkout**
   - No `kitchen_sent` validation
   - Can pay for draft items directly

---

## Technical Specification

### Database Schema

**No changes required.** The database layer continues to use `is_finalized` field name.

**Mapping at persistence boundary:**

```typescript
// UI → Database
kitchen_sent → is_finalized

// Database → UI
is_finalized → kitchen_sent
```

**Rationale:** 
- Preserve existing sync contracts
- No migration needed
- Field rename is UI-only for clarity

### API / Runtime Service

#### New Operations

##### `createOrderCheckpoint()`

**Location:** `apps/pos/src/router/pos-app-state.ts`

**Purpose:** Mark all current cart items as "sent to kitchen"

**Behavior:**
```typescript
function createOrderCheckpoint(): void {
  // 1. Mark all current items as kitchen_sent
  setCart((prev) => {
    const next = { ...prev };
    for (const key in next) {
      next[key] = {
        ...next[key],
        kitchen_sent_qty: next[key].qty
      };
    }
    return next;
  });
  
  // 2. Mark order context as kitchen_sent
  setActiveOrderContext((prev) => ({
    ...prev,
    kitchen_sent: true
  }));
  
  // 3. Auto-save triggers via useEffect in Router.tsx
}
```

**Side effects:**
- Triggers auto-save to persist checkpoint
- UI updates (footer button changes, status message)

---

##### `discardDraftItems()`

**Location:** `apps/pos/src/router/pos-app-state.ts`

**Purpose:** Remove only unsent items, preserve kitchen-sent items

**Behavior:**
```typescript
function discardDraftItems(): void {
  setCart((prev) => {
    const next: CartState = {};
    for (const [key, line] of Object.entries(prev)) {
      if (line.kitchen_sent_qty > 0) {
        // Keep line, reset qty to kitchen_sent_qty
        next[key] = {
          ...line,
          qty: line.kitchen_sent_qty
        };
      }
      // Lines with kitchen_sent_qty = 0 are discarded
    }
    return next;
  });
  
  // If no items remain, clear entire order
  if (Object.keys(cart).length === 0) {
    clearCart();
  }
}
```

**Side effects:**
- May clear entire cart if no kitchen-sent items
- Triggers auto-save
- Table remains occupied (not released unless cart fully cleared)

---

##### `hasUnsentDineInItems` (computed)

**Location:** `apps/pos/src/router/pos-app-state.ts`

**Purpose:** Helper state for navigation guard decisions

**Computation:**
```typescript
const hasUnsentDineInItems = useMemo(
  () => 
    activeOrderContext.service_type === "DINE_IN" &&
    !activeOrderContext.kitchen_sent &&
    cartLines.length > 0,
  [activeOrderContext, cartLines]
);
```

**Usage:**
- Exported from `usePosAppState()`
- Used in AppLayout.tsx for navigation guards
- Used in ProductsPage.tsx for browser warning

---

#### Modified Operations

##### `upsertCartLine()`

**Location:** `apps/pos/src/features/cart/useCart.ts`

**Change:** Rename `committed_qty` → `kitchen_sent_qty`

**Before:**
```typescript
const minQty = existing.committed_qty;
```

**After:**
```typescript
const minQty = existing.kitchen_sent_qty;
```

**Behavior unchanged:** Still enforces minimum quantity for kitchen-sent items

---

##### Hydration: `hydrateFromSnapshot()`

**Location:** `apps/pos/src/router/Router.tsx`

**Change:** Map DB field to UI field

**Before:**
```typescript
committed_qty: order.is_finalized ? line.qty : 0,
is_finalized: order.is_finalized,
```

**After:**
```typescript
kitchen_sent_qty: order.kitchen_sent ? line.qty : 0,
kitchen_sent: order.kitchen_sent,
```

**Note:** `order.kitchen_sent` is mapped from DB `is_finalized` at runtime service boundary

---

##### Persistence: `persistCurrentOrderSnapshot()`

**Location:** `apps/pos/src/router/Router.tsx`

**Change:** Map UI field to DB field

**Before:**
```typescript
is_finalized: activeOrderContext.is_finalized,
```

**After:**
```typescript
kitchen_sent: activeOrderContext.kitchen_sent,  // Maps to DB is_finalized
```

---

### UI Components

#### ProductsPage Footer

**Current State:**
```tsx
<Button onClick={() => navigate(routes.cart.path)}>
  Continue to cart
</Button>
```

**New State (Dine-in):**

```tsx
{activeOrderContext.service_type === "DINE_IN" ? (
  activeOrderContext.kitchen_sent ? (
    // After checkpoint
    <Button onClick={() => navigate(routes.cart.path)}>
      Continue to cart
    </Button>
  ) : (
    // Before checkpoint
    <Button onClick={createOrderCheckpoint} disabled={cartLines.length === 0}>
      Send to kitchen
    </Button>
  )
) : (
  // Takeaway
  <Button onClick={() => navigate(routes.cart.path)} disabled={cartLines.length === 0}>
    Continue to cart
  </Button>
)}
```

**Status Messages:**

```tsx
{activeOrderContext.kitchen_sent ? (
  <div style={{ color: "#166534" }}>
    ✓ Sent to kitchen • Ready for payment or add more items
  </div>
) : cartLines.length > 0 ? (
  <div style={{ color: "#9a3412" }}>
    Draft order • Send to kitchen before payment
  </div>
) : null}
```

---

#### CartPage Clear Buttons

**Current State:**
```tsx
<Button onClick={clearCart}>Clear All</Button>
```

**New State (Conditional):**

```tsx
{hasKitchenSentItems ? (
  <>
    <Button onClick={discardDraftItems} disabled={!hasUnsentItems}>
      Discard Unsent
    </Button>
    <Button onClick={handleClearAll} variant="danger">
      Clear All
    </Button>
  </>
) : (
  <Button onClick={handleClearAll}>
    Clear Cart
  </Button>
)}
```

**Helper State:**
```typescript
const hasKitchenSentItems = cartLines.some(line => line.kitchen_sent_qty > 0);
const hasUnsentItems = cartLines.some(line => line.qty > line.kitchen_sent_qty);
```

---

#### AppLayout Navigation Guard

**Guard Interceptor:**

```typescript
const handleNavigationAttempt = (targetPath: string) => {
  if (hasUnsentDineInItems && location.pathname === routes.products.path) {
    setNavigationGuard({ isOpen: true, targetPath });
  } else {
    navigate(targetPath);
  }
};
```

**Applied to:**
- Header nav buttons (desktop): `onClick={() => handleNavigationAttempt(item.path)}`
- Bottom tab bar (mobile): `onClick={() => handleNavigationAttempt(tab.path)}`
- "Pay now" button: `onClick={() => handleNavigationAttempt(routes.checkout.path)}`
- "Settings" button: `onClick={() => handleNavigationAttempt(routes.settings.path)}`

**Guard Modal:**

```tsx
<Modal
  isOpen={navigationGuard.isOpen}
  onClose={() => setNavigationGuard({ isOpen: false, targetPath: "" })}
  title="Unsent items in order"
>
  <div>You have unsent items in this order. What would you like to do?</div>
  
  <Button onClick={handleSendToKitchenAndNavigate}>
    Send to kitchen and continue
  </Button>
  
  <Button onClick={handleDiscardAndNavigate} variant="danger">
    Discard unsent items
  </Button>
  
  <Button onClick={handleCancelNavigation} variant="secondary">
    Stay on this page
  </Button>
</Modal>
```

**Modal Actions:**

```typescript
// Option 1: Send to kitchen, then navigate
const handleSendToKitchenAndNavigate = () => {
  createOrderCheckpoint();
  navigate(navigationGuard.targetPath);
  setNavigationGuard({ isOpen: false, targetPath: "" });
};

// Option 2: Discard items, then navigate
const handleDiscardAndNavigate = async () => {
  // Release table if dine-in
  if (activeOrderContext.service_type === "DINE_IN" && activeOrderContext.table_id) {
    await context.runtime.setOutletTableStatus(scope, activeOrderContext.table_id, "AVAILABLE");
  }
  clearCart();
  navigate(navigationGuard.targetPath);
  setNavigationGuard({ isOpen: false, targetPath: "" });
};

// Option 3: Cancel navigation
const handleCancelNavigation = () => {
  setNavigationGuard({ isOpen: false, targetPath: "" });
};
```

---

#### Browser Close Warning

**Location:** `apps/pos/src/pages/ProductsPage.tsx`

**Implementation:**

```typescript
useEffect(() => {
  if (hasUnsentDineInItems) {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsent items. Are you sure?";
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }
}, [hasUnsentDineInItems]);
```

**Behavior:**
- Shows browser warning when closing tab/window with unsent dine-in items
- Only applies when on ProductsPage
- Does not apply to takeaway orders

---

### Validation Rules

#### Checkout Validation

**Location:** `apps/pos/src/pages/CheckoutPage.tsx`

**Rule:** Dine-in orders must have `kitchen_sent = true` before payment

**Before:**
```typescript
const orderNotFinalized = !activeOrderContext.is_finalized;
```

**After:**
```typescript
const orderNotKitchenSent = !activeOrderContext.kitchen_sent;
```

**Error message:** "Send order to kitchen before payment" (if applicable)

---

#### Cart Line Quantity Validation

**Location:** `apps/pos/src/features/cart/useCart.ts`

**Rule:** Cannot reduce quantity below `kitchen_sent_qty`

**Implementation:**
```typescript
const minQty = existing.kitchen_sent_qty;
const nextQty = Math.max(minQty, patch.qty ?? existing.qty);
```

**UI feedback:** 
- ProductsPage: "-" button disabled when `qty === kitchen_sent_qty`
- CartPage: Quantity input min value = `kitchen_sent_qty`

---

## Implementation Plan

### File Changes Summary

| # | File | Changes | Lines | Priority |
|---|------|---------|-------|----------|
| 1 | `apps/pos/src/router/pos-app-state.ts` | Add checkpoint functions, rename types, export helpers | ~80 | P0 |
| 2 | `apps/pos/src/router/Router.tsx` | Update hydration/persistence mappings | ~25 | P0 |
| 3 | `apps/pos/src/services/runtime-service.ts` | Update type interfaces & mappings | ~20 | P0 |
| 4 | `apps/pos/src/features/cart/useCart.ts` | Rename committed_qty → kitchen_sent_qty | ~10 | P0 |
| 5 | `apps/pos/src/pages/ProductsPage.tsx` | Footer buttons, status, browser warning | ~60 | P1 |
| 6 | `apps/pos/src/pages/CartPage.tsx` | Conditional clear buttons, rename refs | ~70 | P1 |
| 7 | `apps/pos/src/pages/CheckoutPage.tsx` | Rename is_finalized → kitchen_sent | ~5 | P1 |
| 8 | `apps/pos/src/router/AppLayout.tsx` | Navigation guards, guard modal | ~120 | P1 |
| 9 | `apps/pos/src/features/cart/CartList.tsx` | Update display labels (if needed) | ~5 | P2 |

**Total:** 9 files, ~395 lines

### Implementation Phases

#### Phase 0: Preparation
- [ ] Create feature branch: `feature/order-checkpoint-navigation-guards`
- [ ] Review current codebase for additional `is_finalized` / `committed_qty` references
- [ ] Backup production database (safety)

#### Phase 1: Core State Management (P0)
**Goal:** Establish checkpoint data model

- [ ] **File 1:** `pos-app-state.ts`
  - [ ] Rename type: `is_finalized` → `kitchen_sent`
  - [ ] Rename type: `committed_qty` → `kitchen_sent_qty`
  - [ ] Add function: `createOrderCheckpoint()`
  - [ ] Add function: `discardDraftItems()`
  - [ ] Add computed: `hasUnsentDineInItems`
  - [ ] Export all new functions/state

- [ ] **File 2:** `Router.tsx`
  - [ ] Update `hydrateFromSnapshot()`: Map DB → UI fields
  - [ ] Update `persistCurrentOrderSnapshot()`: Map UI → DB fields

- [ ] **File 3:** `runtime-service.ts`
  - [ ] Update `UpsertActiveOrderSnapshotInput` interface
  - [ ] Update `upsertActiveOrderSnapshot()` implementation
  - [ ] Update return type mappings (DB → UI)

- [ ] **File 4:** `useCart.ts`
  - [ ] Rename `committed_qty` → `kitchen_sent_qty`
  - [ ] Update min qty enforcement logic

**Verification:**
- [ ] TypeScript compiles with no errors
- [ ] Existing tests pass (if any)
- [ ] Manual test: Load existing order, verify field mapping

---

#### Phase 2: UI Components (P1)
**Goal:** Update user-facing components

- [ ] **File 5:** `ProductsPage.tsx`
  - [ ] Import `createOrderCheckpoint`, `hasUnsentDineInItems`
  - [ ] Update footer button logic (dine-in vs takeaway)
  - [ ] Add status messages (draft vs kitchen-sent)
  - [ ] Add browser close warning (useEffect)
  - [ ] Update `canRemoveProduct()` to use `kitchen_sent_qty`

- [ ] **File 6:** `CartPage.tsx`
  - [ ] Import `discardDraftItems`
  - [ ] Add helper state: `hasKitchenSentItems`, `hasUnsentItems`
  - [ ] Replace "Clear All" with conditional buttons
  - [ ] Update all `is_finalized` → `kitchen_sent` refs
  - [ ] Update all `committed_qty` → `kitchen_sent_qty` refs
  - [ ] Update cancellation labels

- [ ] **File 7:** `CheckoutPage.tsx`
  - [ ] Rename validation flag: `orderNotFinalized` → `orderNotKitchenSent`

**Verification:**
- [ ] Can create checkpoint in ProductsPage (dine-in)
- [ ] Button changes from "Send to kitchen" → "Continue to cart"
- [ ] Can discard unsent items in CartPage
- [ ] Kitchen-sent items remain after discard

---

#### Phase 3: Navigation Guards (P1)
**Goal:** Prevent accidental navigation with unsent items

- [ ] **File 8:** `AppLayout.tsx`
  - [ ] Import `hasUnsentDineInItems`, `createOrderCheckpoint`, `discardDraftItems`
  - [ ] Add guard modal state
  - [ ] Add `handleNavigationAttempt()` interceptor
  - [ ] Update all navigation points:
    - [ ] Header nav buttons
    - [ ] Bottom tab bar
    - [ ] "Pay now" button
    - [ ] "Settings" button
  - [ ] Add guard modal component
  - [ ] Implement modal action handlers

**Verification:**
- [ ] Guard modal appears when navigating with unsent dine-in items
- [ ] Can send to kitchen and continue
- [ ] Can discard and continue
- [ ] Can cancel and stay
- [ ] No guard for takeaway orders
- [ ] No guard when already kitchen-sent

---

#### Phase 4: Polish & Edge Cases (P2)

- [ ] **File 9:** `CartList.tsx` (if exists)
  - [ ] Update display labels for kitchen-sent qty

- [ ] Service type switcher guard integration
- [ ] Review all console.log statements (remove debug logs)
- [ ] Add JSDoc comments to new functions
- [ ] Update error messages for clarity

**Verification:**
- [ ] All user flows work end-to-end
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] Clean code review

---

#### Phase 5: Testing & QA

See [Testing Strategy](#testing-strategy) section below.

---

#### Phase 6: Documentation & Deployment

- [x] Create feature documentation (this file)
- [ ] Update user-facing help docs (if applicable)
- [ ] Create demo video/screenshots
- [ ] Prepare release notes
- [ ] Deploy to staging
- [ ] Stakeholder review
- [ ] Deploy to production

---

### Rollback Plan

**If critical issues found after deployment:**

1. **Database:** No schema changes, no migration needed → **No rollback required**
2. **Code:** Revert feature branch merge → **Instant rollback**
3. **Existing orders:** Field mapping preserves backward compatibility → **No data loss**

**Rollback procedure:**
```bash
git revert <merge-commit-hash>
git push origin main
npm run build
# Deploy to production
```

---

## Testing Strategy

### Unit Tests (If Applicable)

**Test file:** `apps/pos/src/router/__tests__/pos-app-state.test.ts`

#### Test: `createOrderCheckpoint()`

```typescript
it('should mark all cart items as kitchen_sent', () => {
  // Setup: Add 3 items to cart
  upsertCartLine(product1, { qty: 2 });
  upsertCartLine(product2, { qty: 1 });
  upsertCartLine(product3, { qty: 3 });
  
  // Execute
  createOrderCheckpoint();
  
  // Assert
  expect(cart[product1.item_id].kitchen_sent_qty).toBe(2);
  expect(cart[product2.item_id].kitchen_sent_qty).toBe(1);
  expect(cart[product3.item_id].kitchen_sent_qty).toBe(3);
  expect(activeOrderContext.kitchen_sent).toBe(true);
});
```

#### Test: `discardDraftItems()`

```typescript
it('should remove only unsent items', () => {
  // Setup: Kitchen-sent items + draft items
  upsertCartLine(product1, { qty: 2 });  // Will be kitchen-sent
  upsertCartLine(product2, { qty: 1 });  // Will be kitchen-sent
  createOrderCheckpoint();
  upsertCartLine(product3, { qty: 3 });  // Draft item
  
  // Execute
  discardDraftItems();
  
  // Assert
  expect(cart[product1.item_id]).toBeDefined();
  expect(cart[product2.item_id]).toBeDefined();
  expect(cart[product3.item_id]).toBeUndefined();
});

it('should reset qty to kitchen_sent_qty for partially increased items', () => {
  // Setup: Kitchen-sent item with increased qty
  upsertCartLine(product1, { qty: 2 });
  createOrderCheckpoint();
  upsertCartLine(product1, { qty: 5 });  // Increase qty
  
  // Execute
  discardDraftItems();
  
  // Assert
  expect(cart[product1.item_id].qty).toBe(2);
  expect(cart[product1.item_id].kitchen_sent_qty).toBe(2);
});
```

#### Test: `hasUnsentDineInItems` computed

```typescript
it('should be true for dine-in with unsent items', () => {
  setServiceType('DINE_IN');
  upsertCartLine(product1, { qty: 1 });
  
  expect(hasUnsentDineInItems).toBe(true);
});

it('should be false after kitchen checkpoint', () => {
  setServiceType('DINE_IN');
  upsertCartLine(product1, { qty: 1 });
  createOrderCheckpoint();
  
  expect(hasUnsentDineInItems).toBe(false);
});

it('should be false for takeaway orders', () => {
  setServiceType('TAKEAWAY');
  upsertCartLine(product1, { qty: 1 });
  
  expect(hasUnsentDineInItems).toBe(false);
});
```

---

### Integration Tests

#### Test: Checkpoint Persistence

```typescript
it('should persist kitchen_sent flag to database as is_finalized', async () => {
  // Setup
  setServiceType('DINE_IN');
  setActiveTableId(5);
  upsertCartLine(product1, { qty: 2 });
  
  // Execute
  createOrderCheckpoint();
  await waitForPersistence();  // Wait for auto-save
  
  // Assert: Check database
  const dbOrder = await db.active_orders.get(currentActiveOrderId);
  expect(dbOrder.is_finalized).toBe(true);
});
```

#### Test: Hydration from Persisted Checkpoint

```typescript
it('should hydrate kitchen_sent state from database', async () => {
  // Setup: Create order with checkpoint in DB
  const orderId = uuid();
  await db.active_orders.put({
    order_id: orderId,
    is_finalized: true,  // DB field
    // ... other fields
  });
  await db.active_order_lines.bulkPut([
    { order_id: orderId, item_id: 1, qty: 2, ... }
  ]);
  
  // Execute: Hydrate
  await hydrateFromSnapshot({ order_id: orderId, ... });
  
  // Assert
  expect(activeOrderContext.kitchen_sent).toBe(true);
  expect(cart[1].kitchen_sent_qty).toBe(2);
});
```

---

### Manual Testing Checklist

#### Checkpoint Creation

- [ ] **Dine-in order - Create checkpoint**
  - Add 3 items
  - Click "Send to kitchen"
  - Verify: Button changes to "Continue to cart"
  - Verify: Status shows "✓ Sent to kitchen"
  - Verify: All items show `kitchen_sent_qty = 1`

- [ ] **Add items after checkpoint**
  - Send to kitchen (3 items)
  - Add 2 more items
  - Verify: Old items have `kitchen_sent_qty > 0`
  - Verify: New items have `kitchen_sent_qty = 0`

- [ ] **Takeaway order - No checkpoint**
  - Select takeaway
  - Add items
  - Verify: No "Send to kitchen" button
  - Verify: Always shows "Continue to cart"

---

#### Navigation Guards

- [ ] **Header navigation (desktop)**
  - ProductsPage with unsent dine-in items
  - Click "Cart" button → Guard modal appears
  - Click "Tables" button → Guard modal appears
  - Click "Settings" button → Guard modal appears
  - Click "Pay now" button → Guard modal appears

- [ ] **Bottom tab navigation (mobile)**
  - ProductsPage with unsent dine-in items
  - Tap each tab → Guard modal appears

- [ ] **Guard modal - Send to kitchen**
  - Trigger guard
  - Click "Send to kitchen and continue"
  - Verify: Checkpoint created
  - Verify: Navigates to target page

- [ ] **Guard modal - Discard**
  - Trigger guard
  - Click "Discard unsent items"
  - Verify: Cart cleared
  - Verify: Table released
  - Verify: Navigates to target page

- [ ] **Guard modal - Cancel**
  - Trigger guard
  - Click "Stay on this page"
  - Verify: Modal closes
  - Verify: Stays on ProductsPage
  - Verify: Cart unchanged

- [ ] **No guard when kitchen-sent**
  - Send to kitchen first
  - Click any navigation button
  - Verify: Direct navigation (no modal)

- [ ] **No guard for takeaway**
  - Takeaway mode with items
  - Click any navigation button
  - Verify: Direct navigation (no modal)

- [ ] **Browser close warning**
  - ProductsPage with unsent dine-in items
  - Attempt to close browser tab
  - Verify: Browser warning appears

---

#### Discard Functionality

- [ ] **Cart page - No kitchen-sent items**
  - Add items (don't send to kitchen)
  - Navigate to Cart
  - Verify: Single "Clear Cart" button

- [ ] **Cart page - Kitchen-sent items only**
  - Send to kitchen
  - Navigate to Cart
  - Verify: "Discard Unsent" (disabled) + "Clear All"

- [ ] **Cart page - Mixed items**
  - Send to kitchen (3 items)
  - Add 2 more items
  - Navigate to Cart
  - Verify: "Discard Unsent" (enabled) + "Clear All"

- [ ] **Discard unsent**
  - Mixed state (see above)
  - Click "Discard Unsent"
  - Verify: Only unsent items removed
  - Verify: Kitchen-sent items remain

- [ ] **Clear all**
  - Kitchen-sent items present
  - Click "Clear All"
  - Verify: Everything removed
  - Verify: Table released

---

#### Item Quantity Validation

- [ ] **ProductsPage - Cannot reduce below kitchen_sent_qty**
  - Send item to kitchen (qty = 2)
  - Try to reduce qty using "-" button
  - Verify: Can reduce to 2, not below

- [ ] **CartPage - Min qty enforcement**
  - Send item to kitchen (qty = 3)
  - Try to change qty in cart
  - Verify: Cannot set below 3

- [ ] **Item cancellation (kitchen-sent)**
  - Send to kitchen
  - Navigate to Cart
  - Use "Cancel finalized item(s)" section
  - Verify: Can cancel kitchen-sent qty
  - Verify: Creates cancellation record

---

#### Checkout Validation

- [ ] **Dine-in - Require kitchen-sent**
  - Add items (don't send)
  - Navigate to Checkout
  - Verify: Cannot complete payment
  - Verify: Error message shown

- [ ] **Dine-in - After kitchen-sent**
  - Send to kitchen
  - Navigate to Checkout
  - Verify: Can complete payment

- [ ] **Takeaway - No validation**
  - Add items (don't send)
  - Navigate to Checkout
  - Verify: Can complete payment immediately

---

#### Multi-Device Sync

- [ ] **Device A sends to kitchen**
  - Create order, send to kitchen
  - Verify: Syncs to server

- [ ] **Device B loads order**
  - Load same order on Device B
  - Verify: `kitchen_sent = true` appears
  - Verify: Items show correct `kitchen_sent_qty`

- [ ] **Device B adds items**
  - Add new items on Device B
  - Verify: New items have `kitchen_sent_qty = 0`
  - Verify: Syncs back to Device A

---

#### Edge Cases

- [ ] **Empty cart after discard**
  - Send 3 items to kitchen
  - Add 0 new items
  - Discard unsent
  - Verify: Kitchen-sent items remain (cart not cleared)

- [ ] **Service type switch with checkpoint**
  - Dine-in, send to kitchen
  - Switch to takeaway
  - Verify: Checkpoint preserved (or ask user)

- [ ] **Outlet switch with unsent items**
  - Has unsent items
  - Switch outlet
  - Verify: Guard/confirmation shown
  - Verify: Cart cleared after confirm

- [ ] **Order reload after checkpoint**
  - Create checkpoint
  - Close app
  - Reopen app
  - Load same order
  - Verify: Checkpoint state restored

---

### Performance Testing

- [ ] **Large cart (50+ items)**
  - Add 50 items
  - Send to kitchen
  - Add 50 more items
  - Discard unsent
  - Verify: No lag, smooth operation

- [ ] **Rapid navigation attempts**
  - Unsent items
  - Click navigation buttons rapidly
  - Verify: Guard modal doesn't stack/break

- [ ] **Offline checkpoint**
  - Go offline
  - Create checkpoint
  - Go online
  - Verify: Syncs correctly

---

### Accessibility Testing

- [ ] **Keyboard navigation**
  - Tab through guard modal
  - Verify: All buttons focusable
  - Verify: Can close with Escape key

- [ ] **Screen reader**
  - Trigger guard modal
  - Verify: Modal title announced
  - Verify: Button labels clear

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| **Navigation guard blocks all navigation** | Low | Critical | Comprehensive testing; add bypass mechanism (Settings page) | Dev |
| **Service switcher conflicts with guard** | Medium | High | Coordinate guard state; single source of truth for modal state | Dev |
| **Browser warning too aggressive** | Low | Medium | Only show for dine-in unsent, provide clear message | Dev |
| **Sync race condition (multi-device)** | Low | Medium | Test thoroughly; rely on existing sync conflict resolution | Dev |
| **Performance degradation (large carts)** | Low | Low | Use useMemo for computed values; test with 100+ items | Dev |
| **Button state confusion** | Medium | Low | Clear status messages, disabled states, tooltips | UX |

### Business Risks

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| **User confusion (two discard buttons)** | Medium | Medium | Clear labeling, training materials, help tooltips | Product |
| **Workflow disruption** | Low | High | Gradual rollout, training, feedback loop | Product |
| **Incorrect kitchen orders** | Low | Critical | Validation rules, confirmation dialogs, audit trail | Product |
| **Lost revenue (cleared orders)** | Low | Critical | Navigation guards prevent accidental loss | Product |

### Rollback Risks

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| **Cannot rollback (DB migration)** | None | N/A | No DB migration required → Zero rollback risk | DevOps |
| **Data loss on rollback** | None | N/A | Field mapping preserves backward compatibility | Dev |
| **Orphaned checkpoints** | Low | Low | Existing orders continue to work; cleanup script if needed | Dev |

---

## Appendices

### Appendix A: Field Mapping Reference

| UI Layer | Database Layer | Type | Notes |
|----------|----------------|------|-------|
| `kitchen_sent` | `is_finalized` | `boolean` | Renamed for clarity in UI |
| `kitchen_sent_qty` | N/A | `number` | Computed from `qty` when loading |
| `hasUnsentDineInItems` | N/A | `boolean` | Computed helper state |

**Mapping Direction:**

```
UI → Database (Persistence)
  kitchen_sent → is_finalized
  (kitchen_sent_qty stored as qty in lines table when kitchen_sent = true)

Database → UI (Hydration)
  is_finalized → kitchen_sent
  (kitchen_sent_qty = is_finalized ? qty : 0)
```

---

### Appendix B: Component Hierarchy

```
AppLayout.tsx
├─ Navigation Guards (all nav buttons intercepted)
├─ Guard Modal Component
│  ├─ "Send to kitchen and continue"
│  ├─ "Discard unsent items"
│  └─ "Stay on this page"
└─ IonContent
    ├─ ProductsPage.tsx
    │  ├─ Footer: "Send to kitchen" button (dine-in, !kitchen_sent)
    │  ├─ Footer: "Continue to cart" button (dine-in, kitchen_sent OR takeaway)
    │  ├─ Status message
    │  └─ Browser close warning (useEffect)
    ├─ CartPage.tsx
    │  ├─ Conditional clear buttons
    │  │  ├─ No kitchen-sent: "Clear Cart"
    │  │  └─ Has kitchen-sent: "Discard Unsent" + "Clear All"
    │  └─ Item cancellation section
    └─ CheckoutPage.tsx
       └─ Validation: Require kitchen_sent for dine-in
```

---

### Appendix C: State Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     POS APP STATE                           │
│  (pos-app-state.ts)                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  activeOrderContext: {                                      │
│    kitchen_sent: boolean                                    │
│  }                                                          │
│                                                             │
│  cart: Record<number, {                                     │
│    qty: number,                                             │
│    kitchen_sent_qty: number                                 │
│  }>                                                         │
│                                                             │
│  Computed:                                                  │
│    hasUnsentDineInItems: boolean                            │
│                                                             │
│  Actions:                                                   │
│    createOrderCheckpoint()                                  │
│    discardDraftItems()                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                   PERSISTENCE LAYER                         │
│  (Router.tsx - auto-save)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  persistCurrentOrderSnapshot()                              │
│    → Maps kitchen_sent → is_finalized                       │
│    → Saves to IndexedDB via runtime service                 │
│                                                             │
│  hydrateFromSnapshot()                                      │
│    → Maps is_finalized → kitchen_sent                       │
│    → Loads from IndexedDB                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                          │
│  (IndexedDB via offline-db/dexie)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  active_orders: {                                           │
│    order_id: string,                                        │
│    is_finalized: boolean  ← DB field name                   │
│  }                                                          │
│                                                             │
│  active_order_lines: {                                      │
│    order_id: string,                                        │
│    item_id: number,                                         │
│    qty: number                                              │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                      SYNC LAYER                             │
│  (outbox-sender.ts, sync-pull.ts)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Outbox Job: SYNC_POS_ORDER_UPDATE                          │
│    Payload: { is_finalized: boolean }                       │
│                                                             │
│  Server: Receives is_finalized flag                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Appendix D: Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|-------------------------|
| 2026-03-08 | Rename `is_finalized` → `kitchen_sent` in UI | More explicit about intent; aligns with user mental model | Keep `is_finalized`, add `kitchen_sent` alias |
| 2026-03-08 | No database migration | Preserve sync contracts; reduce deployment risk | Create new `kitchen_sent` column in DB |
| 2026-03-08 | Guard all navigation points | Comprehensive safety; prevent accidental data loss | Guard only specific routes |
| 2026-03-08 | Conditional clear buttons (Option 3D) | Context-aware; simple when possible, explicit when needed | Two buttons always, single button with modal, dropdown |
| 2026-03-08 | Require `kitchen_sent = true` for dine-in checkout | Enforce workflow; prevent paying for unsent items | Allow draft checkout with warning |
| 2026-03-08 | No checkpoint for takeaway | Takeaway orders don't need kitchen coordination | Apply checkpoint to all service types |
| 2026-03-08 | Browser warning for unsent items | Extra safety layer; prevent accidental browser close | No browser warning (rely on navigation guards only) |

---

### Appendix E: Glossary

| Term | Definition |
|------|------------|
| **Checkpoint** | A snapshot of the current order state, marking items as "sent to kitchen" |
| **Kitchen-sent** | Items that have been committed to the kitchen and cannot be freely removed |
| **Draft items** | Items added to cart but not yet sent to kitchen |
| **Unsent items** | Same as draft items; items with `kitchen_sent_qty = 0` |
| **Navigation guard** | UI mechanism that intercepts navigation attempts and shows confirmation modal |
| **Guard modal** | Confirmation dialog shown when user attempts to navigate with unsent items |
| **Discard unsent** | Action that removes only draft items, preserving kitchen-sent items |
| **Clear all** | Action that removes all items, including kitchen-sent ones |
| **Service type** | Order mode: `DINE_IN` or `TAKEAWAY` |
| **Order lifecycle** | Draft → Kitchen-sent → Paid → Closed |

---

### Appendix F: FAQ

**Q: What happens to existing orders when this feature is deployed?**  
A: Existing orders continue to work normally. The `is_finalized` field in the database maps directly to `kitchen_sent` in the UI. No data migration needed.

**Q: Can a cashier un-send items to the kitchen?**  
A: No. Once items are sent to kitchen (`kitchen_sent = true`), they cannot be un-sent. However, they can be cancelled via the item cancellation flow in CartPage, which creates an audit record.

**Q: What if a cashier needs to modify a kitchen-sent item?**  
A: They can:
1. Cancel the original item (creates cancellation record)
2. Add a new item with the correct details
3. Send the new item to kitchen

**Q: Does this affect takeaway orders?**  
A: No. Takeaway orders do not use the checkpoint system. They can proceed directly to checkout without "sending to kitchen."

**Q: What if the internet is down when creating a checkpoint?**  
A: Checkpoints are saved locally to IndexedDB immediately. When internet returns, the checkpoint syncs to the server via the outbox mechanism.

**Q: Can multiple devices edit the same kitchen-sent order?**  
A: Yes. The checkpoint state syncs across devices. If Device A sends to kitchen, Device B will see the kitchen-sent flag after sync. Both devices can add more items independently.

**Q: What happens if a cashier closes the browser with unsent items?**  
A: The browser shows a warning: "You have unsent items. Are you sure?" The cashier can choose to stay or leave. If they leave, the order is auto-saved, so no data is lost.

**Q: How do I rollback this feature if there's a critical bug?**  
A: Simply revert the code merge. No database migration means instant rollback. Existing orders will continue to work with the old UI using `is_finalized`.

**Q: Does this change affect the accounting/GL sync?**  
A: No. The sales sync (`SYNC_POS_TX`) is unchanged. Only the active order sync (`SYNC_POS_ORDER_UPDATE`) includes the `is_finalized` flag, which was already part of the schema.

---

### Appendix G: Related Documentation

- **Active Orders Schema:** `packages/offline-db/src/schema.ts` (version 11)
- **Sync Contracts:** `apps/pos/src/offline/outbox-sender.ts` (SYNC_POS_ORDER_UPDATE)
- **POS State Management:** `apps/pos/src/router/pos-app-state.ts`
- **Repository AGENTS.md:** `/home/ahmad/jurnapod/AGENTS.md` (offline-first principles)
- **POS AGENTS.md:** `/home/ahmad/jurnapod/apps/pos/AGENTS.md` (offline-first cashier rules)

---

### Appendix H: Screenshots & Mockups

*(To be added after UI implementation)*

**Planned screenshots:**
1. ProductsPage footer - "Send to kitchen" button (before)
2. ProductsPage footer - "Continue to cart" button (after)
3. CartPage - Conditional clear buttons (no kitchen-sent)
4. CartPage - Conditional clear buttons (has kitchen-sent)
5. Navigation guard modal
6. Browser close warning

---

### Appendix I: Contact & Support

| Role | Name | Contact |
|------|------|---------|
| **Feature Owner** | Product Team | product@jurnapod.com |
| **Tech Lead** | Dev Team | dev@jurnapod.com |
| **QA Lead** | QA Team | qa@jurnapod.com |
| **Support** | Support Team | support@jurnapod.com |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-08 | AI Assistant | Initial documentation - comprehensive design specification |

---

**END OF DOCUMENT**

*This document serves as the source of truth for the Order Checkpoint & Navigation Guards feature. All implementation should reference this spec.*
