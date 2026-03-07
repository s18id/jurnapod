# ADR-0006: POS Cashier Service Flows and Unified Order Lifecycle

**Status:** Proposed  
**Date:** 2026-03-07  
**Context:** POS domain model, cashier workflows, multi-service extensibility

---

## Context

The current POS is structurally split into route-based pages for checkout, products, cart, and settings. The overall refactor direction is already phone-first and cashier-oriented, but the active transactional model is still closest to a simple direct-sale flow.

The current offline sale draft/completion model supports:

- company
- outlet
- cashier
- items
- payments
- totals
- status/timestamps

but does not yet model:

- service flow
- source flow
- table linkage
- reservation linkage
- open-tab behavior
- hold/resume
- split settlement
- transfer/merge lifecycle
- explicit correction/refund flow

### Problem

A real cashier system must support more than one transaction path.

Target businesses may require:

- takeaway
- dine-in walk-in
- reservation check-in
- pickup / pre-order
- delivery handoff
- open tab / pay later
- held / suspended order
- split bill / split payment
- table transfer / merge
- void / refund / correction

If these flows are implemented independently, the POS will accumulate duplicated logic, inconsistent UI, and fragmented state handling.

---

## Decision

We will introduce a **unified order lifecycle model** and define cashier workflows as variants of that shared model rather than separate one-off implementations.

### Core principle

> Every cashier flow is an order with explicit context, fulfillment mode, and settlement mode.

Instead of treating all flows as one generic checkout, the system will classify orders along a small number of dimensions.

---

## Order Flow Taxonomy

Each order will be defined by the following dimensions.

### 1. Service flow
The primary operational mode of the order.

Allowed values:

- `TAKEAWAY`
- `DINE_IN`
- `PICKUP`
- `DELIVERY`
- `TAB`

### 2. Source flow
How the order originated.

Allowed values:

- `WALK_IN`
- `RESERVATION`
- `PHONE`
- `ONLINE`
- `MANUAL`

### 3. Settlement flow
How payment is expected to happen.

Allowed values:

- `IMMEDIATE`
- `DEFERRED`
- `SPLIT`

### 4. Order status
Operational progress of the order.

Allowed values:

- `OPEN`
- `IN_PROGRESS`
- `READY`
- `READY_TO_PAY`
- `COMPLETED`
- `CANCELLED`
- `VOIDED`

---

## Supported Cashier Flows

We standardize the following cashier flows.

### A. Takeaway / counter sale
Characteristics:
- source usually `WALK_IN`
- service flow `TAKEAWAY`
- settlement flow usually `IMMEDIATE`

Flow:
`Select outlet -> Add items -> Review -> Take payment -> Complete`

This is the simplest and closest to the current POS behavior.

---

### B. Dine-in walk-in
Characteristics:
- source `WALK_IN`
- service flow `DINE_IN`
- settlement flow usually `DEFERRED` or `IMMEDIATE`
- requires table assignment

Flow:
`Select outlet -> Select DINE_IN -> Select table -> Add items -> Review -> Pay / Close table`

---

### C. Reservation check-in
Characteristics:
- source `RESERVATION`
- service flow `DINE_IN`
- starts from reservation record
- converts into or links to active dine-in order

Flow:
`Find reservation -> Mark arrived -> Assign/confirm table -> Open order -> Add items -> Pay / Close`

---

### D. Pickup / pre-order
Characteristics:
- source `ONLINE`, `PHONE`, or `MANUAL`
- service flow `PICKUP`
- payment may be prepaid or due at pickup

Flow:
`Find order -> Verify items -> Collect remaining payment if needed -> Handover -> Complete`

---

### E. Delivery handoff
Characteristics:
- source `ONLINE`, `PHONE`, or `MANUAL`
- service flow `DELIVERY`
- may involve courier/driver handoff
- payment may already be settled or collected later

Flow:
`Find order -> Verify fulfillment/payment state -> Dispatch / handoff -> Complete`

---

### F. Open tab / pay later
Characteristics:
- service flow `TAB`
- settlement flow `DEFERRED`
- not always tied to table
- multiple additions over time

Flow:
`Open tab -> Add items over time -> Review -> Pay -> Close`

---

### G. Hold / suspended order
Characteristics:
- temporary paused order
- not completed
- resumed later by cashier

Flow:
`Start order -> Suspend -> Resume later -> Continue -> Pay / Complete`

---

### H. Split bill / split payment
Characteristics:
- usually applied to dine-in or tab
- one order may be paid by multiple payers or multiple methods

Flow:
`Review order -> Choose split strategy -> Collect multiple payments -> Close order`

---

### I. Table transfer / merge
Characteristics:
- restaurant operational flow
- move order from one table to another, or combine tables/orders

Flow:
`Select active dine-in order -> Transfer table or merge -> Continue service -> Pay / Complete`

---

### J. Void / refund / correction
Characteristics:
- after-start or after-payment correction flow
- requires reason capture and auditability
- permissions may differ from standard cashier flow

Flow:
`Locate order/sale -> Apply correction policy -> Void/refund/adjust -> Record audit trail`

---

## Shared Domain Model

All cashier workflows will use one shared order domain with optional extensions.

### Base order fields
Proposed fields:

- `order_id`
- `company_id`
- `outlet_id`
- `cashier_user_id`
- `service_flow`
- `source_flow`
- `settlement_flow`
- `status`
- `subtotal`
- `discount_total`
- `tax_total`
- `grand_total`
- `paid_total`
- `change_total`
- `created_at`
- `updated_at`
- `completed_at` nullable

