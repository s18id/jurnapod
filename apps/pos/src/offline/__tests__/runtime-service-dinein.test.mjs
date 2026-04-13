// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "@jurnapod/offline-db/dexie";
import { createWebStorageAdapter } from "../../platform/web/storage.ts";
import { RuntimeService } from "../../services/runtime-service.ts";

function createNetworkMock() {
  return {
    isOnline() {
      return true;
    },
    async verifyConnectivity() {
      return true;
    },
    onStatusChange() {
      return () => {};
    }
  };
}

async function seedOutletTables(storage, scope) {
  const now = new Date().toISOString();
  await storage.upsertOutletTables([
    { pk: `${scope.company_id}:${scope.outlet_id}:1`, table_id: 1, company_id: scope.company_id, outlet_id: scope.outlet_id, code: 'T1', name: 'Table 1', zone: 'Main', capacity: 4, status: 'AVAILABLE', updated_at: now },
    { pk: `${scope.company_id}:${scope.outlet_id}:2`, table_id: 2, company_id: scope.company_id, outlet_id: scope.outlet_id, code: 'T2', name: 'Table 2', zone: 'Main', capacity: 4, status: 'AVAILABLE', updated_at: now },
    { pk: `${scope.company_id}:${scope.outlet_id}:3`, table_id: 3, company_id: scope.company_id, outlet_id: scope.outlet_id, code: 'T3', name: 'Table 3', zone: 'Main', capacity: 4, status: 'RESERVED', updated_at: now },
  ]);
}

test("resolveActiveOrder is idempotent for same dine-in reservation and table context", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-idempotent-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 10 };

  try {
    await seedOutletTables(storage, scope);
    const tables = await runtime.getOutletTables(scope);
    const available = tables.filter((table) => table.status === "AVAILABLE");
    assert.ok(available.length >= 1, "expected at least one available table");
    const tableId = available[0].table_id;

    const reservation = await runtime.createOutletReservation(scope, {
      customer_name: "Rina",
      customer_phone: null,
      guest_count: 3,
      reservation_at: new Date(Date.now() + 3600_000).toISOString(),
      duration_minutes: 90,
      table_id: tableId,
      notes: "Window side"
    });

    const first = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: tableId,
      reservation_id: reservation.reservation_id,
      guest_count: reservation.guest_count,
      notes: reservation.notes
    });

    const second = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: tableId,
      reservation_id: reservation.reservation_id,
      guest_count: reservation.guest_count,
      notes: reservation.notes
    });

    assert.equal(second.order.order_id, first.order.order_id);
    assert.equal(second.order.table_id, tableId);
    assert.equal(second.order.reservation_id, reservation.reservation_id);

    const openOrders = await runtime.listActiveOrders(scope, "OPEN");
    assert.equal(openOrders.length, 1);
  } finally {
    db.close();
  }
});

test("transferActiveOrderTable moves linked reservation and keeps table states consistent", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-transfer-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 11 };

  try {
    await seedOutletTables(storage, scope);
    const tables = await runtime.getOutletTables(scope);
    const available = tables.filter((table) => table.status === "AVAILABLE");
    assert.ok(available.length >= 1, "expected at least one available table");

    const fromTableId = available[0].table_id;
    const fallbackTarget = tables.find((table) => table.table_id !== fromTableId);
    assert.ok(fallbackTarget, "expected a second table candidate");
    const toTableId = fallbackTarget.table_id;

    await runtime.setOutletTableStatus(scope, toTableId, "AVAILABLE");

    const reservation = await runtime.createOutletReservation(scope, {
      customer_name: "Arif",
      customer_phone: null,
      guest_count: 2,
      reservation_at: new Date(Date.now() + 5400_000).toISOString(),
      duration_minutes: 60,
      table_id: fromTableId,
      notes: null
    });

    await runtime.updateReservationStatus(scope, reservation.reservation_id, "ARRIVED");
    await runtime.updateReservationStatus(scope, reservation.reservation_id, "SEATED");

    const order = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: fromTableId,
      reservation_id: reservation.reservation_id
    });

    const moved = await runtime.transferActiveOrderTable(scope, order.order.order_id, toTableId);
    assert.ok(moved);
    assert.equal(moved?.table_id, toTableId);

    const latestReservations = await runtime.getOutletReservations(scope);
    const linkedReservation = latestReservations.find((row) => row.reservation_id === reservation.reservation_id);
    assert.equal(linkedReservation?.table_id, toTableId);

    const latestTables = await runtime.getOutletTables(scope);
    const fromTable = latestTables.find((table) => table.table_id === fromTableId);
    const toTable = latestTables.find((table) => table.table_id === toTableId);

    assert.equal(fromTable?.status, "AVAILABLE");
    assert.equal(toTable?.status, "OCCUPIED");
  } finally {
    db.close();
  }
});

