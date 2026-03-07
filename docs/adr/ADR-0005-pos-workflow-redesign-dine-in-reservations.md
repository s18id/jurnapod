# ADR-0005: POS Workflow Redesign, Outlet Context Guardrails, Dine-In Tables, and Reservations

**Status:** Proposed  
**Date:** 2026-03-07  
**Context:** POS workflow, cashier safety, dine-in operations, reservation support

---

## Context

The current POS has been refactored into route-based pages:

- `checkout (/)`
- `products (/products)`
- `cart (/cart)`
- `settings (/settings)`

However, the interaction model is still inconsistent for cashier use:

1. **Checkout is overloaded**
   - `CheckoutPage` currently combines outlet selection, product search, product browsing, payment, sync status, and logout in one screen.
   - This makes the core cashier flow harder to understand and increases risk of operator error.

2. **Outlet context is unstable**
   - Checkout allows direct outlet switching from a plain select and immediately updates scope while clearing cart inline.
   - Settings also allows direct outlet switching without workflow guardrails.
   - Outlet change is currently treated as a trivial setting change instead of a destructive sales-context switch.

3. **Page responsibilities overlap**
   - `ProductsPage` is currently too thin to act as the main start-sale screen.
   - `CartPage` exists as a separate review screen, but checkout still duplicates product and sale-building responsibilities.

4. **Dine-in is not yet modeled**
   - The current offline sale draft/completion flow stores company, outlet, cashier, status, totals, and timestamps, but does not store `service_type`, `table_id`, `guest_count`, or open-table order state.

5. **Reservations are not yet modeled**
   - There is no reservation entity or reservation-linked flow in the current POS structure or sale model.
   - Real restaurant workflows require advance booking, arrival tracking, seating, and conversion from reservation to dine-in order.

### Problem

The POS needs to support:

- safer cashier workflows
- clearer page responsibilities
- explicit outlet context handling
- dine-in table operations
- reservation lifecycle before payment

Without these changes, the POS remains error-prone for multi-outlet businesses and incomplete for restaurant operations.

---

## Decision

We will redesign POS around the principle:

> **One page, one job. One outlet, one active order context.**

We will also introduce **dine-in tables** and **reservations** as first-class operational concepts.

### 1. Page responsibilities will be redefined

#### `/products` = Start or continue order
This becomes the primary cashier working screen.

Responsibilities:
- show active outlet context
- show service mode (`TAKEAWAY` / `DINE_IN`)
- require table selection for dine-in
- search and add products
- show compact active-order summary
- continue to cart

#### `/cart` = Review order
Responsibilities:
- edit quantities and discounts
- review subtotal/tax/total
- show outlet and dine-in context
- continue to payment

#### `/` (checkout) = Payment and order closure
Responsibilities:
- show final order summary
- collect payment
- complete sale / close dine-in order

Checkout will no longer be responsible for product discovery or casual outlet switching.

#### `/settings` = Operational tools only
Responsibilities:
- sync controls
- account/device info
- low-frequency operational settings

Settings will not act as a primary sale-context surface.

#### `/tables` = Dine-in table operations
Responsibilities:
- show table grid by outlet
- show table state (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `UNAVAILABLE`)
- start walk-in dine-in order
- resume active dine-in order
- show reservation-linked tables

#### `/reservations` = Reservation management
Responsibilities:
- create reservation
- list upcoming reservations
- confirm, cancel, or mark no-show
- mark arrival
- assign/reassign table
- convert reservation into active dine-in order

---

### 2. Outlet switching will become a guarded context change

Outlet changes will no longer apply immediately from a raw select field.

Instead:

- active outlet is shown as a prominent context card/chip
- changing outlet opens a confirmation modal/sheet
- confirmation text explains that switching outlet:
  - clears current cart/order draft
  - resets payment draft
  - reloads product context
  - starts a new order in the selected outlet
- after confirm:
  - current order state is cleared
  - outlet scope is updated
  - user is routed to `/products`

### Rationale
Outlet is part of sales scope, not a casual UI preference. Treating outlet switch as a destructive context change reduces wrong-outlet sales and clarifies cashier intent.

---

