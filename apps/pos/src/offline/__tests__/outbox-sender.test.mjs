// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "@jurnapod/offline-db/dexie";
import { sendOutboxJobToSyncPush } from "../outbox-sender.ts";

function nowIso() {
  return new Date().toISOString();
}

test("outbox sender includes service and reservation metadata in sync payload", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-sender-test-${crypto.randomUUID()}`);
  const timestamp = nowIso();
  const saleId = crypto.randomUUID();
  const clientTxId = crypto.randomUUID();
  const jobId = crypto.randomUUID();

  try {
    await db.sales.add({
      sale_id: saleId,
      client_tx_id: clientTxId,
      company_id: 9,
      outlet_id: 90,
      cashier_user_id: 909,
      service_type: "DINE_IN",
      table_id: 15,
      reservation_id: 44,
      guest_count: 3,
      order_status: "COMPLETED",
      opened_at: timestamp,
      closed_at: timestamp,
      notes: "Anniversary table",
      status: "COMPLETED",
      sync_status: "PENDING",
      trx_at: timestamp,
      subtotal: 12500,
      discount_total: 0,
      tax_total: 0,
      grand_total: 12500,
      paid_total: 12500,
      change_total: 0,
      data_version: null,
      created_at: timestamp,
      completed_at: timestamp
    });

    await db.sale_items.add({
      line_id: crypto.randomUUID(),
      sale_id: saleId,
      company_id: 9,
      outlet_id: 90,
      item_id: 1,
      name_snapshot: "Iced Tea",
      sku_snapshot: "SKU-IT",
      item_type_snapshot: "SERVICE",
      qty: 1,
      unit_price_snapshot: 12500,
      discount_amount: 0,
      line_total: 12500
    });

    await db.payments.add({
      payment_id: crypto.randomUUID(),
      sale_id: saleId,
      company_id: 9,
      outlet_id: 90,
      method: "CASH",
      amount: 12500,
      reference_no: null,
      paid_at: timestamp
    });

    const job = {
      job_id: jobId,
      sale_id: saleId,
      company_id: 9,
      outlet_id: 90,
      job_type: "SYNC_POS_TX",
      dedupe_key: clientTxId,
      payload_json: JSON.stringify({
        sale_id: saleId,
        client_tx_id: clientTxId,
        company_id: 9,
        outlet_id: 90
      }),
      status: "PENDING",
      attempts: 0,
      lease_owner_id: null,
      lease_token: null,
      lease_expires_at: null,
      next_attempt_at: null,
      last_error: null,
      created_at: timestamp,
      updated_at: timestamp
    };

    let capturedRequest = null;

    const ack = await sendOutboxJobToSyncPush(
      {
        job,
        endpoint: "https://example.com/api/sync/push",
        fetch_impl: async (_url, init) => {
          capturedRequest = JSON.parse(init.body);
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                results: [
                  {
                    client_tx_id: clientTxId,
                    result: "OK"
                  }
                ]
              }
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }
      },
      db
    );

    assert.equal(ack.result, "OK");
    assert.equal(capturedRequest.outlet_id, 90);
    assert.equal(capturedRequest.transactions.length, 1);

    const transaction = capturedRequest.transactions[0];
    assert.equal(transaction.service_type, "DINE_IN");
    assert.equal(transaction.table_id, 15);
    assert.equal(transaction.reservation_id, 44);
    assert.equal(transaction.guest_count, 3);
    assert.equal(transaction.order_status, "COMPLETED");
    assert.equal(transaction.notes, "Anniversary table");
    assert.equal(typeof transaction.opened_at, "string");
    assert.equal(typeof transaction.closed_at, "string");
  } finally {
    db.close();
    await db.delete();
  }
});

test("outbox sender builds active order sync payload for order update jobs", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-sender-order-update-${crypto.randomUUID()}`);
  const now = nowIso();
  const orderId = crypto.randomUUID();
  const updateId = crypto.randomUUID();

  try {
    await db.active_orders.add({
      pk: orderId,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      service_type: "DINE_IN",
      table_id: 7,
      reservation_id: null,
      guest_count: 2,
      is_finalized: false,
      order_status: "OPEN",
      order_state: "OPEN",
      paid_amount: 0,
      opened_at: now,
      closed_at: null,
      notes: "shared",
      updated_at: now
    });
    await db.active_order_lines.add({
      pk: `${orderId}:10`,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      item_id: 10,
      sku_snapshot: "SKU-10",
      name_snapshot: "Tea",
      item_type_snapshot: "PRODUCT",
      unit_price_snapshot: 12000,
      qty: 1,
      discount_amount: 0,
      updated_at: now
    });
    await db.active_order_updates.add({
      pk: `active_order_update:${updateId}`,
      update_id: updateId,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      base_order_updated_at: now,
      event_type: "ITEM_ADDED",
      delta_json: "{}",
      actor_user_id: null,
      device_id: "WEB_POS",
      event_at: now,
      created_at: now,
      sync_status: "PENDING",
      sync_error: null
    });

    const job = {
      job_id: crypto.randomUUID(),
      sale_id: orderId,
      company_id: 9,
      outlet_id: 90,
      job_type: "SYNC_POS_ORDER_UPDATE",
      dedupe_key: updateId,
      payload_json: JSON.stringify({
        update_id: updateId,
        order_id: orderId,
        company_id: 9,
        outlet_id: 90
      }),
      status: "PENDING",
      attempts: 0,
      lease_owner_id: null,
      lease_token: null,
      lease_expires_at: null,
      next_attempt_at: null,
      last_error: null,
      created_at: now,
      updated_at: now
    };

    let capturedRequest = null;

    const ack = await sendOutboxJobToSyncPush(
      {
        job,
        endpoint: "https://example.com/api/sync/push",
        fetch_impl: async (_url, init) => {
          capturedRequest = JSON.parse(init.body);
          return new Response(JSON.stringify({
            success: true,
            data: {
              results: [],
              order_update_results: [
                {
                  update_id: updateId,
                  result: "OK"
                }
              ]
            }
          }), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }
      },
      db
    );

    assert.equal(ack.result, "OK");
    assert.equal(Array.isArray(capturedRequest.active_orders), true);
    assert.equal(Array.isArray(capturedRequest.order_updates), true);
    assert.equal(capturedRequest.order_updates[0].update_id, updateId);
    assert.equal(capturedRequest.active_orders[0].order_id, orderId);
  } finally {
    db.close();
    await db.delete();
  }
});

