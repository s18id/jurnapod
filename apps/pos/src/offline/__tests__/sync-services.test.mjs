// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";

import { SyncService } from "../../services/sync-service.ts";
import { SyncOrchestrator } from "../../services/sync-orchestrator.ts";

function createPullResponse(input) {
  return {
    success: true,
    data: {
      data_version: input.data_version,
      items: input.items ?? [],
      item_groups: input.item_groups ?? [],
      prices: input.prices ?? [],
      config: input.config ?? {
        tax: { rate: 0, inclusive: false },
        payment_methods: ["CASH"]
      },
      open_orders: input.open_orders ?? [],
      open_order_lines: input.open_order_lines ?? [],
      order_updates: input.order_updates ?? [],
      orders_cursor: input.orders_cursor,
      tables: input.tables ?? [],
      reservations: input.reservations ?? []
    }
  };
}

test("SyncService pull still updates tables/reservations when data version unchanged", async () => {
  const calls = {
    upsertProducts: 0,
    upsertOutletTables: 0,
    upsertReservations: 0,
    upsertSyncMetadata: 0
  };

  const storage = {
    async getSyncMetadata() {
      return {
        last_data_version: 12
      };
    },
    async getProductsByOutlet() {
      return [{ item_id: 1001 }];
    },
    async upsertProducts() {
      calls.upsertProducts += 1;
    },
    async upsertOutletTables(rows) {
      calls.upsertOutletTables += 1;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].table_id, 99);
    },
    async upsertReservations(rows) {
      calls.upsertReservations += 1;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].reservation_id, 55);
    },
    async upsertSyncMetadata(metadata) {
      calls.upsertSyncMetadata += 1;
      assert.equal(metadata.last_data_version, 12);
    },
    async upsertSyncScopeConfig() {}
  };

  const transport = {
    async pull(request) {
      assert.equal(request.since_version, 12);
      return createPullResponse({
        data_version: 12,
        tables: [
          {
            table_id: 99,
            code: "T99",
            name: "Table 99",
            zone: null,
            capacity: 4,
            status: "AVAILABLE",
            updated_at: "2026-03-08T00:00:00.000Z"
          }
        ],
        reservations: [
          {
            reservation_id: 55,
            table_id: 99,
            customer_name: "Guest",
            customer_phone: null,
            guest_count: 2,
            reservation_at: "2026-03-08T00:00:00.000Z",
            duration_minutes: 90,
            status: "BOOKED",
            notes: null,
            linked_order_id: null,
            arrived_at: null,
            seated_at: null,
            cancelled_at: null,
            updated_at: "2026-03-08T00:00:00.000Z"
          }
        ]
      });
    }
  };

  const service = new SyncService(storage, transport);

  const result = await service.pull({ company_id: 1, outlet_id: 10 });

  assert.equal(result.data_version, 12);
  assert.equal(result.upserted_product_count, 0);
  assert.equal(calls.upsertProducts, 0);
  assert.equal(calls.upsertOutletTables, 1);
  assert.equal(calls.upsertReservations, 1);
  assert.equal(calls.upsertSyncMetadata, 1);
});