### Optional operational fields
- `table_id` nullable
- `reservation_id` nullable
- `customer_id` nullable
- `customer_name` nullable
- `customer_phone` nullable
- `guest_count` nullable
- `hold_token` nullable
- `parent_order_id` nullable
- `notes` nullable

### Payment extension
Orders may have:
- one payment
- multiple partial payments
- multiple payment methods

This is required for split settlement support.

---

## Separate but Linked Entities

The following remain distinct from order, but can link to it:

### Reservation
A booking record that may convert into a dine-in order.

### Table
An outlet-scoped entity used by dine-in and reservation flows.

### Refund / correction record
A post-sale accounting and audit entity, not merely an order status.

### Suspended order token
A resume mechanism for held orders.

---

## UX Decision

The POS UI will not expose all flows through one checkout screen.

Instead, users will enter the appropriate flow from the appropriate route.

### Recommended route family

- `/products` -> start or continue standard order
- `/cart` -> review active order
- `/checkout` or `/` -> payment and closure
- `/tables` -> dine-in table grid
- `/reservations` -> reservation management
- `/orders` -> pickup, delivery, held, and active order lookup
- `/settings` -> sync/device/account only

### Entry examples

#### Takeaway
Entry from `/products`

#### Dine-in walk-in
Entry from `/tables`

#### Reservation
Entry from `/reservations`

#### Pickup / delivery
Entry from `/orders`

#### Suspended order
Entry from `/orders` or resume action

This keeps one screen from trying to solve all cashier jobs.

---

## Validation Rules

### General
- every order belongs to exactly one outlet
- order status transitions must be valid
- completed orders cannot be treated as active orders
- cancelled/voided orders cannot be completed

### Dine-in
- `DINE_IN` requires valid `table_id`
- active table cannot be double-occupied unless merge flow explicitly allows it

### Reservation-linked order
- `RESERVATION` source must reference valid reservation
- reservation-linked order must remain traceable for reporting

### Pickup / delivery
- fulfillment handoff may be tracked separately from payment when required

### Hold / suspended order
- held order must not be treated as completed
- resumed order must restore service context safely

### Split settlement
- sum of all payments must satisfy completion policy
- order closes only when settlement is complete

### Refund / void
- correction flows require explicit reason and audit capture
- role checks may differ from ordinary sale completion

---

## Rollout Strategy

We will not implement all flows at once.

### Phase 1: Foundation
- takeaway
- guarded outlet switching
- clean products/cart/checkout separation
- base order model with `service_flow`, `source_flow`, `settlement_flow`

### Phase 2: Restaurant core
- dine-in walk-in
- tables
- reservation linkage
- split-bill foundations

### Phase 3: Pre-order operations
- pickup
- delivery handoff
- order lookup page

### Phase 4: Deferred flows
- hold / suspended order
- open tab / pay later
- transfer / merge

### Phase 5: Corrections and finance
- void
- refund
- post-sale correction records
- stronger audit/reporting

---

## Alternatives Considered

### 1. Add each flow independently
Rejected.

This would create duplicated logic, inconsistent state handling, and fragmented UI.

### 2. Keep one generic checkout and add more fields
Rejected.

This would overload checkout and make cashier tasks harder to understand.

### 3. Support only takeaway and dine-in
Partially accepted for rollout, rejected as long-term architecture.

Takeaway and dine-in are appropriate first flows, but the order model must be extensible enough to support pickup, delivery, hold, split, and correction workflows later.

---

## Consequences

### Positive
- gives POS a durable architecture for multiple business types
- avoids rewriting order logic for each new flow
- supports restaurant and retail-adjacent scenarios with one model
- keeps UX cleaner by routing each job to the right entry point
- improves reporting because flow type is explicit

### Negative
- increases domain-model complexity
- requires broader schema and API design than simple direct-sale POS
- demands careful state-transition testing
- expands sync payloads and offline-state handling

### Neutral
- current direct sale remains supported as the simplest case
- not every outlet must enable every flow

---

## Reporting and Analytics Impact

Capturing cashier flows explicitly enables future reporting such as:

- takeaway vs dine-in sales mix
- reservation conversion rate
- pickup vs delivery volume
- no-show rate
- split-payment usage
- refund/void frequency
- table turnover and tab duration

---

## Implementation Guidance

### Minimal first schema expansion
At minimum, extend order/sale records with:

- `service_flow`
- `source_flow`
- `settlement_flow`
- `status`

Then add linkage fields incrementally:

- `table_id`
- `reservation_id`
- `hold_token`
- `parent_order_id`

### Minimal first UX expansion
Prioritize:

- takeaway
- dine-in walk-in
- reservation check-in

Then add:

- pickup
- delivery
- held/suspended order

Leave for later phases:

- split-bill sophistication
- transfer/merge
- refund workflows

---

## Related Documents

- POS routes: `apps/pos/src/router/routes.ts`
- POS refactor plan: `apps/pos/REFACTOR_PLAN.md`
- Offline sale flow: `apps/pos/src/offline/sales.ts`

---

## Decision Summary

We will model cashier workflows as a shared order lifecycle with explicit service, source, and settlement dimensions, then implement individual cashier journeys on top of that shared foundation in phased releases.

---

**Proposed by:** Signal18 ID  
**Implementation milestone:** POS multi-flow foundation
