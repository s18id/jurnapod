# POS UI Review

Date: 2026-03-10
Reviewer: OpenCode AI
Product: Jurnapod POS (offline-first cashier)

## Objective

Review the current POS UI implementation for workflow safety, operator trust, consistency, and accessibility, with priority on offline-first cashier behavior.

## Scope Reviewed

- App shell and navigation
  - `apps/pos/src/router/AppLayout.tsx`
  - `apps/pos/src/router/Router.tsx`
  - `apps/pos/src/router/routes.ts`
- Core screens
  - `apps/pos/src/pages/ProductsPage.tsx`
  - `apps/pos/src/pages/CartPage.tsx`
  - `apps/pos/src/pages/CheckoutPage.tsx`
  - `apps/pos/src/pages/TablesPage.tsx`
  - `apps/pos/src/pages/ReservationsPage.tsx`
  - `apps/pos/src/pages/SettingsPage.tsx`
- Shared components and key UX primitives
  - `apps/pos/src/shared/components/Button.tsx`
  - `apps/pos/src/shared/components/Input.tsx`
  - `apps/pos/src/shared/components/Modal.tsx`
  - `apps/pos/src/shared/components/ConfirmationModal.tsx`
  - `apps/pos/src/features/sync/SyncBadge.tsx`
  - `apps/pos/src/features/checkout/useCheckout.ts`

## Method

- Static code review across major cashier flows.
- Cross-check against offline-first and navigation guard expectations in:
  - `apps/pos/AGENTS.md`
  - `apps/pos/docs/ORDER_CHECKPOINT_NAVIGATION_GUARDS.md`

## What Is Working Well

- Offline-first architecture is visible in UI flow and runtime orchestration.
- Sync status is surfaced in top-level app shell and settings.
- Dine-in workflow has meaningful checkpoint concepts (`kitchen_sent`, guarded navigation).
- Outlet switch flow warns about destructive context change.
- Cart and tables pages contain practical operational tools (transfer table, cancellation with reason).

## Findings

### P1 (Must Fix)

1. Incorrect behavior in "Discard unsent items" navigation guard action
   - Current implementation in `apps/pos/src/router/AppLayout.tsx` calls `clearCart()` inside `handleDiscardAndNavigate`.
   - Intended behavior (and documented behavior) is to discard draft-only lines and preserve kitchen-sent quantities.
   - Reference implementation exists in `discardDraftItems` at `apps/pos/src/router/Router.tsx`.
   - Impact: accidental full order cancellation/data loss risk in active dine-in flow.

2. "Clear All" cart action is destructive with no confirmation
   - `apps/pos/src/pages/CartPage.tsx` calls `clearCart()` directly from a single tap.
   - `clearCart()` can close current active order via runtime path in `apps/pos/src/router/Router.tsx`.
   - Impact: high-risk cashier mis-tap can cancel active unpaid order.

3. Tables page refresh is partial and can produce stale operational context
   - Manual refresh path in `apps/pos/src/pages/TablesPage.tsx` reloads tables only.
   - Reservations and table order summaries are not refreshed in the same operation.
   - Impact: seat/resume decisions can be made on stale state.

4. Offline sync badge hides pending unsynced count
   - `apps/pos/src/features/sync/SyncBadge.tsx` only appends count for `Pending` state, not for `Offline`.
   - Impact: operator cannot quickly tell queued unsynced workload while offline.

### P2 (Important)

1. Navigation guard modal uses custom overlay markup without robust modal semantics
   - Custom fixed overlay in `apps/pos/src/router/AppLayout.tsx` for critical unsent-items decision.
   - Impact: weaker keyboard/screen-reader behavior and inconsistent modal UX.

2. Error feedback is often console-only
   - Examples:
     - `apps/pos/src/pages/ProductsPage.tsx`
     - `apps/pos/src/pages/TablesPage.tsx`
     - `apps/pos/src/pages/ReservationsPage.tsx`
   - Impact: cashier may not understand stale/failed state or what action to take.

3. Async cleanup ordering risk after checkout completion
   - `clearOrderContext` is async in `apps/pos/src/pages/CheckoutPage.tsx`.
   - Hook callback wiring in `apps/pos/src/features/checkout/useCheckout.ts` does not consistently enforce awaited cleanup path.
   - Impact: possible transient stale table/reservation/order state after sale completion.

### P3 (Nice to Have)

1. Checkout visual language is inconsistent with rest of POS shell
   - `apps/pos/src/pages/CheckoutPage.tsx` uses distinct typography/background style.
   - Impact: reduced cross-screen consistency during critical payment flow.

2. Destructive confirmations use mixed patterns (`window.confirm` and custom modals)
   - Examples in cart/settings.
   - Impact: uneven UX and weaker extensibility for accessibility/localization.

## Recommended Patch Set (Execution Scopes)

### Scope 1 - Fix discard unsent logic (P1)

- File: `apps/pos/src/router/AppLayout.tsx`
- Change: replace `clearCart()` in discard path with `discardDraftItems()`.
- Acceptance:
  - mixed sent+unsent lines keep sent qty only;
  - unsent-only order clears;
  - guard still navigates correctly.

### Scope 2 - Add confirmation for cart clear-all (P1)

- File: `apps/pos/src/pages/CartPage.tsx`
- Change: gate `clearCart()` behind explicit confirmation modal.
- Acceptance:
  - no cancellation without confirm;
  - cancel leaves order untouched.

### Scope 3 - Full tables refresh consistency (P1)

- File: `apps/pos/src/pages/TablesPage.tsx`
- Change: manual refresh must reload tables + reservations + order summaries via same loader.
- Acceptance:
  - card status, reservation links, and active order summaries are coherent after refresh.

### Scope 4 - Show pending count while offline (P1)

- File: `apps/pos/src/features/sync/SyncBadge.tsx`
- Change: include pending count whenever `pendingCount > 0`, including `Offline`.
- Acceptance:
  - offline with queue visibly shows count.

### Scope 5 - Cashier-visible error messaging (P2)

- Files:
  - `apps/pos/src/pages/ProductsPage.tsx`
  - `apps/pos/src/pages/TablesPage.tsx`
  - `apps/pos/src/pages/ReservationsPage.tsx`
- Change: add inline banner/toast level feedback + retry where possible.

### Scope 6 - Accessible guard modal (P2)

- File: `apps/pos/src/router/AppLayout.tsx`
- Change: replace custom overlay with shared/Ionic modal semantics.

### Scope 7 - Checkout completion cleanup ordering (P2)

- Files:
  - `apps/pos/src/pages/CheckoutPage.tsx`
  - `apps/pos/src/features/checkout/useCheckout.ts`
- Change: route async cleanup through awaited post-completion callback.

### Scope 8 - Optional UI consistency polish (P3)

- Files:
  - `apps/pos/src/pages/CheckoutPage.tsx`
  - optionally `apps/pos/src/theme/variables.css`
- Change: align checkout tone with system styling.

## Validation Matrix

- Navigation guard:
  - leave products with unsent dine-in items;
  - verify all three paths (send/ discard/ stay).
- Cart destructive actions:
  - confirm and cancel paths for clear-all.
- Tables refresh:
  - mutate reservation/order state externally, then refresh and verify coherence.
- Offline trust cues:
  - force offline with pending outbox and verify visible count.
- Checkout completion:
  - complete dine-in order with reservation and verify table/reservation/order cleanup ordering.

## Risk Notes

- Do not alter outbox semantics or sale posting contract while applying UI changes.
- Keep outlet scoping intact for all new/updated data loads.
- Preserve existing finalized-order correction invariants (use explicit cancellation flows, avoid silent mutation).