test("outbox sender includes item cancellation payload and validates cancellation ack", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-sender-cancellation-${crypto.randomUUID()}`);
  const now = nowIso();
  const orderId = crypto.randomUUID();
  const updateId = crypto.randomUUID();
  const cancellationId = crypto.randomUUID();

  try {
    await db.active_orders.add({
      pk: orderId,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      service_type: "DINE_IN",
      source_flow: "WALK_IN",
      settlement_flow: "DEFERRED",
      table_id: 7,
      reservation_id: null,
      guest_count: 2,
      is_finalized: true,
      order_status: "OPEN",
      order_state: "OPEN",
      paid_amount: 0,
      opened_at: now,
      closed_at: null,
      notes: null,
      updated_at: now
    });
    await db.active_order_lines.add({
      pk: `${orderId}:10`,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      item_id: 10,
      sku_snapshot: "SKU-10",
      name_snapshot: "Tea",
      item_type_snapshot: "PRODUCT",
      unit_price_snapshot: 12000,
      qty: 1,
      discount_amount: 0,
      updated_at: now
    });
    await db.active_order_updates.add({
      pk: `active_order_update:${updateId}`,
      update_id: updateId,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      base_order_updated_at: now,
      event_type: "ITEM_CANCELLED",
      delta_json: "{}",
      actor_user_id: 1,
      device_id: "WEB_POS",
      event_at: now,
      created_at: now,
      sync_status: "PENDING",
      sync_error: null
    });
    await db.item_cancellations.add({
      pk: `item_cancellation:${cancellationId}`,
      cancellation_id: cancellationId,
      order_id: orderId,
      item_id: 10,
      company_id: 9,
      outlet_id: 90,
      cancelled_quantity: 1,
      reason: "Customer changed mind",
      cancelled_by_user_id: 1,
      cancelled_at: now,
      sync_status: "PENDING",
      sync_error: null
    });

    const job = {
      job_id: crypto.randomUUID(),
      sale_id: orderId,
      company_id: 9,
      outlet_id: 90,
      job_type: "SYNC_POS_ORDER_UPDATE",
      dedupe_key: updateId,
      payload_json: JSON.stringify({
        update_id: updateId,
        cancellation_id: cancellationId,
        order_id: orderId,
        company_id: 9,
        outlet_id: 90
      }),
      status: "PENDING",
      attempts: 0,
      lease_owner_id: null,
      lease_token: null,
      lease_expires_at: null,
      next_attempt_at: null,
      last_error: null,
      created_at: now,
      updated_at: now
    };

    let capturedRequest = null;

    await sendOutboxJobToSyncPush(
      {
        job,
        endpoint: "https://example.com/api/sync/push",
        fetch_impl: async (_url, init) => {
          capturedRequest = JSON.parse(init.body);
          return new Response(JSON.stringify({
            success: true,
            data: {
              results: [],
              order_update_results: [{ update_id: updateId, result: "OK" }],
              item_cancellation_results: [{ cancellation_id: cancellationId, result: "OK" }]
            }
          }), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }
      },
      db
    );

    assert.equal(capturedRequest.item_cancellations.length, 1);
    assert.equal(capturedRequest.item_cancellations[0].cancellation_id, cancellationId);
    assert.equal(capturedRequest.item_cancellations[0].update_id, updateId);
  } finally {
    db.close();
    await db.delete();
  }
});

test("outbox sender treats missing item cancellation ack as retryable error", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-sender-cancellation-ack-${crypto.randomUUID()}`);
  const now = nowIso();
  const orderId = crypto.randomUUID();
  const updateId = crypto.randomUUID();
  const cancellationId = crypto.randomUUID();

  try {
    await db.active_orders.add({
      pk: orderId,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      service_type: "TAKEAWAY",
      source_flow: "WALK_IN",
      settlement_flow: "IMMEDIATE",
      table_id: null,
      reservation_id: null,
      guest_count: null,
      is_finalized: true,
      order_status: "OPEN",
      order_state: "OPEN",
      paid_amount: 0,
      opened_at: now,
      closed_at: null,
      notes: null,
      updated_at: now
    });
    await db.active_order_updates.add({
      pk: `active_order_update:${updateId}`,
      update_id: updateId,
      order_id: orderId,
      company_id: 9,
      outlet_id: 90,
      base_order_updated_at: now,
      event_type: "ITEM_CANCELLED",
      delta_json: "{}",
      actor_user_id: null,
      device_id: "WEB_POS",
      event_at: now,
      created_at: now,
      sync_status: "PENDING",
      sync_error: null
    });
    await db.item_cancellations.add({
      pk: `item_cancellation:${cancellationId}`,
      cancellation_id: cancellationId,
      order_id: orderId,
      item_id: 10,
      company_id: 9,
      outlet_id: 90,
      cancelled_quantity: 1,
      reason: "Customer changed mind",
      cancelled_by_user_id: null,
      cancelled_at: now,
      sync_status: "PENDING",
      sync_error: null
    });

    const job = {
      job_id: crypto.randomUUID(),
      sale_id: orderId,
      company_id: 9,
      outlet_id: 90,
      job_type: "SYNC_POS_ORDER_UPDATE",
      dedupe_key: updateId,
      payload_json: JSON.stringify({
        update_id: updateId,
        cancellation_id: cancellationId,
        order_id: orderId,
        company_id: 9,
        outlet_id: 90
      }),
      status: "PENDING",
      attempts: 0,
      lease_owner_id: null,
      lease_token: null,
      lease_expires_at: null,
      next_attempt_at: null,
      last_error: null,
      created_at: now,
      updated_at: now
    };

    await assert.rejects(
      sendOutboxJobToSyncPush(
        {
          job,
          endpoint: "https://example.com/api/sync/push",
          fetch_impl: async () => {
            return new Response(JSON.stringify({
              success: true,
              data: {
                results: [],
                order_update_results: [{ update_id: updateId, result: "OK" }]
              }
            }), {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            });
          }
        },
        db
      ),
      /Missing item_cancellation_results/
    );
  } finally {
    db.close();
    await db.delete();
  }
});
