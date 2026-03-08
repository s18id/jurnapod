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

test("resolveActiveOrder is idempotent for same dine-in reservation and table context", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-dinein-idempotent-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 10 };

  try {
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