test("completeOrderSession closes order, releases table, and finalizes reservation", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-complete-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 12 };

  try {
    await seedOutletTables(storage, scope);
    const tables = await runtime.getOutletTables(scope);
    const available = tables.filter((table) => table.status === "AVAILABLE");
    assert.ok(available.length >= 1, "expected at least one available table");
    const tableId = available[0].table_id;

    const reservation = await runtime.createOutletReservation(scope, {
      customer_name: "Dewi",
      customer_phone: null,
      guest_count: 4,
      reservation_at: new Date(Date.now() + 1800_000).toISOString(),
      duration_minutes: 120,
      table_id: tableId,
      notes: "Birthday"
    });
    await runtime.updateReservationStatus(scope, reservation.reservation_id, "ARRIVED");
    await runtime.updateReservationStatus(scope, reservation.reservation_id, "SEATED");

    const order = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: tableId,
      reservation_id: reservation.reservation_id
    });

    const session = await runtime.completeOrderSession(scope, {
      order_id: order.order.order_id,
      table_id: tableId,
      reservation_id: reservation.reservation_id
    });

    assert.equal(session.order?.order_status, "COMPLETED");
    assert.equal(session.order?.order_state, "CLOSED");
    assert.equal(session.table?.status, "AVAILABLE");
    assert.equal(session.reservation?.status, "COMPLETED");
  } finally {
    db.close();
  }
});

test("transferActiveOrderTable blocks moving into table with another active reservation", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-transfer-reservation-conflict-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 17 };

  try {
    await seedOutletTables(storage, scope);
    const tables = await runtime.getOutletTables(scope);
    const fromTable = tables.find((table) => table.status === "AVAILABLE");
    const toTable = tables.find((table) => table.status === "RESERVED" && table.table_id !== fromTable?.table_id);

    assert.ok(fromTable, "expected source available table");
    assert.ok(toTable, "expected target reserved table");

    const sourceReservation = await runtime.createOutletReservation(scope, {
      customer_name: "Transfer Source",
      customer_phone: null,
      guest_count: 2,
      reservation_at: new Date(Date.now() + 1800_000).toISOString(),
      duration_minutes: 90,
      table_id: fromTable.table_id,
      notes: null
    });
    await runtime.updateReservationStatus(scope, sourceReservation.reservation_id, "ARRIVED");
    await runtime.updateReservationStatus(scope, sourceReservation.reservation_id, "SEATED");

    const order = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: fromTable.table_id,
      reservation_id: sourceReservation.reservation_id
    });

    await assert.rejects(
      runtime.transferActiveOrderTable(scope, order.order.order_id, toTable.table_id),
      /Target table is not available/
    );
  } finally {
    db.close();
  }
});

test("upsertActiveOrderSnapshot emits update log and outbox job", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-update-log-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 13 };

  try {
    const snapshot = await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: "TAKEAWAY",
      table_id: null,
      reservation_id: null,
      guest_count: null,
      kitchen_sent: false,
      order_status: "OPEN",
      paid_amount: 0,
      notes: "new order",
      lines: [
        {
          item_id: 10,
          sku_snapshot: "SKU-10",
          name_snapshot: "Tea",
          item_type_snapshot: "PRODUCT",
          unit_price_snapshot: 12000,
          qty: 1,
          discount_amount: 0
        }
      ]
    });

    const updates = await db.active_order_updates.toArray();
    const jobs = await db.outbox_jobs.toArray();

    assert.equal(snapshot.order.order_id.length > 0, true);
    assert.equal(snapshot.order.source_flow, "WALK_IN");
    assert.equal(snapshot.order.settlement_flow, "IMMEDIATE");
    assert.equal(updates.length, 1);
    assert.equal(updates[0].order_id, snapshot.order.order_id);
    assert.equal(updates[0].sync_status, "PENDING");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].job_type, "SYNC_POS_ORDER_UPDATE");
    assert.equal(jobs[0].dedupe_key, updates[0].update_id);
  } finally {
    db.close();
  }
});

