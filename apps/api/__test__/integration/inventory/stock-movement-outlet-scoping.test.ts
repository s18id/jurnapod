import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  resetFixtureRegistry,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  createTestPrice,
  createTestStock,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";
import {
  getStockLevels,
  reserveStock,
  deductStockWithCost,
  transferStock,
  InsufficientStockError,
} from "@/lib/stock";
import { itemPriceService } from "@jurnapod/modules-inventory";

describe("inventory.stock-movement-outlet-scoping", { timeout: 60000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;

  beforeAll(async () => {
    await acquireReadLock();
    seedCtx = await loadSeedSyncContext();
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
    } finally {
      try {
        await closeTestDb();
      } finally {
        await releaseReadLock();
      }
    }
  });

  it("AC1+AC2: stock movement/query must be scoped by company_id and outlet_id", async () => {
    const ctx = await getSeedSyncContext();
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-SCOPE"),
      name: "S58.2 Scoping Item",
      type: "PRODUCT",
      trackStock: true,
    });

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { price: 10000, isActive: true });
    await createTestStock(ctx.companyId, item.id, ctx.outletId, 10, ctx.cashierUserId);

    const secondOutlet = await sql<{ id: number }>`
      SELECT id FROM outlets
      WHERE company_id = ${ctx.companyId} AND id <> ${ctx.outletId}
      ORDER BY id ASC
      LIMIT 1
    `.execute(getTestDb());
    const outletB = Number(secondOutlet.rows[0].id);
    await createTestStock(ctx.companyId, item.id, outletB, 3, ctx.cashierUserId);

    const outletALevels = await getStockLevels(ctx.companyId, ctx.outletId, [item.id]);
    const outletBLevels = await getStockLevels(ctx.companyId, outletB, [item.id]);

    expect(outletALevels).toHaveLength(1);
    expect(outletBLevels).toHaveLength(1);
    expect(outletALevels[0].outlet_id).toBe(ctx.outletId);
    expect(outletBLevels[0].outlet_id).toBe(outletB);
    expect(outletALevels[0].quantity).toBe(10);
    expect(outletBLevels[0].quantity).toBe(3);
  });

  it("AC3: transfer outlet A -> B must be atomic in one transaction", async () => {
    const ctx = await getSeedSyncContext();
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-XFER"),
      name: "S58.2 Transfer Item",
      type: "PRODUCT",
      trackStock: true,
    });

    const secondOutlet = await sql<{ id: number }>`
      SELECT id FROM outlets
      WHERE company_id = ${ctx.companyId} AND id <> ${ctx.outletId}
      ORDER BY id ASC
      LIMIT 1
    `.execute(getTestDb());
    const outletB = Number(secondOutlet.rows[0].id);

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { price: 12000, isActive: true });
    await createTestStock(ctx.companyId, item.id, ctx.outletId, 8, ctx.cashierUserId);

    const ok = await transferStock(
      ctx.companyId,
      ctx.outletId,
      outletB,
      [{ product_id: item.id, quantity: 5 }],
      makeTag("S582-TX"),
      ctx.cashierUserId
    );

    expect(ok).toBe(true);

    const fromLevels = await getStockLevels(ctx.companyId, ctx.outletId, [item.id]);
    const toLevels = await getStockLevels(ctx.companyId, outletB, [item.id]);

    expect(fromLevels[0].quantity).toBe(3);
    expect(toLevels[0].quantity).toBe(5);
  });

  it("AC3 edge: transfer must reject when reserved stock leaves insufficient available quantity", async () => {
    const ctx = await getSeedSyncContext();
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-XFER-RES"),
      name: "S58.2 Transfer Reserved Guard",
      type: "PRODUCT",
      trackStock: true,
    });

    const secondOutlet = await sql<{ id: number }>`
      SELECT id FROM outlets
      WHERE company_id = ${ctx.companyId} AND id <> ${ctx.outletId}
      ORDER BY id ASC
      LIMIT 1
    `.execute(getTestDb());
    const outletB = Number(secondOutlet.rows[0].id);

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { price: 12000, isActive: true });
    await createTestStock(ctx.companyId, item.id, ctx.outletId, 10, ctx.cashierUserId);

    const reserveResult = await reserveStock(
      ctx.companyId,
      ctx.outletId,
      [{ product_id: item.id, quantity: 8 }],
      makeTag("S582-XFER-RESERVE")
    );
    expect(reserveResult.success).toBe(true);

    await expect(
      transferStock(
        ctx.companyId,
        ctx.outletId,
        outletB,
        [{ product_id: item.id, quantity: 5 }],
        makeTag("S582-XFER-RES-TX"),
        ctx.cashierUserId
      )
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("AC4: outlet-specific pricing resolves by outlet then falls back to company-level", async () => {
    const ctx = await getSeedSyncContext();
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-PRICE"),
      name: "S58.2 Pricing Item",
      type: "PRODUCT",
      trackStock: true,
    });

    const secondOutlet = await sql<{ id: number }>`
      SELECT id FROM outlets
      WHERE company_id = ${ctx.companyId} AND id <> ${ctx.outletId}
      ORDER BY id ASC
      LIMIT 1
    `.execute(getTestDb());
    const outletB = Number(secondOutlet.rows[0].id);

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { outletId: null, price: 9000, isActive: true });
    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { outletId: ctx.outletId, price: 15000, isActive: true });

    const outletAEffective = await itemPriceService.listEffectiveItemPricesForOutlet(ctx.companyId, ctx.outletId, { isActive: true });
    const outletBEffective = await itemPriceService.listEffectiveItemPricesForOutlet(ctx.companyId, outletB, { isActive: true });

    const aPrice = outletAEffective.find((p) => p.item_id === item.id);
    const bPrice = outletBEffective.find((p) => p.item_id === item.id);

    expect(aPrice).toBeDefined();
    expect(bPrice).toBeDefined();
    expect(Number(aPrice?.price)).toBe(15000);
    expect(aPrice?.is_override).toBe(true);
    expect(Number(bPrice?.price)).toBe(9000);
    expect(bPrice?.is_override).toBe(false);
  });

  it("AC5: negative stock movement rejects with INSUFFICIENT_STOCK and shortfall", async () => {
    const ctx = await getSeedSyncContext();
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-NEG"),
      name: "S58.2 Negative Item",
      type: "PRODUCT",
      trackStock: true,
    });

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { price: 11000, isActive: true });
    await createTestStock(ctx.companyId, item.id, ctx.outletId, 2, ctx.cashierUserId);

    const failingCall = deductStockWithCost(
      ctx.companyId,
      ctx.outletId,
      [{ product_id: item.id, quantity: 5 }],
      makeTag("S582-NEG-TX"),
      ctx.cashierUserId
    );

    await expect(failingCall).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(failingCall).rejects.toThrow(/shortfall 3/);
  });

  it("AC5 edge: deduction checks available_quantity when stock is reserved", async () => {
    const ctx = await getSeedSyncContext();
    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-RES"),
      name: "S58.2 Reserved Stock Guard",
      type: "PRODUCT",
      trackStock: true,
    });

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, { price: 10000, isActive: true });
    await createTestStock(ctx.companyId, item.id, ctx.outletId, 10, ctx.cashierUserId);

    const reserveResult = await reserveStock(
      ctx.companyId,
      ctx.outletId,
      [{ product_id: item.id, quantity: 8 }],
      makeTag("S582-RESERVE")
    );
    expect(reserveResult.success).toBe(true);

    const stockRow = await sql<{ quantity: string; reserved_quantity: string; available_quantity: string }>`
      SELECT quantity, reserved_quantity, available_quantity
      FROM inventory_stock
      WHERE company_id = ${ctx.companyId}
        AND outlet_id = ${ctx.outletId}
        AND product_id = ${item.id}
      LIMIT 1
    `.execute(getTestDb());

    expect(Number(stockRow.rows[0].quantity)).toBe(10);
    expect(Number(stockRow.rows[0].reserved_quantity)).toBe(8);
    expect(Number(stockRow.rows[0].available_quantity)).toBe(2);

    await expect(
      deductStockWithCost(
        ctx.companyId,
        ctx.outletId,
        [{ product_id: item.id, quantity: 5 }],
        makeTag("S582-RES-NEG"),
        ctx.cashierUserId
      )
    ).rejects.toThrow(/shortfall 3|available quantity/);
  });

  it("AC6: multi-item tx with one insufficient line rejects whole tx atomically", async () => {
    const ctx = await getSeedSyncContext();
    const itemA = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-MA"),
      name: "S58.2 Multi A",
      type: "PRODUCT",
      trackStock: true,
    });
    const itemB = await createTestItem(ctx.companyId, {
      sku: makeTag("S582-MB"),
      name: "S58.2 Multi B",
      type: "PRODUCT",
      trackStock: true,
    });

    await createTestPrice(ctx.companyId, itemA.id, ctx.cashierUserId, { price: 10000, isActive: true });
    await createTestPrice(ctx.companyId, itemB.id, ctx.cashierUserId, { price: 10000, isActive: true });
    await createTestStock(ctx.companyId, itemA.id, ctx.outletId, 10, ctx.cashierUserId);
    await createTestStock(ctx.companyId, itemB.id, ctx.outletId, 1, ctx.cashierUserId);

    const referenceId = makeTag("S582-MULTI");

    await expect(
      deductStockWithCost(
        ctx.companyId,
        ctx.outletId,
        [
          { product_id: itemA.id, quantity: 4 },
          { product_id: itemB.id, quantity: 3 },
        ],
        referenceId,
        ctx.cashierUserId
      )
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const levelsA = await getStockLevels(ctx.companyId, ctx.outletId, [itemA.id]);
    const levelsB = await getStockLevels(ctx.companyId, ctx.outletId, [itemB.id]);
    expect(levelsA[0].quantity).toBe(10);
    expect(levelsB[0].quantity).toBe(1);

    const txCountRows = await sql<{ total: string }>`
      SELECT COUNT(*) as total
      FROM inventory_transactions
      WHERE company_id = ${ctx.companyId}
        AND reference_id = ${referenceId}
    `.execute(getTestDb());
    expect(Number(txCountRows.rows[0].total)).toBe(0);
  });
});
