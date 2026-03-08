 # POS Active Order Sync Specification

 **Status:** Design
 **Date:** 2026-03-08
 **Context:** Multi-terminal dine-in collaboration for open orders
 **Related ADRs:** `docs/adr/ADR-0005-pos-workflow-redesign-dine-in-reservations.md`, `docs/adr/ADR-0006-pos-cashier-service-flows-and-order-lifecycle.md`

 ---

 ## Objective

 Enable multiple POS clients in the same outlet to safely collaborate on open dine-in orders by syncing:

 - latest active order snapshot (current state)
 - immutable order update history (change stream)

 This extends the existing offline-first model without weakening idempotency or financial integrity.

 ---

 ## Decision

 ### Chosen Conflict Strategy (Recommended)

 We use **optimistic merge with stale-edit warnings**.

 - No hard table lock for MVP.
 - Clients apply remote updates in timestamp/sequence order.
 - If a cashier is editing and a newer update arrives, UI shows warning and asks user to refresh/reapply.

 Rationale:

 - better offline behavior than hard locking
 - fewer operational deadlocks under unstable network
 - preserves all events for audit and replay

 ---

 ## Non-Goals

 - Replacing finalized sale sync (`client_tx_id`) behavior
 - Split-bill or merge-order business logic redesign
 - Full CRDT implementation

 ---

 ## Data Model

 ### Local (IndexedDB / Dexie)

 Add a new table:

 - `active_order_updates`

 Proposed row shape:

 - `pk`: `active_order_update:{update_id}`
 - `update_id`: UUID (idempotency key)
 - `order_id`: string
 - `company_id`: number
 - `outlet_id`: number
 - `base_order_updated_at`: string | null (snapshot version client edited from)
 - `event_type`: `SNAPSHOT_FINALIZED` | `ITEM_ADDED` | `ITEM_REMOVED` | `QTY_CHANGED` | `ITEM_CANCELLED` | `NOTES_CHANGED` | `ORDER_RESUMED` | `ORDER_CLOSED`
 - `delta_json`: string (structured change payload)
 - `actor_user_id`: number | null
 - `device_id`: string
 - `event_at`: string (client event time)
 - `created_at`: string
 - `sync_status`: `PENDING` | `SENT` | `FAILED`
 - `sync_error`: string | null

 Indexes:

 - `&pk`
 - `&update_id`
 - `[company_id+outlet_id+order_id+event_at]`
 - `[company_id+outlet_id+sync_status+event_at]`

 ### Server (MySQL)

 Add tables:

 - `pos_order_snapshots` (latest open-order head)
 - `pos_order_snapshot_lines` (materialized latest line state)
 - `pos_order_updates` (immutable history)

 Constraints and safety:

 - enforce `company_id` + `outlet_id` scoping
 - unique `update_id` on `pos_order_updates`
 - FK from updates/lines to snapshot (`order_id`, scoped keys)
 - money fields use DECIMAL, not FLOAT/DOUBLE

 ---

 ## Sync Contract Extensions

 ### Push (`POST /api/sync/push`)

 Keep existing `transactions` behavior unchanged.

 Add optional fields:

 - `active_orders`: latest open snapshot heads to upsert
 - `order_updates`: new update events to append

 Rules:

 - server upserts snapshot by `order_id` + scope
 - server inserts updates by `update_id` (idempotent duplicate handling)
 - duplicate update replay returns success-equivalent result (no second effect)

 ### Pull (`GET /api/sync/pull`)

 Extend response with outlet-scoped open order collaboration data:

 - `open_orders`: current snapshot heads
 - `open_order_lines`: line state for snapshots
 - `order_updates`: events since cursor
 - `orders_cursor`: high-water mark returned by server

 Cursor semantics:

 - client sends last applied cursor
 - server returns updates strictly newer than cursor
 - client stores cursor only after successful atomic apply

 ---

 ## Runtime Behavior

 On each active order mutation in POS runtime:

 1. read previous snapshot state
 2. compute delta
 3. write updated snapshot + lines + `active_order_updates` in one local transaction
 4. enqueue outbox work for pending updates

 On pull apply:

 1. upsert snapshots and lines
 2. append unseen updates
 3. compare active edit base version vs latest remote snapshot
 4. if stale, mark edit session with warning state

 ---

 ## Conflict Handling Policy

 ### Ordering

 Apply by:

 1. server receive order (`created_at` / monotonic id)
 2. then `event_at` as secondary signal

 ### Merge

 - additive item changes are applied as event sequence
 - destructive changes (remove/cancel) remain explicit update records
 - no silent overwrite of update history

 ### Cashier UX

 When a newer remote update arrives during local edit:

 - show warning: "Order changed on another terminal"
 - offer action: reload latest and reapply local draft edits

 ---

 ## Idempotency and Reliability

 - finalized sales continue using `client_tx_id`
 - order updates use `update_id`
 - replay-safe push and pull are mandatory
 - outbox retries must not duplicate server-side events

 ---

## Rollout Phases

 1. **Schema + contracts:** local/server tables and shared Zod schemas
 2. **Runtime emission:** generate and persist update events on active-order edits
 3. **Push path:** outbox support for snapshots + updates
 4. **Pull path:** ingest open orders + update history on other terminals
 5. **UX conflict warning:** stale-edit detection and reapply flow
6. **Hard lock (optional future):** table edit lease only if optimistic strategy proves insufficient

---

## Implementation Checklist (By File/Module)

### 1) Offline DB (POS local persistence)

