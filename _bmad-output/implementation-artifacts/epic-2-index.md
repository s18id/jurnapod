# Epic 2: POS - Offline-first Point of Sale

**Status:** ✅ COMPLETE (Discovered - Already Existed)  
**Stories:** 6/6 Complete  
**Epic Type:** Core Application  
**Dependencies:** Epic 1 (Auth, Company, Outlet)

---

## 📋 STORIES

### ✅ Story 2.1: POS Cart (Add Items, Quantities)
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Cart Hook:** `apps/pos/src/features/cart/useCart.ts` (302 lines)
- **Cart Line:** `apps/pos/src/features/cart/CartLine.tsx`
- **Cart List:** `apps/pos/src/features/cart/CartList.tsx`
- **Cart Summary:** `apps/pos/src/features/cart/CartSummary.tsx`

**Features:**
- React hooks-based cart state management
- Add/update/remove items
- Quantity management with kitchen sent tracking
- Line-item discount support
- Product price snapshots (frozen at add time)
- Service type support (TAKEAWAY, DINE_IN)
- Table assignment for DINE_IN
- Reservation linking
- Guest count tracking
- Order notes
- Order status lifecycle (OPEN, READY_TO_PAY, COMPLETED, CANCELLED)
- Kitchen sent finalization

**Key Files:**
```
apps/pos/src/features/cart/useCart.ts
apps/pos/src/features/cart/CartLine.tsx
apps/pos/src/features/cart/CartList.tsx
apps/pos/src/features/cart/CartSummary.tsx
```

---

### ✅ Story 2.2: POS Cart Apply Discounts
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Discount Logic:** In `useCart.ts`
- **Money Utils:** `apps/pos/src/shared/utils/money.ts`

**Features:**
- Percentage discount (`applyPercentDiscount`)
- Fixed amount discount (`applyFixedDiscount`)
- Discount codes (`applyDiscountCode`)
- Clear all discounts (`clearTransactionDiscounts`)
- Line-item level discounts
- Transaction-level discounts
- Discount validation (percent capped at 100%, amount validation)
- Tax calculation with discounts

**Key Files:**
```
apps/pos/src/features/cart/useCart.ts
apps/pos/src/shared/utils/money.ts
```

---

### ✅ Story 2.3: POS Process Multiple Payment Methods
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Checkout Page:** `apps/pos/src/pages/CheckoutPage.tsx`
- **Payment Logic:** In cart system

**Features:**
- Multiple payment entries support
- Payment method types (CASH, CARD, QR, etc.)
- Payment amount tracking
- Cart totals computation with payments
- Change calculation for cash payments
- Payment validation
- Partial payments support
- Overpayment handling

**Key Files:**
```
apps/pos/src/pages/CheckoutPage.tsx
apps/pos/src/features/cart/useCart.ts
```

---

### ✅ Story 2.4: POS Offline Mode & Local Storage
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Offline DB:** `packages/offline-db/dexie/db.ts` (246 lines)
- **Types:** `packages/offline-db/dexie/types.ts`
- **Runtime:** `apps/pos/src/offline/runtime.ts`
- **Auth Session:** `apps/pos/src/offline/auth-session.ts`

**Features:**
- **IndexedDB via Dexie** with 9 database versions (schema evolution)
- **Tables:**
  - `sales` - Local sale transactions with `client_tx_id`
  - `sale_items` - Line items with price/name snapshots
  - `payments` - Payment records
  - `products_cache` - Cached product catalog
  - `outbox_jobs` - Sync queue
  - `sync_metadata` - Sync state tracking
  - `outlet_tables` - Table management
  - `reservations` - Reservation data
  - `active_orders` - Open orders
  - `inventory_stock` - Stock levels
- **Offline-first writes:** Sales saved locally first, then synced
- **Data versioning** for cache invalidation
- **Company + Outlet scoping** on all tables

**Key Files:**
```
packages/offline-db/dexie/db.ts
packages/offline-db/dexie/types.ts
apps/pos/src/offline/runtime.ts
apps/pos/src/offline/auth-session.ts
```

---

### ✅ Story 2.5: POS Sync Transactions When Online
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Outbox:** `apps/pos/src/offline/outbox.ts` (294 lines)
- **Sender:** `apps/pos/src/offline/outbox-sender.ts`
- **Drainer:** `apps/pos/src/offline/outbox-drainer.ts`
- **Leader:** `apps/pos/src/offline/outbox-leader.ts`
- **Sync Orchestrator:** `apps/pos/src/services/sync-orchestrator.ts`
- **Push API:** `apps/api/app/api/sync/push/route.ts` (1640+ lines)
- **Pull API:** `apps/api/app/api/sync/pull/route.ts`