### 3. POS will support service mode

A new order must begin with a service mode:

- `TAKEAWAY`
- `DINE_IN`

#### Takeaway flow
`Products -> Cart -> Checkout`

#### Dine-in walk-in flow
`Tables -> Select table -> Products -> Cart -> Checkout`

For `DINE_IN`:
- table selection is required before adding items
- the active order remains associated with its table until completed or cancelled

---

### 4. Tables become a first-class operational entity

We will introduce outlet-scoped table management.

### Table entity
Proposed fields:

- `table_id`
- `company_id`
- `outlet_id`
- `code` / `name`
- `zone` / `area` nullable
- `capacity` nullable
- `status`
- `created_at`
- `updated_at`

### Table statuses
Recommended states:

- `AVAILABLE`
- `RESERVED`
- `OCCUPIED`
- `UNAVAILABLE`

### Table UI principles
- dedicated table grid, not a dropdown
- visual status cues
- fast tap targets
- resume order directly from occupied table
- reservation context visible on reserved table

---

### 5. Reservation becomes a first-class outlet-scoped entity

Reservation is distinct from sale/order.

A reservation:
- exists before ordering
- may exist without payment
- may exist without items
- may be cancelled or no-show
- may later convert into active dine-in order

Therefore:

- **Reservation != Sale**
- **Reservation may link to a dine-in order later**

### Reservation entity
Proposed fields:

- `reservation_id`
- `company_id`
- `outlet_id`
- `table_id` nullable
- `customer_name`
- `customer_phone` nullable
- `guest_count`
- `reservation_at`
- `duration_minutes` nullable
- `status`
- `notes` nullable
- `linked_order_id` nullable
- `created_at`
- `updated_at`
- `arrived_at` nullable
- `seated_at` nullable
- `cancelled_at` nullable

### Reservation statuses
Recommended states:

- `BOOKED`
- `CONFIRMED`
- `ARRIVED`
- `SEATED`
- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`

### Reservation conversion behavior
When a guest is seated:

- reservation status becomes `SEATED`
- the system creates or links an active dine-in order
- the selected table becomes `OCCUPIED`
- the reservation remains linked for reporting/history

---

### 6. Sale/order model will be extended for dine-in and reservation linkage

The sale/order data model will be extended with service-specific metadata.

### New order/sale attributes
- `service_type` (`TAKEAWAY` | `DINE_IN`)
- `table_id` nullable
- `reservation_id` nullable
- `guest_count` nullable
- `order_status` (`OPEN` | `READY_TO_PAY` | `COMPLETED` | `CANCELLED`)
- `opened_at`
- `closed_at` nullable
- `notes` nullable

### Rationale
The current draft-to-complete sale model is insufficient for restaurant operations because payment is only one phase of service. Orders may exist before payment and may originate from reservations.

---

## UX Behavior

### Global POS shell
All operational pages should clearly show:

- active outlet
- sync state
- active service mode
- active table for dine-in
- active reservation context when applicable
- active order/cart count

### Products page
- becomes default operational landing page after login
- becomes default landing page after outlet change
- blocks product add for dine-in until a table is selected
- shows sticky order summary/footer

### Cart page
- shows outlet + service mode + table/reservation context
- supports editing and review
- primary CTA: proceed to payment

### Checkout page
- payment-only workflow
- shows order metadata prominently
- shows clear completion eligibility and reasons when blocked

### Tables page
- visual table grid
- clear statuses
- tap to open or resume dine-in flow
- tap reserved table to inspect reservation and next actions

### Reservations page
- upcoming reservations list
- create/edit/cancel/no-show actions
- arrival and seating actions
- convert to active dine-in order

---

## Validation Rules

### Outlet safety
- outlet change must require confirmation
- confirmed outlet change clears active order state
- sales cannot complete if order outlet context and active POS outlet context are inconsistent

### Dine-in rules
- `DINE_IN` requires valid `table_id`
- items cannot be added to dine-in order without selected table
- completed dine-in payment closes order and releases table
- occupied tables cannot be assigned to a second active dine-in order unless a merge flow explicitly allows it

### Reservation rules
- reservation requires outlet
- reservation requires guest count
- reservation requires reservation time
- seated reservation requires valid table assignment
- completed/cancelled/no-show reservations cannot remain active
- reserved table cannot be overridden by walk-in without explicit confirmation or permission

### Checkout rules
- checkout only completes when:
  - order has items
  - payment is valid
  - outlet context is valid
  - service-specific requirements are satisfied

---

## Data and Sync Impact

### Offline POS
Offline storage must persist:

- active order context
- service type
- table assignment
- reservation linkage
- reservation summary needed for check-in/seating
- table status snapshot
- order lifecycle state

### API / sync pull
Sync pull must include:
- outlet table metadata
- reservation summaries/status for active horizon
- dine-in related order metadata

### API / sync push
Order push payloads must include:
- service type
- table linkage
- reservation linkage
- order lifecycle state

### Compatibility
Takeaway-only outlets may continue using POS without tables or reservations enabled.

---

## Alternatives Considered

### 1. Keep current pages and add only outlet confirmation
Rejected.

This addresses one error mode but does not solve page-role confusion, dine-in operations, or reservation support.

### 2. Add tables and reservations as checkout fields
Rejected.

Table and reservation are operational context that exist before payment. Checkout-only fields would not support open-service flows.

### 3. Revert to one large POS page
Rejected.

The codebase is already route-oriented and should move toward clearer roles rather than back to a monolithic interaction model.

---

## Consequences

### Positive
- clearer cashier workflow
- lower wrong-outlet transaction risk
- stronger page separation
- proper foundation for restaurant operations
- supports reservations and table lifecycle explicitly
- enables future split bill, table transfer, and host workflows

### Negative
- requires schema changes, not just UI changes
- increases implementation scope across POS, offline DB, sync, and API
- adds operational state complexity for tables and reservations
- requires broader test coverage

### Neutral
- takeaway remains the default/simple case
- not all outlets must enable dine-in or reservations

---

## Rollout Plan

### Phase 1: Workflow cleanup
- move product discovery fully to `/products`
- make `/cart` the review step
- reduce `/` to payment-only responsibilities
- add guarded outlet-switch modal and redirect to `/products`

### Phase 2: Dine-in foundation
- add `service_type` to active order context
- add `/tables`
- add table entity and table statuses
- block dine-in order until table selected

### Phase 3: Reservation foundation
- add reservation entity and reservation APIs
- add `/reservations`
- add reservation-to-table assignment
- add arrival/no-show/cancel flow

### Phase 4: Conversion and lifecycle
- convert reservation to dine-in order
- keep reservation/order linkage
- complete payment and release table
- add reporting hooks

---

## Testing Requirements

### Unit / UI
- outlet switch requires confirmation
- confirmed outlet switch clears active order and routes to `/products`
- checkout no longer renders product discovery
- dine-in blocks product addition until table selected
- reservation state transitions are valid

### Integration
- order completion enforces outlet consistency
- dine-in orders require `table_id`
- reservation-seated flow creates or links valid dine-in order
- table status changes correctly through reservation and dine-in lifecycle

### E2E
- cashier completes takeaway sale end-to-end
- cashier opens dine-in walk-in order on table and completes payment
- host/staff checks in reservation and converts it to active order
- outlet switch during active order clears context correctly
- table becomes available after dine-in completion

---

## Related Documents

- POS routes: `apps/pos/src/router/routes.ts`
- POS router/app shell: `apps/pos/src/router/Router.tsx`
- Current checkout page: `apps/pos/src/pages/CheckoutPage.tsx`
- Current products page: `apps/pos/src/pages/ProductsPage.tsx`
- Current cart page: `apps/pos/src/pages/CartPage.tsx`
- Current settings page: `apps/pos/src/pages/SettingsPage.tsx`
- Offline sale flow: `apps/pos/src/offline/sales.ts`

---

## Decision Summary

We will redesign POS into a role-based cashier workflow with guarded outlet context, explicit dine-in table support, and reservation management as a separate but linked operational domain.

---

**Proposed by:** Signal18 ID  
**Implementation milestone:** POS workflow stabilization + dine-in/reservation foundation
