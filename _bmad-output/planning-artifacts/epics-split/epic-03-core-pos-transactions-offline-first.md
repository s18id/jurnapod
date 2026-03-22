## Epic 3: Core POS Transactions (Offline-First)

Cashiers can run complete POS transactions reliably offline with safe reconnect sync and duplicate prevention.

### Story 3.1: POS Cart Item and Quantity Capture
As a cashier,
I want to add items and quantities to a cart,
So that I can build a customer sale quickly and accurately.

**Acceptance Criteria:**

**Given** a cashier is assigned to Outlet X and has access to active sellable items for Outlet X
**When** they add or remove items and change quantities in cart
**Then** line totals and cart subtotal recalculate deterministically using configured decimal rules
**And** only Outlet X catalog/pricing data is used.

**Given** quantity input is zero, negative, non-numeric, or exceeds configured limits
**When** the cashier attempts to apply the quantity
**Then** the cart rejects the change with inline validation feedback
**And** no invalid line state is persisted.

**Given** a cashier attempts to add an inactive or cross-company item ID
**When** item validation and tenant checks run
**Then** the request is rejected
**And** the cart state remains unchanged.

### Story 3.2: Transaction Discount Application
As a cashier,
I want to apply line or order discounts within allowed rules,
So that I can honor promotions or manager-approved adjustments.

**Acceptance Criteria:**

**Given** a valid cart and cashier permission to apply discounts within configured limits
**When** a valid line-level or order-level discount is applied
**Then** totals are recalculated correctly and discount metadata (type, value, reason) is stored on draft transaction
**And** discount math uses deterministic decimal rounding rules.

**Given** a discount value is invalid (negative, exceeds policy cap, or makes total below allowed floor)
**When** validation runs
**Then** the discount is rejected with a validation error
**And** no checkout submission is allowed with invalid discount state.

**Given** a discount requires higher permission than the cashier has
**When** the cashier attempts to apply it
**Then** the request is denied with a permission error
**And** no unauthorized discount is saved.

### Story 3.3: Multi-Method Payment Checkout
As a cashier,
I want to split payment across multiple methods,
So that customers can pay using mixed tender.

**Acceptance Criteria:**

**Given** a finalized cart amount and enabled payment methods for the outlet/company
**When** the cashier submits one or more payment allocations
**Then** checkout succeeds only if sum(payments) equals payable total
**And** each payment leg is recorded with method, amount, and reference metadata.

**Given** payment allocations underpay, overpay beyond allowed policy, or include disabled/unknown methods
**When** checkout validation runs
**Then** checkout is rejected with explicit balance/method errors
**And** no partial sale record is created.

**Given** a payload includes payment methods from another company configuration scope
**When** tenant and method scope checks run
**Then** checkout is denied
**And** no cross-tenant payment configuration is accepted.

### Story 3.4: Offline Transaction Commit and Outbox Queueing
As a cashier,
I want POS to complete sales while offline,
So that I can keep serving customers during network outages.

**Acceptance Criteria:**

**Given** device connectivity is unavailable
**When** cashier completes a valid checkout
**Then** the sale is committed to local storage with a durable unique `client_tx_id`
**And** an outbox record is created in `pending` state for sync.

**Given** POS app restarts after offline checkouts
**When** local state is reloaded
**Then** unsynced transactions and outbox records are recovered intact
**And** no duplicate local transactions are created during recovery.

**Given** local persistence fails (storage quota/error/corruption detection) during offline commit
**When** checkout attempts to persist transaction and outbox
**Then** commit is aborted with a recoverable error to cashier
**And** no half-written transaction/outbox state is left behind.

### Story 3.5: Reconnect Sync with Idempotent Duplicate Prevention
As a store operator,
I want queued offline transactions to sync safely on reconnect,
So that I avoid lost sales and duplicate postings.

**Acceptance Criteria:**

**Given** outbox contains unsynced transactions with stable `client_tx_id` values
**When** connectivity returns and sync runs
**Then** each outbox record is submitted and acknowledged transactionally
**And** successful records are marked synced with server reference.

**Given** sync retries occur due to timeout/network interruption
**When** the same payload with identical `client_tx_id` is resent
**Then** server returns idempotent success semantics
**And** no duplicate transaction or duplicate posting is created.

**Given** server rejects a record due to validation or tenant-scope mismatch
**When** sync processes that record
**Then** the record is marked failed with actionable error code/message
**And** failed records are not retried infinitely without operator intervention policy.

**Given** outbox contains records from multiple outlets assigned to the same company
**When** sync executes for Outlet X context
**Then** only records in allowed outlet/company scope are processed
**And** cross-outlet or cross-company leakage is prevented.

