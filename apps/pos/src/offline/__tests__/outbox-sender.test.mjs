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
