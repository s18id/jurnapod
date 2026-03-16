// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { type PosOfflineDb, posDb } from "@jurnapod/offline-db/dexie";
import type {
  CheckStockInput,
  CheckStockResult,
  InventoryStockRow,
  ProductCacheRow,
  StockReservationRow
} from "@jurnapod/offline-db/dexie";
import { InsufficientStockError, StockValidationError } from "@jurnapod/offline-db/dexie";

const RESERVATION_TTL_MINUTES = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function computeExpiration(): string {
  const expires = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
  return expires.toISOString();
}

function computeStockPk(companyId: number, outletId: number, itemId: number): string {
  return `${companyId}:${outletId}:${itemId}`;
}

export interface CheckStockAvailabilityInput {
  itemId: number;
  quantity: number;
  outletId?: number;
  companyId?: number;
}

export interface CheckStockAvailabilityResult {
  available: boolean;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  trackStock: boolean;
}

export interface ValidateStockForItemsInput {
  items: Array<{ itemId: number; quantity: number }>;
  companyId: number;
  outletId: number;
}

export interface ReserveStockInput {
  saleId: string;
  items: Array<{ itemId: number; quantity: number }>;
  companyId: number;
  outletId: number;
}

export interface ReleaseStockInput {
  saleId: string;
}

export interface UpdateStockFromSyncInput {
  companyId: number;
  outletId: number;
  itemId: number;
  quantityOnHand: number;
  quantityReserved?: number;
  lastUpdatedAt: string;
  dataVersion: number;
}

async function getProductWithStock(
  db: PosOfflineDb,
  companyId: number,
  outletId: number,
  itemId: number
): Promise<{ product: ProductCacheRow | null; stock: InventoryStockRow | null }> {
  const product = await db.products_cache
    .where("[company_id+outlet_id+item_id]")
    .equals([companyId, outletId, itemId])
    .first() ?? null;

  const stock = await db.inventory_stock
    .where("[company_id+outlet_id+item_id]")
    .equals([companyId, outletId, itemId])
    .first() ?? null;

  return { product, stock };
}

export async function checkStockAvailability(
  input: CheckStockAvailabilityInput,
  db: PosOfflineDb = posDb
): Promise<CheckStockAvailabilityResult> {
  const { itemId, quantity, outletId, companyId } = input;

  if (!companyId || !outletId) {
    const firstProduct = await db.products_cache.limit(1).first();
    if (!firstProduct) {
      return {
        available: true,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
        trackStock: false
      };
    }
    const resolvedCompanyId = companyId ?? firstProduct.company_id;
    const resolvedOutletId = outletId ?? firstProduct.outlet_id;
    
    const { product, stock } = await getProductWithStock(db, resolvedCompanyId, resolvedOutletId, itemId);
    
    if (!product || !product.track_stock) {
      return {
        available: true,
        quantityOnHand: stock?.quantity_on_hand ?? 0,
        quantityReserved: stock?.quantity_reserved ?? 0,
        quantityAvailable: stock?.quantity_available ?? 0,
        trackStock: false
      };
    }

    const quantityAvailable = stock?.quantity_available ?? 0;
    return {
      available: quantityAvailable >= quantity,
      quantityOnHand: stock?.quantity_on_hand ?? 0,
      quantityReserved: stock?.quantity_reserved ?? 0,
      quantityAvailable,
      trackStock: true
    };
  }

  const { product, stock } = await getProductWithStock(db, companyId, outletId, itemId);

  if (!product || !product.track_stock) {
    return {
      available: true,
      quantityOnHand: stock?.quantity_on_hand ?? 0,
      quantityReserved: stock?.quantity_reserved ?? 0,
      quantityAvailable: stock?.quantity_available ?? 0,
      trackStock: false
    };
  }

  const quantityAvailable = stock?.quantity_available ?? 0;
  return {
    available: quantityAvailable >= quantity,
    quantityOnHand: stock?.quantity_on_hand ?? 0,
    quantityReserved: stock?.quantity_reserved ?? 0,
    quantityAvailable,
    trackStock: true
  };
}

export async function validateStockForItems(
  input: ValidateStockForItemsInput,
  db: PosOfflineDb = posDb
): Promise<void> {
  const { items, companyId, outletId } = input;

  if (items.length === 0) {
    return;
  }

  const stockChecks = await Promise.all(
    items.map(async (item) => {
      const result = await checkStockAvailability(
        { itemId: item.itemId, quantity: item.quantity, companyId, outletId },
        db
      );
      return { itemId: item.itemId, quantity: item.quantity, result };
    })
  );

  const insufficientItems: Array<{ itemId: number; itemName: string; requestedQty: number; availableQty: number }> = [];

  for (const check of stockChecks) {
    if (check.result.trackStock && !check.result.available) {
      const product = await db.products_cache
        .where("[company_id+outlet_id+item_id]")
        .equals([companyId, outletId, check.itemId])
        .first();
      
      insufficientItems.push({
        itemId: check.itemId,
        itemName: product?.name ?? `Item #${check.itemId}`,
        requestedQty: check.quantity,
        availableQty: check.result.quantityAvailable
      });
    }
  }

  if (insufficientItems.length === 1) {
    const item = insufficientItems[0];
    throw new InsufficientStockError(item.itemId, item.itemName, item.requestedQty, item.availableQty);
  }

  if (insufficientItems.length > 1) {
    throw new StockValidationError(insufficientItems);
  }
}

