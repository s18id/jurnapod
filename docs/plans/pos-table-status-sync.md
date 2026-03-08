POS Table Status Server Sync Plan
Problem Statement

Tables with active dine-in orders can show as AVAILABLE in the POS Tables page. This happens because the server does not update outlet_tables.status when active orders are created or updated, while sync pulls overwrite local status changes. With multiple POS clients, this causes inconsistent status views across devices.

Goals

Make the server the source of truth for table status so all POS clients see consistent occupied/available state.

Update outlet_tables.status based on active order state transitions.

Respect reservations when releasing tables.

Preserve the ability to mark tables as UNAVAILABLE for maintenance.

Approach

1. Update the /api/sync/push order updates flow to manage table status.
2. Remove client-side status updates for OCCUPIED, AVAILABLE, and RESERVED.
3. Keep client-side UNAVAILABLE marking only.
4. Add a migration to reconcile existing table status values.

Server Changes

File: apps/api/app/api/sync/push/route.ts

During the order updates loop, read the previous snapshot state, then update outlet_tables.status after the snapshot UPSERT. The update rules:

New OPEN dine-in order with table_id -> set table to OCCUPIED.

OPEN -> CLOSED transition -> set table to AVAILABLE unless there is an active reservation (BOOKED, CONFIRMED, ARRIVED), in which case set to RESERVED.

CLOSED -> OPEN transition (resume) -> set table to OCCUPIED.

Table transfer (table_id changes) -> release old table (AVAILABLE or RESERVED), occupy new table if order is OPEN.

Table removed from order (table_id becomes null) -> release previous table (AVAILABLE or RESERVED).

Always scope updates by company_id, outlet_id, and table id. Update updated_at timestamp on every status change.

Client Changes

Remove setOutletTableStatus calls that set OCCUPIED or AVAILABLE:

apps/pos/src/pages/TablesPage.tsx

apps/pos/src/pages/ProductsPage.tsx

apps/pos/src/pages/CartPage.tsx

apps/pos/src/router/AppLayout.tsx

Restrict runtime.setOutletTableStatus to UNAVAILABLE only. Attempts to set other statuses should be ignored or logged. The POS should rely on server sync for OCCUPIED, AVAILABLE, and RESERVED.

Migration

Add a one-time SQL migration to reconcile table status based on current data:

1. Set OCCUPIED for tables with OPEN dine-in orders in pos_order_snapshots.
2. Set RESERVED for tables with active reservations but no OPEN dine-in orders.
3. Set AVAILABLE for tables with no OPEN dine-in orders and no active reservations.
4. Do not override UNAVAILABLE.

Testing

Add integration tests in apps/api/tests/integration/sync-push.integration.test.mjs:

New dine-in OPEN order -> table becomes OCCUPIED.

Order closes -> table becomes AVAILABLE if no reservation exists.

Order closes with reservation -> table becomes RESERVED.

Order resumes -> table becomes OCCUPIED.

Table transfer -> old table released, new table occupied.

Order removes table_id -> previous table released.

Duplicate sync-push -> status remains idempotent.

Rollout Plan

1. Deploy server changes first (backward compatible).
2. Run migration to reconcile table statuses.
3. Deploy client cleanup (remove local status updates).
4. Validate on multiple POS devices with offline and online flows.

Notes

This plan maintains offline-first behavior for order capture, while making table status consistent across devices through server-authoritative sync.