- [ ] `packages/offline-db/dexie/types.ts`
  - Add `ActiveOrderUpdateRow` type
  - Add `OrderUpdateEventType` union
  - Add `OrderUpdateSyncStatus` union
- [ ] `packages/offline-db/dexie/db.ts`
  - Add Dexie schema version with `active_order_updates` table and indexes
  - Keep migration additive and backward-safe
- [ ] `packages/offline-db/dexie/index.ts`
  - Re-export new types if needed by consumers

### 2) POS storage port + adapter

- [ ] `apps/pos/src/ports/storage-port.ts`
  - Add read/write methods for `active_order_updates`
  - Add scoped query for pending update events
- [ ] `apps/pos/src/platform/web/storage.ts`
  - Implement update-log CRUD and scoped queries
  - Ensure transaction method supports atomic snapshot+update writes

### 3) POS runtime (event emission)

- [ ] `apps/pos/src/services/runtime-service.ts`
  - Compute deltas on active-order mutation
  - Persist snapshot/lines/update event atomically
  - Store `base_order_updated_at` for stale-edit detection
- [ ] `apps/pos/src/router/Router.tsx`
  - Surface stale-edit warning state when newer remote updates are applied
  - Add reload/reapply action hooks

### 4) POS push path (outbox + sender)

- [ ] `packages/offline-db/dexie/types.ts`
  - Extend `OutboxJobType` with order-sync job type (separate from `SYNC_POS_TX`)
- [ ] `apps/pos/src/offline/outbox.ts`
  - Enqueue order-update jobs (idempotent dedupe key per `update_id`)
- [ ] `apps/pos/src/offline/outbox-sender.ts`
  - Build request payload including `active_orders` + `order_updates`
  - Parse server result for update events
- [ ] `apps/pos/src/offline/outbox-drainer.ts`
  - Retry/failure handling for new job type
  - Preserve existing sale sync semantics
- [ ] `apps/pos/src/services/sync-orchestrator.ts`
  - Ensure scheduler drains both sales and order update jobs safely

### 5) Shared sync contracts (Zod)

- [ ] `packages/shared/src/schemas/pos-sync.ts`
  - Extend push schema with optional `active_orders` and `order_updates`
  - Add event-level result shape if needed for per-update ack
- [ ] `packages/shared/src/schemas/master-data.ts`
  - Extend pull payload with `open_orders`, `open_order_lines`, `order_updates`, `orders_cursor`

### 6) API pull path

- [ ] `apps/api/app/api/sync/pull/route.ts`
  - Parse optional order cursor input
  - Return extended payload using shared schema
- [ ] `apps/api/src/lib/master-data.ts` (or extracted sync module)
  - Query open snapshots + lines + updates by outlet scope
  - Apply cursor filtering and high-water mark generation

### 7) API push path

- [ ] `apps/api/app/api/sync/push/route.ts`
  - Keep current transaction branch unchanged
  - Add optional ingest for snapshot heads + update events
  - Enforce idempotency by `update_id`
  - Return replay-safe outcomes

### 8) Server DB migrations

- [ ] `packages/db/migrations/<next>_pos_order_snapshots.sql`
  - Create `pos_order_snapshots`
  - Create `pos_order_snapshot_lines`
- [ ] `packages/db/migrations/<next>_pos_order_updates.sql`
  - Create `pos_order_updates` with unique `update_id`
  - Add scoped indexes for pull queries and conflict checks
  - Add FKs and checks for tenant/outlet isolation

### 9) Tests (minimum required)

- [ ] `apps/pos/src/offline/__tests__/runtime-service-dinein.test.mjs`
  - Add assertions for emitted update events and stale-edit detection
- [ ] `apps/pos/src/offline/__tests__/outbox-sender.test.mjs`
  - Validate push payload contains `active_orders` and `order_updates`
- [ ] `apps/pos/src/offline/__tests__/outbox-drainer.test.mjs`
  - Validate retries and no duplicate effects for same `update_id`
- [ ] `apps/pos/src/offline/__tests__/sync-pull.test.mjs`
  - Validate ingestion of `open_orders`, `open_order_lines`, `order_updates`, `orders_cursor`
- [ ] `apps/api/tests/integration/sync-push.integration.test.mjs`
  - Add duplicate replay, scope mismatch, and mixed-result scenarios for order updates
- [ ] Add integration coverage for sync pull with order cursor

### 10) Documentation and rollout ops

- [ ] `docs/plans/pos-sync-contracts-spec.md`
  - Update deferred section to implemented/in-progress state
- [ ] `docs/plans/README.md`
  - Mark active-order sync implementation status
- [ ] Add release note for multi-terminal dine-in collaboration behavior

---

## Testing Requirements

 Required before rollout:

 - Dexie migration tests for `active_order_updates`
 - runtime tests for delta emission and atomic snapshot+event writes
 - outbox retry/idempotency tests for update events
 - API integration tests for duplicate `update_id` replay and scope validation
 - pull cursor tests ensuring no gaps and no duplicates
 - cross-device scenario test: terminal A edit -> sync -> terminal B resume sees same state/history

 ---

 ## Acceptance Criteria

 - Open dine-in order state survives offline and app restarts.
 - Another terminal can pull and reconstruct latest state plus history.
 - Duplicate push retries do not create duplicate updates.
 - Cashier sees stale-edit warning when concurrent remote change exists.
 - Tenant and outlet scoping is enforced for all snapshot and update reads/writes.
