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

function iso(ms) {
  return new Date(ms).toISOString();
}

test("transferActiveOrderTable rolls back table updates if order write fails", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-transfer-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 1, outlet_id: 10 };
  const now = Date.parse("2026-03-08T12:00:00.000Z");

  try {
    await storage.upsertOutletTables([
      {
        pk: `${scope.company_id}:${scope.outlet_id}:1`,
        table_id: 1,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        code: "A1",
        name: "Table A1",
        zone: "Main",
        capacity: 4,
        status: "OCCUPIED",
        updated_at: iso(now)
      },
      {
        pk: `${scope.company_id}:${scope.outlet_id}:2`,
        table_id: 2,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        code: "A2",
        name: "Table A2",
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        updated_at: iso(now)
      }
    ]);

    await storage.upsertActiveOrders([
      {
        pk: "order-1",
        order_id: "order-1",
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        service_type: "DINE_IN",
        table_id: 1,
        reservation_id: null,
        guest_count: 2,
        is_finalized: true,
        order_status: "OPEN",
        order_state: "OPEN",
        paid_amount: 0,
        opened_at: iso(now),
        closed_at: null,
        notes: null,
        updated_at: iso(now)
      }
    ]);

    const originalUpsertActiveOrders = storage.upsertActiveOrders.bind(storage);
    storage.upsertActiveOrders = async () => {
      throw new Error("forced-upsert-active-orders-failure");
    };

    await assert.rejects(
      runtime.transferActiveOrderTable(scope, "order-1", 2),
      /forced-upsert-active-orders-failure/
    );

    storage.upsertActiveOrders = originalUpsertActiveOrders;

    const tables = await runtime.getOutletTables(scope);
    const orderSnapshot = await runtime.getActiveOrderSnapshot(scope, "order-1");

    const from = tables.find((row) => row.table_id === 1);
    const to = tables.find((row) => row.table_id === 2);
    assert.equal(from?.status, "OCCUPIED");
    assert.equal(to?.status, "AVAILABLE");
    assert.equal(orderSnapshot?.order.table_id, 1);
  } finally {
    db.close();
    await db.delete();
  }
});

test("completeOrderSession rolls back table and reservation updates if order close fails", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-service-complete-${crypto.randomUUID()}`);
  const storage = createWebStorageAdapter(db);
  const runtime = new RuntimeService(storage, createNetworkMock());
  const scope = { company_id: 2, outlet_id: 20 };
  const now = Date.parse("2026-03-08T13:00:00.000Z");

  try {
    await storage.upsertOutletTables([
      {
        pk: `${scope.company_id}:${scope.outlet_id}:7`,
        table_id: 7,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        code: "B7",
        name: "Table B7",
        zone: "Window",
        capacity: 4,
        status: "OCCUPIED",
        updated_at: iso(now)
      }
    ]);

    await storage.upsertReservations([
      {
        pk: `${scope.company_id}:${scope.outlet_id}:77`,
        reservation_id: 77,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        table_id: 7,
        customer_name: "Customer",
        customer_phone: null,
        guest_count: 4,
        reservation_at: iso(now),
        duration_minutes: 90,
        status: "SEATED",
        notes: null,
        linked_order_id: "order-77",
        created_at: iso(now),
        updated_at: iso(now),
        arrived_at: iso(now),
        seated_at: iso(now),
        cancelled_at: null
      }
    ]);

    await storage.upsertActiveOrders([
      {
        pk: "order-77",
        order_id: "order-77",
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        service_type: "DINE_IN",
        table_id: 7,
        reservation_id: 77,
        guest_count: 4,
        is_finalized: true,
        order_status: "READY_TO_PAY",
        order_state: "OPEN",
        paid_amount: 120000,
        opened_at: iso(now),
        closed_at: null,
        notes: null,
        updated_at: iso(now)
      }
    ]);

    const originalUpsertActiveOrders = storage.upsertActiveOrders.bind(storage);
    storage.upsertActiveOrders = async () => {
      throw new Error("forced-close-order-failure");
    };

    await assert.rejects(
      runtime.completeOrderSession(scope, {
        order_id: "order-77",
        table_id: 7,
        reservation_id: 77
      }),
      /forced-close-order-failure/
    );

    storage.upsertActiveOrders = originalUpsertActiveOrders;

    const tables = await runtime.getOutletTables(scope);
    const reservations = await runtime.getOutletReservations(scope);
    const orderSnapshot = await runtime.getActiveOrderSnapshot(scope, "order-77");

    assert.equal(tables.find((row) => row.table_id === 7)?.status, "OCCUPIED");
    assert.equal(reservations.find((row) => row.reservation_id === 77)?.status, "SEATED");
    assert.equal(orderSnapshot?.order.order_state, "OPEN");
    assert.equal(orderSnapshot?.order.order_status, "READY_TO_PAY");
  } finally {
    db.close();
    await db.delete();
  }
});
