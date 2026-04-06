// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Adapters Tests
 *
 * Tests for toTransactionPush, toActiveOrderPush, and buildTxByClientTxIdMap.
 * These are pure mapper functions - no DB needed.
 */

import assert from "node:assert/strict";
import { describe, test } from 'vitest';
import type { SyncPushTransactionPayload } from "../../src/lib/sync/push/types";
import {
  toTransactionPush,
  toActiveOrderPush,
  buildTxByClientTxIdMap
} from "../../src/lib/sync/push/adapters";

describe("Sync Push Adapters", () => {
  // ===========================================================================
  // toTransactionPush Tests
  // ===========================================================================

  describe("toTransactionPush", () => {
    test("maps basic transaction fields", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-001",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        service_type: "TAKEAWAY",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.client_tx_id, "tx-001");
      assert.equal(result.company_id, 1);
      assert.equal(result.outlet_id, 10);
      assert.equal(result.cashier_user_id, 100);
      assert.equal(result.status, "COMPLETED");
      assert.equal(result.service_type, "TAKEAWAY");
      assert.equal(result.trx_at, "2024-01-15T10:30:00Z");
    });

    test("maps optional fields when present", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-002",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        service_type: "DINE_IN",
        table_id: 5,
        reservation_id: 200,
        guest_count: 4,
        order_status: "READY_TO_PAY",
        opened_at: "2024-01-15T10:00:00Z",
        closed_at: "2024-01-15T11:00:00Z",
        notes: "VIP customer",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.table_id, 5);
      assert.equal(result.reservation_id, 200);
      assert.equal(result.guest_count, 4);
      assert.equal(result.order_status, "READY_TO_PAY");
      assert.equal(result.opened_at, "2024-01-15T10:00:00Z");
      assert.equal(result.closed_at, "2024-01-15T11:00:00Z");
      assert.equal(result.notes, "VIP customer");
    });

    test("maps items array correctly", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-003",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [
          { item_id: 1, variant_id: 10, qty: 2, price_snapshot: 15.50, name_snapshot: "Burger" },
          { item_id: 2, qty: 1, price_snapshot: 5.00, name_snapshot: "Fries" }
        ],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.items.length, 2);
      assert.equal(result.items[0].item_id, 1);
      assert.equal(result.items[0].variant_id, 10);
      assert.equal(result.items[0].qty, 2);
      assert.equal(result.items[0].price_snapshot, 15.50);
      assert.equal(result.items[0].name_snapshot, "Burger");
      assert.equal(result.items[1].item_id, 2);
      assert.equal(result.items[1].variant_id, undefined);
    });

    test("maps payments array correctly", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-004",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: [
          { method: "CASH", amount: 100 },
          { method: "CARD", amount: 50 }
        ]
      };

      const result = toTransactionPush(input);

      assert.equal(result.payments.length, 2);
      assert.equal(result.payments[0].method, "CASH");
      assert.equal(result.payments[0].amount, 100);
      assert.equal(result.payments[1].method, "CARD");
      assert.equal(result.payments[1].amount, 50);
    });

    test("maps taxes array when present", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-005",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: [],
        taxes: [
          { tax_rate_id: 1, amount: 10.50 },
          { tax_rate_id: 2, amount: 5.25 }
        ]
      };

      const result = toTransactionPush(input);

      assert.ok(result.taxes);
      assert.equal(result.taxes!.length, 2);
      assert.equal(result.taxes![0].tax_rate_id, 1);
      assert.equal(result.taxes![0].amount, 10.50);
      assert.equal(result.taxes![1].tax_rate_id, 2);
      assert.equal(result.taxes![1].amount, 5.25);
    });

    test("omits taxes when undefined", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-006",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.taxes, undefined);
    });

    test("maps discount fields", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-007",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: [],
        discount_percent: 10,
        discount_fixed: 5,
        discount_code: "SAVE5"
      };

      const result = toTransactionPush(input);

      assert.equal(result.discount_percent, 10);
      assert.equal(result.discount_fixed, 5);
      assert.equal(result.discount_code, "SAVE5");
    });

    test("handles VOID status", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-void",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "VOID",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.status, "VOID");
    });

    test("handles REFUND status", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-refund",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "REFUND",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.status, "REFUND");
    });

    test("preserves null values for optional fields", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-nulls",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        table_id: null,
        reservation_id: null,
        guest_count: null,
        order_status: undefined,
        opened_at: undefined,
        closed_at: null,
        notes: null,
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const result = toTransactionPush(input);

      assert.equal(result.table_id, null);
      assert.equal(result.reservation_id, null);
      assert.equal(result.guest_count, null);
      assert.equal(result.order_status, undefined);
      assert.equal(result.opened_at, undefined);
      assert.equal(result.closed_at, null);
      assert.equal(result.notes, null);
    });
  });

  // ===========================================================================
  // toActiveOrderPush Tests
  // ===========================================================================

  describe("toActiveOrderPush", () => {
    test("maps basic order fields", () => {
      const input = {
        order_id: "order-001",
        company_id: 1,
        outlet_id: 10,
        service_type: "DINE_IN",
        is_finalized: false,
        order_status: "OPEN",
        order_state: "OPEN",
        paid_amount: 0,
        opened_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:30:00Z",
        lines: []
      };

      const result = toActiveOrderPush(input);

      assert.equal(result.order_id, "order-001");
      assert.equal(result.company_id, 1);
      assert.equal(result.outlet_id, 10);
      assert.equal(result.service_type, "DINE_IN");
      assert.equal(result.is_finalized, false);
      assert.equal(result.order_status, "OPEN");
      assert.equal(result.order_state, "OPEN");
      assert.equal(result.paid_amount, 0);
      assert.equal(result.opened_at, "2024-01-15T10:00:00Z");
      assert.equal(result.updated_at, "2024-01-15T10:30:00Z");
    });

    test("maps optional fields when present", () => {
      const input = {
        order_id: "order-002",
        company_id: 1,
        outlet_id: 10,
        service_type: "TAKEAWAY",
        source_flow: "POS",
        settlement_flow: "IMMEDIATE",
        table_id: 5,
        reservation_id: 200,
        guest_count: 4,
        is_finalized: true,
        order_status: "COMPLETED",
        order_state: "CLOSED",
        paid_amount: 150.75,
        opened_at: "2024-01-15T10:00:00Z",
        closed_at: "2024-01-15T11:00:00Z",
        notes: "Customer prefers no onions",
        updated_at: "2024-01-15T11:00:00Z",
        lines: []
      };

      const result = toActiveOrderPush(input);

      assert.equal(result.source_flow, "POS");
      assert.equal(result.settlement_flow, "IMMEDIATE");
      assert.equal(result.table_id, 5);
      assert.equal(result.reservation_id, 200);
      assert.equal(result.guest_count, 4);
      assert.equal(result.is_finalized, true);
      assert.equal(result.closed_at, "2024-01-15T11:00:00Z");
      assert.equal(result.notes, "Customer prefers no onions");
    });

    test("maps order lines correctly", () => {
      const input = {
        order_id: "order-003",
        company_id: 1,
        outlet_id: 10,
        service_type: "DINE_IN",
        is_finalized: false,
        order_status: "OPEN",
        order_state: "OPEN",
        paid_amount: 0,
        opened_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:30:00Z",
        lines: [
          {
            item_id: 1,
            variant_id: 10,
            sku_snapshot: "BRG-001",
            name_snapshot: "Classic Burger",
            item_type_snapshot: "FOOD",
            unit_price_snapshot: 15.50,
            qty: 2,
            discount_amount: 0,
            updated_at: "2024-01-15T10:15:00Z"
          },
          {
            item_id: 2,
            variant_id: undefined,
            sku_snapshot: null,
            name_snapshot: "Fries",
            item_type_snapshot: "SIDES",
            unit_price_snapshot: 5.00,
            qty: 1,
            discount_amount: 1.00,
            updated_at: "2024-01-15T10:15:00Z"
          }
        ]
      };

      const result = toActiveOrderPush(input);

      assert.equal(result.lines.length, 2);
      assert.equal(result.lines[0].item_id, 1);
      assert.equal(result.lines[0].variant_id, 10);
      assert.equal(result.lines[0].sku_snapshot, "BRG-001");
      assert.equal(result.lines[0].name_snapshot, "Classic Burger");
      assert.equal(result.lines[0].item_type_snapshot, "FOOD");
      assert.equal(result.lines[0].unit_price_snapshot, 15.50);
      assert.equal(result.lines[0].qty, 2);
      assert.equal(result.lines[0].discount_amount, 0);
      assert.equal(result.lines[1].item_id, 2);
      assert.equal(result.lines[1].sku_snapshot, null);
    });

    test("returns empty lines array when lines is undefined", () => {
      const input = {
        order_id: "order-004",
        company_id: 1,
        outlet_id: 10,
        service_type: "TAKEAWAY",
        is_finalized: false,
        order_status: "OPEN",
        order_state: "OPEN",
        paid_amount: 0,
        opened_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:30:00Z"
        // lines is undefined
      };

      const result = toActiveOrderPush(input);

      assert.ok(Array.isArray(result.lines));
      assert.equal(result.lines.length, 0);
    });

    test("handles finalized order", () => {
      const input = {
        order_id: "order-finalized",
        company_id: 1,
        outlet_id: 10,
        service_type: "DINE_IN",
        is_finalized: true,
        order_status: "COMPLETED",
        order_state: "CLOSED",
        paid_amount: 150.00,
        opened_at: "2024-01-15T10:00:00Z",
        closed_at: "2024-01-15T11:30:00Z",
        updated_at: "2024-01-15T11:30:00Z",
        lines: []
      };

      const result = toActiveOrderPush(input);

      assert.equal(result.is_finalized, true);
      assert.equal(result.order_status, "COMPLETED");
      assert.equal(result.order_state, "CLOSED");
      assert.equal(result.paid_amount, 150.00);
    });
  });

  // ===========================================================================
  // buildTxByClientTxIdMap Tests
  // ===========================================================================

  describe("buildTxByClientTxIdMap", () => {
    test("builds map with single transaction", () => {
      const transactions: SyncPushTransactionPayload[] = [
        {
          client_tx_id: "tx-001",
          company_id: 1,
          outlet_id: 10,
          cashier_user_id: 100,
          status: "COMPLETED",
          trx_at: "2024-01-15T10:30:00Z",
          items: [],
          payments: []
        }
      ];

      const result = buildTxByClientTxIdMap(transactions);

      assert.equal(result.size, 1);
      assert.equal(result.get("tx-001"), transactions[0]);
    });

    test("builds map with multiple transactions", () => {
      const transactions: SyncPushTransactionPayload[] = [
        {
          client_tx_id: "tx-001",
          company_id: 1,
          outlet_id: 10,
          cashier_user_id: 100,
          status: "COMPLETED",
          trx_at: "2024-01-15T10:30:00Z",
          items: [],
          payments: []
        },
        {
          client_tx_id: "tx-002",
          company_id: 1,
          outlet_id: 10,
          cashier_user_id: 100,
          status: "COMPLETED",
          trx_at: "2024-01-15T10:35:00Z",
          items: [],
          payments: []
        },
        {
          client_tx_id: "tx-003",
          company_id: 1,
          outlet_id: 10,
          cashier_user_id: 100,
          status: "COMPLETED",
          trx_at: "2024-01-15T10:40:00Z",
          items: [],
          payments: []
        }
      ];

      const result = buildTxByClientTxIdMap(transactions);

      assert.equal(result.size, 3);
      assert.equal(result.get("tx-001"), transactions[0]);
      assert.equal(result.get("tx-002"), transactions[1]);
      assert.equal(result.get("tx-003"), transactions[2]);
    });

    test("returns empty map for empty array", () => {
      const result = buildTxByClientTxIdMap([]);

      assert.equal(result.size, 0);
    });

    test("last transaction wins for duplicate client_tx_id", () => {
      const tx1: SyncPushTransactionPayload = {
        client_tx_id: "tx-dup",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "COMPLETED",
        trx_at: "2024-01-15T10:30:00Z",
        items: [],
        payments: []
      };

      const tx2: SyncPushTransactionPayload = {
        client_tx_id: "tx-dup",
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 100,
        status: "VOID",
        trx_at: "2024-01-15T10:35:00Z",
        items: [],
        payments: []
      };

      const result = buildTxByClientTxIdMap([tx1, tx2]);

      assert.equal(result.size, 1);
      assert.equal(result.get("tx-dup"), tx2);
    });
  });

  // ===========================================================================
  // Integration-style Tests: Full Payload Round-trip
  // ===========================================================================

  describe("Full Payload Mapping", () => {
    test("complete transaction with all fields maps correctly", () => {
      const input: SyncPushTransactionPayload = {
        client_tx_id: "tx-full",
        company_id: 42,
        outlet_id: 100,
        cashier_user_id: 1000,
        status: "COMPLETED",
        service_type: "DINE_IN",
        table_id: 5,
        reservation_id: 200,
        guest_count: 4,
        order_status: "READY_TO_PAY",
        opened_at: "2024-01-15T10:00:00Z",
        closed_at: "2024-01-15T11:00:00Z",
        notes: "Birthday celebration",
        trx_at: "2024-01-15T10:30:00Z",
        items: [
          {
            item_id: 1,
            variant_id: 10,
            qty: 2,
            price_snapshot: 25.00,
            name_snapshot: "Steak"
          }
        ],
        payments: [{ method: "CARD", amount: 55.00 }],
        taxes: [{ tax_rate_id: 1, amount: 5.00 }],
        discount_percent: 10,
        discount_fixed: 5,
        discount_code: "BIRTHDAY"
      };

      const result = toTransactionPush(input);

      // Verify all fields
      assert.equal(result.client_tx_id, "tx-full");
      assert.equal(result.company_id, 42);
      assert.equal(result.outlet_id, 100);
      assert.equal(result.cashier_user_id, 1000);
      assert.equal(result.status, "COMPLETED");
      assert.equal(result.service_type, "DINE_IN");
      assert.equal(result.table_id, 5);
      assert.equal(result.reservation_id, 200);
      assert.equal(result.guest_count, 4);
      assert.equal(result.order_status, "READY_TO_PAY");
      assert.equal(result.opened_at, "2024-01-15T10:00:00Z");
      assert.equal(result.closed_at, "2024-01-15T11:00:00Z");
      assert.equal(result.notes, "Birthday celebration");
      assert.equal(result.trx_at, "2024-01-15T10:30:00Z");
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].item_id, 1);
      assert.equal(result.payments.length, 1);
      assert.equal(result.payments[0].method, "CARD");
      assert.equal(result.taxes!.length, 1);
      assert.equal(result.discount_percent, 10);
      assert.equal(result.discount_fixed, 5);
      assert.equal(result.discount_code, "BIRTHDAY");
    });

    test("complete active order with all lines maps correctly", () => {
      const input = {
        order_id: "order-full",
        company_id: 42,
        outlet_id: 100,
        service_type: "DINE_IN",
        source_flow: "POS",
        settlement_flow: "IMMEDIATE",
        table_id: 5,
        reservation_id: 200,
        guest_count: 4,
        is_finalized: false,
        order_status: "OPEN",
        order_state: "OPEN",
        paid_amount: 75.50,
        opened_at: "2024-01-15T10:00:00Z",
        closed_at: null,
        notes: "Window seat",
        updated_at: "2024-01-15T10:45:00Z",
        lines: [
          {
            item_id: 1,
            variant_id: 10,
            sku_snapshot: "STK-001",
            name_snapshot: "Ribeye Steak",
            item_type_snapshot: "FOOD",
            unit_price_snapshot: 45.00,
            qty: 1,
            discount_amount: 0,
            updated_at: "2024-01-15T10:30:00Z"
          },
          {
            item_id: 2,
            variant_id: 20,
            sku_snapshot: "WNE-001",
            name_snapshot: "House Red Wine",
            item_type_snapshot: "BEVERAGE",
            unit_price_snapshot: 25.00,
            qty: 1,
            discount_amount: 5.00,
            updated_at: "2024-01-15T10:35:00Z"
          }
        ]
      };

      const result = toActiveOrderPush(input);

      assert.equal(result.order_id, "order-full");
      assert.equal(result.company_id, 42);
      assert.equal(result.outlet_id, 100);
      assert.equal(result.service_type, "DINE_IN");
      assert.equal(result.source_flow, "POS");
      assert.equal(result.settlement_flow, "IMMEDIATE");
      assert.equal(result.table_id, 5);
      assert.equal(result.reservation_id, 200);
      assert.equal(result.guest_count, 4);
      assert.equal(result.is_finalized, false);
      assert.equal(result.order_status, "OPEN");
      assert.equal(result.order_state, "OPEN");
      assert.equal(result.paid_amount, 75.50);
      assert.equal(result.opened_at, "2024-01-15T10:00:00Z");
      assert.equal(result.closed_at, null);
      assert.equal(result.notes, "Window seat");
      assert.equal(result.updated_at, "2024-01-15T10:45:00Z");
      assert.equal(result.lines.length, 2);
      assert.equal(result.lines[0].name_snapshot, "Ribeye Steak");
      assert.equal(result.lines[1].name_snapshot, "House Red Wine");
      assert.equal(result.lines[1].discount_amount, 5.00);
    });
  });
});