export async function reserveStock(
  input: ReserveStockInput,
  db: PosOfflineDb = posDb
): Promise<void> {
  const { saleId, items, companyId, outletId } = input;

  if (items.length === 0) {
    return;
  }

  const expiresAt = computeExpiration();
  const timestamp = nowIso();

  await db.transaction("rw", [db.inventory_stock, db.stock_reservations], async () => {
    for (const item of items) {
      const product = await db.products_cache
        .where("[company_id+outlet_id+item_id]")
        .equals([companyId, outletId, item.itemId])
        .first();

      if (!product || !product.track_stock) {
        continue;
      }

      const stock = await db.inventory_stock
        .where("[company_id+outlet_id+item_id]")
        .equals([companyId, outletId, item.itemId])
        .first();

      if (stock) {
        const newReserved = stock.quantity_reserved + item.quantity;
        const newAvailable = Math.max(0, stock.quantity_on_hand - newReserved);
        
        await db.inventory_stock.update(stock.pk, {
          quantity_reserved: newReserved,
          quantity_available: newAvailable,
          last_updated_at: timestamp
        });
      }

      const reservation: StockReservationRow = {
        reservation_id: crypto.randomUUID(),
        sale_id: saleId,
        company_id: companyId,
        outlet_id: outletId,
        item_id: item.itemId,
        quantity: item.quantity,
        created_at: timestamp,
        expires_at: expiresAt
      };

      await db.stock_reservations.add(reservation);
    }
  });
}

export async function releaseStock(
  input: ReleaseStockInput,
  db: PosOfflineDb = posDb
): Promise<void> {
  const { saleId } = input;

  const reservations = await db.stock_reservations
    .where("sale_id")
    .equals(saleId)
    .toArray();

  if (reservations.length === 0) {
    return;
  }

  const timestamp = nowIso();

  await db.transaction("rw", [db.inventory_stock, db.stock_reservations], async () => {
    for (const reservation of reservations) {
      const stock = await db.inventory_stock
        .where("[company_id+outlet_id+item_id]")
        .equals([reservation.company_id, reservation.outlet_id, reservation.item_id])
        .first();

      if (stock) {
        const newReserved = Math.max(0, stock.quantity_reserved - reservation.quantity);
        const newAvailable = stock.quantity_on_hand - newReserved;
        
        await db.inventory_stock.update(stock.pk, {
          quantity_reserved: newReserved,
          quantity_available: newAvailable,
          last_updated_at: timestamp
        });
      }
    }

    await db.stock_reservations.where("sale_id").equals(saleId).delete();
  });
}

export async function releaseExpiredReservations(db: PosOfflineDb = posDb): Promise<number> {
  const now = nowIso();
  
  const expiredReservations = await db.stock_reservations
    .filter((r) => r.expires_at !== null && r.expires_at < now)
    .toArray();

  if (expiredReservations.length === 0) {
    return 0;
  }

  const timestamp = nowIso();
  let releasedCount = 0;

  await db.transaction("rw", [db.inventory_stock, db.stock_reservations], async () => {
    for (const reservation of expiredReservations) {
      const stock = await db.inventory_stock
        .where("[company_id+outlet_id+item_id]")
        .equals([reservation.company_id, reservation.outlet_id, reservation.item_id])
        .first();

      if (stock) {
        const newReserved = Math.max(0, stock.quantity_reserved - reservation.quantity);
        const newAvailable = stock.quantity_on_hand - newReserved;
        
        await db.inventory_stock.update(stock.pk, {
          quantity_reserved: newReserved,
          quantity_available: newAvailable,
          last_updated_at: timestamp
        });
      }

      await db.stock_reservations.delete(reservation.reservation_id);
      releasedCount++;
    }
  });

  return releasedCount;
}

export async function updateStockFromSync(
  input: UpdateStockFromSyncInput,
  db: PosOfflineDb = posDb
): Promise<void> {
  const { companyId, outletId, itemId, quantityOnHand, quantityReserved = 0, lastUpdatedAt, dataVersion } = input;

  const pk = computeStockPk(companyId, outletId, itemId);
  const timestamp = nowIso();

  await db.transaction("rw", db.inventory_stock, async () => {
    const existing = await db.inventory_stock.get(pk);

    const reservedQty = existing?.quantity_reserved ?? quantityReserved;
    const availableQty = Math.max(0, quantityOnHand - reservedQty);

    const stockRow: InventoryStockRow = {
      pk,
      company_id: companyId,
      outlet_id: outletId,
      item_id: itemId,
      quantity_on_hand: quantityOnHand,
      quantity_reserved: reservedQty,
      quantity_available: availableQty,
      last_updated_at: timestamp,
      data_version: dataVersion
    };

    if (existing) {
      if (dataVersion >= existing.data_version) {
        await db.inventory_stock.update(pk, stockRow);
      }
    } else {
      await db.inventory_stock.add(stockRow);
    }
  });
}

export async function batchUpdateStockFromSync(
  items: UpdateStockFromSyncInput[],
  db: PosOfflineDb = posDb
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  for (const item of items) {
    await updateStockFromSync(item, db);
  }
}

export async function getStockStatus(
  companyId: number,
  outletId: number,
  itemId: number,
  db: PosOfflineDb = posDb
): Promise<CheckStockResult | null> {
  const { product, stock } = await getProductWithStock(db, companyId, outletId, itemId);

  if (!product) {
    return null;
  }

  return {
    item_id: itemId,
    available: (stock?.quantity_available ?? 0) > 0,
    quantity_on_hand: stock?.quantity_on_hand ?? 0,
    quantity_reserved: stock?.quantity_reserved ?? 0,
    quantity_available: stock?.quantity_available ?? 0,
    track_stock: product.track_stock
  };
}
