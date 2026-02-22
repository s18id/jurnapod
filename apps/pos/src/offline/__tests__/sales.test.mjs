import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "../../../dist/offline/db.js";
import { completeSale, createSaleDraft } from "../../../dist/offline/sales.js";

function nowIso() {
  return new Date().toISOString();
}

function createProductSnapshot(companyId, outletId, itemId) {
  const timestamp = nowIso();
  return {
    pk: `${companyId}:${outletId}:${itemId}`,
    company_id: companyId,
    outlet_id: outletId,
    item_id: itemId,
    sku: "SKU-001",
    name: "Manual Brew",
    item_type: "SERVICE",
    price_snapshot: 50000,
    is_active: true,
    item_updated_at: timestamp,
    price_updated_at: timestamp,
    data_version: 1,
    pulled_at: timestamp
  };
}

test("double complete same sale yields one success and one deterministic failure", async () => {
  const db = createPosOfflineDb(`jp-pos-sales-test-${crypto.randomUUID()}`);

  try {
    const draft = await createSaleDraft(
      {
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 55
      },
      db
    );

    await db.products_cache.add(createProductSnapshot(1, 10, 101));

    const completionInput = {
      sale_id: draft.sale_id,
      items: [{ item_id: 101, qty: 1 }],
      payments: [{ method: "CASH", amount: 50000 }],
      totals: {
        subtotal: 50000,
        discount_total: 0,
        tax_total: 0,
        grand_total: 50000,
        paid_total: 50000,
        change_total: 0
      }
    };

    const [first, second] = await Promise.allSettled([
      completeSale(completionInput, db),
      completeSale(completionInput, db)
    ]);

    const successCount = [first, second].filter((result) => result.status === "fulfilled").length;
    const failed = [first, second].find((result) => result.status === "rejected");

    assert.equal(successCount, 1);
    assert.ok(failed);
    assert.equal(failed.reason?.name, "SaleCompletionInProgressError");

    const persistedSale = await db.sales.get(draft.sale_id);
    assert.equal(persistedSale?.status, "COMPLETED");

    const outboxCount = await db.outbox_jobs.count();
    assert.equal(outboxCount, 1);
  } finally {
    db.close();
    await db.delete();
  }
});

test("completeSale rejects mismatched caller totals and keeps draft unchanged", async () => {
  const db = createPosOfflineDb(`jp-pos-sales-test-${crypto.randomUUID()}`);

  try {
    const draft = await createSaleDraft(
      {
        company_id: 1,
        outlet_id: 10,
        cashier_user_id: 55
      },
      db
    );

    await db.products_cache.add(createProductSnapshot(1, 10, 101));

    await assert.rejects(
      completeSale(
        {
          sale_id: draft.sale_id,
          items: [{ item_id: 101, qty: 1 }],
          payments: [{ method: "CASH", amount: 50000 }],
          totals: {
            subtotal: 40000,
            discount_total: 0,
            tax_total: 0,
            grand_total: 50000,
            paid_total: 50000,
            change_total: 0
          }
        },
        db
      ),
      (error) => error?.name === "SaleTotalsMismatchError"
    );

    const sale = await db.sales.get(draft.sale_id);
    assert.equal(sale?.status, "DRAFT");
    assert.equal(await db.sale_items.count(), 0);
    assert.equal(await db.payments.count(), 0);
    assert.equal(await db.outbox_jobs.count(), 0);
  } finally {
    db.close();
    await db.delete();
  }
});

test("completed sale and outbox job persist after database reopen", async () => {
  const dbName = `jp-pos-sales-test-${crypto.randomUUID()}`;
  const db = createPosOfflineDb(dbName);
  let reopenedDb;

  try {
    const draft = await createSaleDraft(
      {
        company_id: 4,
        outlet_id: 40,
        cashier_user_id: 88
      },
      db
    );

    await db.products_cache.add(createProductSnapshot(4, 40, 401));

    const completed = await completeSale(
      {
        sale_id: draft.sale_id,
        items: [{ item_id: 401, qty: 1 }],
        payments: [{ method: "CASH", amount: 50000 }],
        totals: {
          subtotal: 50000,
          discount_total: 0,
          tax_total: 0,
          grand_total: 50000,
          paid_total: 50000,
          change_total: 0
        }
      },
      db
    );

    db.close();

    reopenedDb = createPosOfflineDb(dbName);

    const persistedSale = await reopenedDb.sales.get(draft.sale_id);
    assert.equal(persistedSale?.status, "COMPLETED");
    assert.equal(persistedSale?.client_tx_id, completed.client_tx_id);

    const persistedItemCount = await reopenedDb.sale_items.where("sale_id").equals(draft.sale_id).count();
    assert.equal(persistedItemCount, 1);

    const persistedOutboxJob = await reopenedDb.outbox_jobs.get(completed.outbox_job_id);
    assert.equal(persistedOutboxJob?.status, "PENDING");
    assert.equal(persistedOutboxJob?.dedupe_key, completed.client_tx_id);
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

test("sale item snapshots stay immutable after product cache update", async () => {
  const db = createPosOfflineDb(`jp-pos-sales-test-${crypto.randomUUID()}`);

  try {
    const draft = await createSaleDraft(
      {
        company_id: 5,
        outlet_id: 50,
        cashier_user_id: 99
      },
      db
    );

    const originalSnapshot = createProductSnapshot(5, 50, 501);
    await db.products_cache.add(originalSnapshot);

    await completeSale(
      {
        sale_id: draft.sale_id,
        items: [{ item_id: 501, qty: 1 }],
        payments: [{ method: "CASH", amount: 50000 }],
        totals: {
          subtotal: 50000,
          discount_total: 0,
          tax_total: 0,
          grand_total: 50000,
          paid_total: 50000,
          change_total: 0
        }
      },
      db
    );

    await db.products_cache.put({
      ...originalSnapshot,
      name: "Manual Brew Updated",
      price_snapshot: 65000,
      data_version: 2,
      pulled_at: nowIso(),
      price_updated_at: nowIso()
    });

    const saleLines = await db.sale_items.where("sale_id").equals(draft.sale_id).toArray();
    assert.equal(saleLines.length, 1);
    assert.equal(saleLines[0]?.name_snapshot, "Manual Brew");
    assert.equal(saleLines[0]?.unit_price_snapshot, 50000);
    assert.equal(saleLines[0]?.line_total, 50000);
  } finally {
    db.close();
    await db.delete();
  }
});
