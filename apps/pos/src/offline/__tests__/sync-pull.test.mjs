// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "../../../dist/offline/db.js";
import { ingestSyncPullIntoProductsCache, readSyncPullConfig, readSyncPullDataVersion } from "../../../dist/offline/sync-pull.js";

function createSyncPayload({ dataVersion, outletId, price }) {
  const timestamp = new Date().toISOString();
  return {
    ok: true,
    data_version: dataVersion,
    items: [
      {
        id: 1001,
        sku: "AMERICANO",
        name: "Americano",
        type: "PRODUCT",
        is_active: true,
        updated_at: timestamp
      }
    ],
    prices: [
      {
        id: 8001,
        item_id: 1001,
        outlet_id: outletId,
        price,
        is_active: true,
        updated_at: timestamp
      }
    ],
    config: {
      tax: {
        rate: 0,
        inclusive: false
      },
      payment_methods: ["CASH", "QRIS"]
    }
  };
}

function fetchWithPayload(payload) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
}

test("sync pull upserts products cache rows", async () => {
  const db = createPosOfflineDb(`jp-pos-sync-pull-upsert-${crypto.randomUUID()}`);

  try {
    const result = await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 2, outletId: 10, price: 25000 }))
      },
      db
    );

    assert.equal(result.applied, true);
    assert.equal(result.data_version, 2);
    assert.equal(result.upserted_product_count, 1);

    const row = await db.products_cache.get("1:10:1001");
    assert.equal(row?.name, "Americano");
    assert.equal(row?.price_snapshot, 25000);
  } finally {
    db.close();
    await db.delete();
  }
});

test("sync pull replaces existing price snapshot on newer version", async () => {
  const db = createPosOfflineDb(`jp-pos-sync-pull-replace-${crypto.randomUUID()}`);

  try {
    await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 2, outletId: 10, price: 25000 }))
      },
      db
    );

    await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 3, outletId: 10, price: 27000 }))
      },
      db
    );

    const row = await db.products_cache.get("1:10:1001");
    assert.equal(row?.data_version, 3);
    assert.equal(row?.price_snapshot, 27000);
  } finally {
    db.close();
    await db.delete();
  }
});

test("sync pull persists per-outlet data version", async () => {
  const db = createPosOfflineDb(`jp-pos-sync-pull-version-${crypto.randomUUID()}`);

  try {
    await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 5, outletId: 10, price: 25000 }))
      },
      db
    );

    const version10 = await readSyncPullDataVersion({ company_id: 1, outlet_id: 10 }, db);
    const version11 = await readSyncPullDataVersion({ company_id: 1, outlet_id: 11 }, db);

    assert.equal(version10, 5);
    assert.equal(version11, 0);
  } finally {
    db.close();
    await db.delete();
  }
});

test("sync pull deactivates stale rows missing from newer payload", async () => {
  const db = createPosOfflineDb(`jp-pos-sync-pull-stale-${crypto.randomUUID()}`);

  try {
    const ts = new Date().toISOString();
    await db.products_cache.add({
      pk: "1:10:2002",
      company_id: 1,
      outlet_id: 10,
      item_id: 2002,
      sku: "OLD",
      name: "Old Menu",
      item_type: "PRODUCT",
      price_snapshot: 15000,
      is_active: true,
      item_updated_at: ts,
      price_updated_at: ts,
      data_version: 1,
      pulled_at: ts
    });

    await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 2, outletId: 10, price: 25000 }))
      },
      db
    );

    const staleRow = await db.products_cache.get("1:10:2002");
    const freshRow = await db.products_cache.get("1:10:1001");

    assert.equal(staleRow?.is_active, false);
    assert.equal(staleRow?.data_version, 2);
    assert.equal(freshRow?.is_active, true);
  } finally {
    db.close();
    await db.delete();
  }
});

test("equal or lower data_version replay does not regress cache", async () => {
  const db = createPosOfflineDb(`jp-pos-sync-pull-replay-${crypto.randomUUID()}`);

  try {
    await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 5, outletId: 10, price: 28000 }))
      },
      db
    );

    const replayResult = await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 5, outletId: 10, price: 22000 }))
      },
      db
    );

    assert.equal(replayResult.applied, false);
    assert.equal(replayResult.data_version, 5);

    const row = await db.products_cache.get("1:10:1001");
    assert.equal(row?.price_snapshot, 28000);
    assert.equal(row?.data_version, 5);
  } finally {
    db.close();
    await db.delete();
  }
});

test("sync pull persists and reads scoped config", async () => {
  const db = createPosOfflineDb(`jp-pos-sync-pull-config-${crypto.randomUUID()}`);

  try {
    await ingestSyncPullIntoProductsCache(
      {
        company_id: 1,
        outlet_id: 10,
        fetch_impl: fetchWithPayload(createSyncPayload({ dataVersion: 7, outletId: 10, price: 30000 }))
      },
      db
    );

    const config10 = await readSyncPullConfig({ company_id: 1, outlet_id: 10 }, db);
    const config11 = await readSyncPullConfig({ company_id: 1, outlet_id: 11 }, db);

    assert.equal(config10?.data_version, 7);
    assert.deepEqual(config10?.payment_methods, ["CASH", "QRIS"]);
    assert.equal(config10?.tax.rate, 0);
    assert.equal(config10?.tax.inclusive, false);
    assert.equal(config11, null);
  } finally {
    db.close();
    await db.delete();
  }
});
