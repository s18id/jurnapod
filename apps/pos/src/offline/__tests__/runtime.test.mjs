// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "../../../dist/offline/db.js";
import {
  isRuntimePaymentMethodAllowed,
  readRuntimeOnlineState,
  readRuntimeGlobalDueOutboxCount,
  readRuntimeOfflineSnapshot,
  resolveRuntimeCheckoutConfig,
  resolveRuntimeSyncBadgeState,
  resolveRuntimePaymentMethod
} from "../../../dist/offline/runtime.js";

function iso(ms) {
  return new Date(ms).toISOString();
}

function buildCompletedSale(saleId, clientTxId, timestamp, scope) {
  return {
    sale_id: saleId,
    client_tx_id: clientTxId,
    company_id: scope.company_id,
    outlet_id: scope.outlet_id,
    cashier_user_id: 700,
    status: "COMPLETED",
    sync_status: "PENDING",
    trx_at: timestamp,
    subtotal: 25000,
    discount_total: 0,
    tax_total: 0,
    grand_total: 25000,
    paid_total: 25000,
    change_total: 0,
    data_version: null,
    created_at: timestamp,
    completed_at: timestamp
  };
}

test("global due outbox count includes due jobs across scopes only", async () => {
  const db = createPosOfflineDb(`jp-pos-runtime-global-due-${crypto.randomUUID()}`);
  const now = Date.now();

  try {
    await db.outbox_jobs.bulkAdd([
      {
        job_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: 1,
        outlet_id: 10,
        job_type: "SYNC_POS_TX",
        dedupe_key: crypto.randomUUID(),
        payload_json: "{}",
        status: "PENDING",
        attempts: 0,
        next_attempt_at: null,
        last_error: null,
        created_at: iso(now),
        updated_at: iso(now)
      },
      {
        job_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: 1,
        outlet_id: 11,
        job_type: "SYNC_POS_TX",
        dedupe_key: crypto.randomUUID(),
        payload_json: "{}",
        status: "FAILED",
        attempts: 1,
        next_attempt_at: iso(now - 1_000),
        last_error: "X",
        created_at: iso(now),
        updated_at: iso(now)
      },
      {
        job_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: 1,
        outlet_id: 12,
        job_type: "SYNC_POS_TX",
        dedupe_key: crypto.randomUUID(),
        payload_json: "{}",
        status: "FAILED",
        attempts: 1,
        next_attempt_at: iso(now + 60_000),
        last_error: "Y",
        created_at: iso(now),
        updated_at: iso(now)
      }
    ]);

    const count = await readRuntimeGlobalDueOutboxCount(db);
    assert.equal(count, 2);
  } finally {
    db.close();
    await db.delete();
  }
});

test("runtime checkout config falls back to CASH and zero tax when scoped config missing", () => {
  const config = resolveRuntimeCheckoutConfig(null);

  assert.deepEqual(config.payment_methods, ["CASH"]);
  assert.equal(config.tax.rate, 0);
  assert.equal(config.tax.inclusive, false);
});

test("runtime payment method enforcement uses scoped methods and fallback", () => {
  const config = resolveRuntimeCheckoutConfig({
    tax: {
      rate: 11,
      inclusive: true
    },
    payment_methods: ["QRIS", "CARD"]
  });

  assert.deepEqual(config.payment_methods, ["QRIS", "CARD"]);
  assert.equal(isRuntimePaymentMethodAllowed("QRIS", config.payment_methods), true);
  assert.equal(isRuntimePaymentMethodAllowed("CASH", config.payment_methods), false);
  assert.equal(resolveRuntimePaymentMethod("CASH", config.payment_methods), "QRIS");
});

test("runtime online state returns false when navigator is offline", async () => {
  let healthcheckCalled = false;

  const online = await readRuntimeOnlineState({
    navigator_online: false,
    fetch_impl: async () => {
      healthcheckCalled = true;
      return new Response(null, { status: 200 });
    }
  });

  assert.equal(online, false);
  assert.equal(healthcheckCalled, false);
});