test("SyncOrchestrator pull ingests non-catalog updates even when data version unchanged", async () => {
  const calls = {
    upsertProducts: 0,
    upsertActiveOrders: 0,
    replaceActiveOrderLines: 0,
    putActiveOrderUpdate: 0,
    upsertOutletTables: 0,
    upsertReservations: 0,
    upsertSyncMetadata: 0
  };

  const storage = {
    async getSyncMetadata() {
      return {
        last_data_version: 7,
        orders_cursor: 3
      };
    },
    async getProductsByOutlet() {
      return [{ item_id: 1001 }];
    },
    async upsertProducts() {
      calls.upsertProducts += 1;
    },
    async upsertSyncMetadata(metadata) {
      calls.upsertSyncMetadata += 1;
      assert.equal(metadata.last_data_version, 7);
      assert.equal(metadata.orders_cursor, 9);
    },
    async upsertSyncScopeConfig() {},
    async upsertActiveOrders(rows) {
      calls.upsertActiveOrders += 1;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].order_id, "order-1");
    },
    async replaceActiveOrderLines(orderId, rows) {
      calls.replaceActiveOrderLines += 1;
      assert.equal(orderId, "order-1");
      assert.equal(rows.length, 1);
    },
    async putActiveOrderUpdate(update) {
      calls.putActiveOrderUpdate += 1;
      assert.equal(update.update_id, "upd-1");
    },
    async upsertOutletTables(rows) {
      calls.upsertOutletTables += 1;
      assert.equal(rows.length, 1);
    },
    async upsertReservations(rows) {
      calls.upsertReservations += 1;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].reservation_id, 77);
    }
  };

  const network = {
    async verifyConnectivity() {
      return true;
    }
  };

  const transport = {
    async pull() {
      return createPullResponse({
        data_version: 7,
        orders_cursor: 9,
        open_orders: [
          {
            order_id: "order-1",
            company_id: 1,
            outlet_id: 10,
            service_type: "DINE_IN",
            table_id: 5,
            reservation_id: null,
            guest_count: 2,
            is_finalized: false,
            order_status: "OPEN",
            order_state: "OPEN",
            paid_amount: 0,
            opened_at: "2026-03-08T00:00:00.000Z",
            closed_at: null,
            notes: null,
            updated_at: "2026-03-08T00:00:00.000Z"
          }
        ],
        open_order_lines: [
          {
            order_id: "order-1",
            company_id: 1,
            outlet_id: 10,
            item_id: 1001,
            sku_snapshot: "SKU-1001",
            name_snapshot: "Americano",
            item_type_snapshot: "PRODUCT",
            unit_price_snapshot: 28000,
            qty: 1,
            discount_amount: 0,
            updated_at: "2026-03-08T00:00:00.000Z"
          }
        ],
        order_updates: [
          {
            update_id: "upd-1",
            order_id: "order-1",
            company_id: 1,
            outlet_id: 10,
            base_order_updated_at: null,
            event_type: "SNAPSHOT_FINALIZED",
            delta_json: "{}",
            actor_user_id: null,
            device_id: "TERM-1",
            event_at: "2026-03-08T00:00:00.000Z",
            created_at: "2026-03-08T00:00:00.000Z",
            sequence_no: 9
          }
        ],
        tables: [
          {
            table_id: 5,
            code: "T5",
            name: "Table 5",
            zone: "Main",
            capacity: 4,
            status: "OCCUPIED",
            updated_at: "2026-03-08T00:00:00.000Z"
          }
        ],
        reservations: [
          {
            reservation_id: 77,
            table_id: 5,
            customer_name: "Walk-in",
            customer_phone: null,
            guest_count: 2,
            reservation_at: "2026-03-08T00:00:00.000Z",
            duration_minutes: null,
            status: "ARRIVED",
            notes: null,
            linked_order_id: null,
            arrived_at: "2026-03-08T00:00:00.000Z",
            seated_at: null,
            cancelled_at: null,
            updated_at: "2026-03-08T00:00:00.000Z"
          }
        ]
      });
    }
  };

  const orchestrator = new SyncOrchestrator(storage, network, transport, {
    apiOrigin: "http://127.0.0.1:3001"
  });

  const result = await orchestrator.executePull({ company_id: 1, outlet_id: 10 });

  assert.equal(result.success, true);
  assert.equal(result.data_version, 7);
  assert.equal(result.upserted_product_count, 0);
  assert.equal(calls.upsertProducts, 0);
  assert.equal(calls.upsertActiveOrders, 1);
  assert.equal(calls.replaceActiveOrderLines, 1);
  assert.equal(calls.putActiveOrderUpdate, 1);
  assert.equal(calls.upsertOutletTables, 1);
  assert.equal(calls.upsertReservations, 1);
  assert.equal(calls.upsertSyncMetadata, 1);
});