test("upsertActiveOrderSnapshot requests background push when update queued", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-push-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const pushReasons = [];
  const runtime = new RuntimeService(storage, createNetworkMock(), async (reason) => {
    pushReasons.push(reason);
  });
  const scope = { company_id: 1, outlet_id: 23 };

  try {
    await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: "TAKEAWAY",
      table_id: null,
      reservation_id: null,
      guest_count: null,
      kitchen_sent: false,
      order_status: "OPEN",
      paid_amount: 0,
      notes: "auto push",
      lines: [
        {
          item_id: 12,
          sku_snapshot: "SKU-12",
          name_snapshot: "Latte",
          item_type_snapshot: "PRODUCT",
          unit_price_snapshot: 18000,
          qty: 1,
          discount_amount: 0
        }
      ]
    });

    assert.equal(pushReasons.length, 1);
    assert.equal(pushReasons[0], "BACKGROUND_SYNC");
  } finally {
    db.close();
  }
});

test("resolveActiveOrder defaults settlement flow by service type", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-flow-defaults-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 21 };

  try {
    await seedOutletTables(storage, scope);
    const takeaway = await runtime.resolveActiveOrder(scope, {
      service_type: "TAKEAWAY"
    });
    assert.equal(takeaway.order.source_flow, "WALK_IN");
    assert.equal(takeaway.order.settlement_flow, "IMMEDIATE");

    const tables = await runtime.getOutletTables(scope);
    const available = tables.find((table) => table.status === "AVAILABLE");
    assert.ok(available, "expected at least one available table");

    const dineIn = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: available.table_id
    });
    assert.equal(dineIn.order.source_flow, "WALK_IN");
    assert.equal(dineIn.order.settlement_flow, "DEFERRED");
  } finally {
    db.close();
  }
});

test("cancelFinalizedOrderLine reduces committed qty and writes immutable cancel event", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-cancel-line-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 14 };

  try {
    const created = await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: "TAKEAWAY",
      table_id: null,
      reservation_id: null,
      guest_count: null,
      kitchen_sent: true,
      order_status: "OPEN",
      paid_amount: 0,
      notes: null,
      lines: [
        {
          item_id: 99,
          sku_snapshot: "SKU-99",
          name_snapshot: "Nasi Goreng",
          item_type_snapshot: "PRODUCT",
          unit_price_snapshot: 25000,
          qty: 3,
          discount_amount: 6000
        }
      ]
    });

    const cancelled = await runtime.cancelFinalizedOrderLine(scope, {
      order_id: created.order.order_id,
      item_id: 99,
      cancel_qty: 2,
      reason: "Customer removed extra portion"
    });

    assert.equal(cancelled.lines.length, 1);
    assert.equal(cancelled.lines[0].qty, 1);
    assert.equal(cancelled.lines[0].discount_amount, 2000);

    const updates = (await db.active_order_updates.toArray())
      .filter((update) => update.order_id === created.order.order_id);
    const cancelUpdate = updates.find((update) => update.event_type === "ITEM_CANCELLED");

    assert.ok(cancelUpdate, "expected ITEM_CANCELLED update event");
    const delta = JSON.parse(cancelUpdate.delta_json);
    assert.equal(delta.reason, "Customer removed extra portion");
    assert.equal(delta.cancelled_qty, 2);
    assert.equal(delta.previous_qty, 3);
    assert.equal(delta.next_qty, 1);

    const outboxJobs = (await db.outbox_jobs.toArray())
      .filter((job) => job.dedupe_key === cancelUpdate.update_id);
    assert.equal(outboxJobs.length, 1);
    assert.equal(outboxJobs[0].job_type, "SYNC_POS_ORDER_UPDATE");

    const cancellations = await db.item_cancellations.toArray();
    assert.equal(cancellations.length, 1);
    assert.equal(cancellations[0].order_id, created.order.order_id);
    assert.equal(cancellations[0].item_id, 99);
    assert.equal(cancellations[0].cancelled_quantity, 2);
    assert.equal(cancellations[0].sync_status, "PENDING");

    const outboxPayload = JSON.parse(outboxJobs[0].payload_json);
    assert.equal(typeof outboxPayload.cancellation_id, "string");
  } finally {
    db.close();
  }
});