test("runtime online state returns false when healthcheck fails", async () => {
  const online = await readRuntimeOnlineState({
    navigator_online: true,
    fetch_impl: async () => {
      throw new Error("offline");
    }
  });

  assert.equal(online, false);
});

test("runtime online state returns true when healthcheck is OK", async () => {
  const online = await readRuntimeOnlineState({
    navigator_online: true,
    fetch_impl: async () => new Response(null, { status: 200 })
  });

  assert.equal(online, true);
});

test("offline snapshot persists after reopen with completed and pending sync state", async () => {
  const dbName = `jp-pos-runtime-offline-snapshot-${crypto.randomUUID()}`;
  const db = createPosOfflineDb(dbName);
  let reopenedDb;

  const now = Date.parse("2026-02-21T17:00:00.000Z");
  const scope = { company_id: 5, outlet_id: 55 };

  try {
    await db.products_cache.add({
      pk: `${scope.company_id}:${scope.outlet_id}:5001`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      item_id: 5001,
      sku: "SKU-5001",
      name: "Cold Brew",
      item_type: "INVENTORY",
      price_snapshot: 25000,
      is_active: true,
      item_updated_at: iso(now),
      price_updated_at: iso(now),
      data_version: 12,
      pulled_at: iso(now)
    });

    const saleA = crypto.randomUUID();
    const saleB = crypto.randomUUID();
    await db.sales.bulkAdd([
      buildCompletedSale(saleA, crypto.randomUUID(), iso(now), scope),
      buildCompletedSale(saleB, crypto.randomUUID(), iso(now), scope)
    ]);

    await db.outbox_jobs.bulkAdd([
      {
        job_id: crypto.randomUUID(),
        sale_id: saleA,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        job_type: "SYNC_POS_TX",
        dedupe_key: crypto.randomUUID(),
        payload_json: "{}",
        status: "PENDING",
        attempts: 0,
        next_attempt_at: null,
        last_error: null,
        created_at: iso(now),
        updated_at: iso(now)
      },
      {
        job_id: crypto.randomUUID(),
        sale_id: saleB,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        job_type: "SYNC_POS_TX",
        dedupe_key: crypto.randomUUID(),
        payload_json: "{}",
        status: "FAILED",
        attempts: 2,
        next_attempt_at: iso(now + 60_000),
        last_error: "NETWORK_TIMEOUT",
        created_at: iso(now),
        updated_at: iso(now)
      },
      {
        job_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        job_type: "SYNC_POS_TX",
        dedupe_key: crypto.randomUUID(),
        payload_json: "{}",
        status: "SENT",
        attempts: 1,
        next_attempt_at: null,
        last_error: null,
        created_at: iso(now),
        updated_at: iso(now)
      }
    ]);

    db.close();

    reopenedDb = createPosOfflineDb(dbName);
    const snapshot = await readRuntimeOfflineSnapshot(scope, reopenedDb);
    const completedCount = await reopenedDb.sales
      .where("[company_id+outlet_id+status]")
      .equals([scope.company_id, scope.outlet_id, "COMPLETED"])
      .count();

    assert.equal(completedCount, 2);
    assert.equal(snapshot.pending_outbox_count, 2);
    assert.equal(snapshot.has_product_cache, true);
    assert.equal(resolveRuntimeSyncBadgeState(false, snapshot.pending_outbox_count), "Offline");
    assert.equal(resolveRuntimeSyncBadgeState(true, snapshot.pending_outbox_count), "Pending");
    assert.equal(resolveRuntimeSyncBadgeState(true, 0), "Synced");
  } finally {
    if (reopenedDb) {
      reopenedDb.close();
      await reopenedDb.delete();
    } else {
      db.close();
      await db.delete();
    }
  }
});