**Features:**
- **Outbox pattern** with job queue (PENDING, SENT, FAILED states)
- **Lease-based job reservation** (prevents concurrent processing)
- **Automatic retry** with exponential backoff
- **Batch processing** (configurable concurrency, default 3)
- **Push endpoint** (`/api/sync/push`) handles:
  - Transaction validation
  - Company/outlet/cashier scope validation
  - Idempotency checks
  - Duplicate detection
  - Tax calculation
  - Payment processing
  - Table status updates
  - Reservation linking
  - Journal posting hooks
- **Pull endpoint** (`/api/sync/pull`) for downloading master data
- **Stock sync** endpoints (`/api/sync/stock/*`)

**Key Files:**
```
apps/pos/src/offline/outbox.ts
apps/pos/src/offline/outbox-sender.ts
apps/pos/src/offline/outbox-drainer.ts
apps/pos/src/services/sync-orchestrator.ts
apps/api/app/api/sync/push/route.ts
apps/api/app/api/sync/pull/route.ts
```

---

### ✅ Story 2.6: POS Duplicate Prevention During Sync
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Duplicate Check:** `apps/api/app/api/sync/check-duplicate/route.ts` (122 lines)
- **Duplicate Tests:** `apps/api/app/api/sync/check-duplicate/route.test.ts`
- **Push Handler:** `apps/api/app/api/sync/push/route.ts` (duplicate handling)

**Features:**
- **`client_tx_id`** (UUID) on every sale - primary deduplication key
- **Unique constraint** on `(company_id, client_tx_id)` in database
- **Payload SHA256 hashing** for idempotency verification
- **Three result codes:** OK, DUPLICATE, ERROR
- **Duplicate detection strategies:**
  - Pre-insert check via `client_tx_id` lookup
  - MySQL duplicate key error handling (error code 1062)
  - Payload hash comparison for replay detection
  - Legacy hash support for backward compatibility
- **Idempotency conflict detection** for different payloads with same ID
- **Audit logging** of all duplicate attempts
- **Check-duplicate endpoint** for pre-flight validation
- **Outbox deduplication** via `dedupe_key` field

**Key Files:**
```
apps/api/app/api/sync/check-duplicate/route.ts
apps/api/app/api/sync/check-duplicate/route.test.ts
apps/api/app/api/sync/push/route.ts
```

---

## 📊 TECHNICAL SPECIFICATIONS

### Offline Architecture
- **Storage:** IndexedDB via Dexie
- **Schema Versions:** 9 (migration support)
- **Pattern:** Offline-first with outbox sync
- **Sync Strategy:** Optimistic writes with retry

### Sync System
- **Queue Pattern:** Outbox with job states
- **Concurrency:** Configurable (default 3)
- **Retry:** Exponential backoff
- **Deduplication:** client_tx_id + SHA256 hash
- **Safety:** Lease-based processing

### Data Integrity
- **Idempotency Keys:** client_tx_id
- **Hash Verification:** SHA256 payload hashing
- **Conflict Detection:** Payload comparison
- **Audit Trail:** All duplicate attempts logged

### Database Tables
```
sales (local)
sale_items (local)
payments (local)
products_cache (local)
outbox_jobs (local)
sync_metadata (local)
outlet_tables (local)
reservations (local)
active_orders (local)
inventory_stock (local)
```

---

## 🔗 DEPENDENCIES

**Requires:**
- Epic 1 (Auth, Company, Outlet) - Authentication and scoping

**Used By:**
- Epic 3 (Accounting) - Sales journal posting
- Epic 4 (Items) - Product catalog
- Epic 7 (Sync) - Sync infrastructure improvements

---

## ✅ DEFINITION OF DONE

- [x] All 6 stories implemented
- [x] Cart functionality (add, update, remove items)
- [x] Discount support (% and fixed)
- [x] Multiple payment methods
- [x] Offline storage with Dexie
- [x] Sync system with outbox pattern
- [x] Duplicate prevention with client_tx_id
- [x] Retry and error handling
- [x] Audit logging

---

**Epic 2 Status: COMPLETE ✅**  
**Full POS system operational with offline-first sync.**