test("cancelFinalizedOrderLine requires reason and bounded quantity", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-cancel-validation-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 15 };

  try {
    const created = await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: "TAKEAWAY",
      table_id: null,
      reservation_id: null,
      guest_count: null,
      kitchen_sent: true,
      order_status: "OPEN",
      paid_amount: 0,
      notes: null,
      lines: [
        {
          item_id: 11,
          sku_snapshot: "SKU-11",
          name_snapshot: "Espresso",
          item_type_snapshot: "PRODUCT",
          unit_price_snapshot: 18000,
          qty: 1,
          discount_amount: 0
        }
      ]
    });

    await assert.rejects(
      runtime.cancelFinalizedOrderLine(scope, {
        order_id: created.order.order_id,
        item_id: 11,
        cancel_qty: 1,
        reason: "   "
      }),
      /Cancellation reason is required/
    );

    await assert.rejects(
      runtime.cancelFinalizedOrderLine(scope, {
        order_id: created.order.order_id,
        item_id: 11,
        cancel_qty: 2,
        reason: "customer changed mind"
      }),
      /cancel_qty exceeds committed quantity/
    );
  } finally {
    db.close();
  }
});

test("resume order then cancel item keeps totals consistent and writes update log", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-resume-cancel-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 16 };

  try {
    await seedOutletTables(storage, scope);
    const tableId = 1;
    await runtime.setOutletTableStatus(scope, tableId, "AVAILABLE");

    const created = await runtime.upsertActiveOrderSnapshot(scope, {
      service_type: "DINE_IN",
      table_id: tableId,
      reservation_id: null,
      guest_count: 2,
      kitchen_sent: true,
      order_status: "OPEN",
      paid_amount: 0,
      notes: "table order",
      lines: [
        {
          item_id: 201,
          sku_snapshot: "SKU-201",
          name_snapshot: "Fried Rice",
          item_type_snapshot: "PRODUCT",
          unit_price_snapshot: 25000,
          qty: 2,
          discount_amount: 0
        }
      ]
    });

    const resumed = await runtime.resolveActiveOrder(scope, {
      service_type: "DINE_IN",
      table_id: tableId
    });
    assert.equal(resumed.order.order_id, created.order.order_id);

    const beforeSubtotal = resumed.lines.reduce(
      (sum, line) => sum + (line.qty * line.unit_price_snapshot) - line.discount_amount,
      0
    );

    const afterCancel = await runtime.cancelFinalizedOrderLine(scope, {
      order_id: resumed.order.order_id,
      item_id: 201,
      cancel_qty: 1,
      reason: "Guest changed order"
    });

    const afterSubtotal = afterCancel.lines.reduce(
      (sum, line) => sum + (line.qty * line.unit_price_snapshot) - line.discount_amount,
      0
    );

    assert.equal(beforeSubtotal, 50000);
    assert.equal(afterSubtotal, 25000);

    const updates = (await db.active_order_updates.toArray())
      .filter((update) => update.order_id === resumed.order.order_id)
      .sort((a, b) => a.event_at.localeCompare(b.event_at));
    const latest = updates[updates.length - 1];

    assert.equal(latest.event_type, "ITEM_CANCELLED");
    const delta = JSON.parse(latest.delta_json);
    assert.equal(delta.reason, "Guest changed order");
    assert.equal(delta.cancelled_qty, 1);
    assert.equal(delta.previous_qty, 2);
    assert.equal(delta.next_qty, 1);
  } finally {
    db.close();
  }
});
