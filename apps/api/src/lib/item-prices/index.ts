// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { toUtcIso } from "@/lib/date-helpers";
import { getDb, type KyselySchema } from "../db.js";
import {
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "../master-data-errors.js";
import {
  recordMasterDataAuditLog
} from "../shared/master-data-utils.js";
import { withTransactionRetry } from "@jurnapod/db";
import { ensureUserHasOutletAccess } from "../shared/common-utils.js";

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

const itemPriceAuditActions = {
  create: "MASTER_DATA_ITEM_PRICE_CREATE",
  update: "MASTER_DATA_ITEM_PRICE_UPDATE",
  delete: "MASTER_DATA_ITEM_PRICE_DELETE"
} as const;

async function recordItemPriceAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    outletId: number | null;
    actor: MutationAuditActor | undefined;
    action: (typeof itemPriceAuditActions)[keyof typeof itemPriceAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await recordMasterDataAuditLog(db, {
    companyId: input.companyId,
    outletId: input.outletId,
    actor: input.actor,
    action: input.action,
    payload: input.payload
  });
}

function normalizeItemPrice(row: {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  variant_id: number | null;
  price: string | number;
  is_active: number;
  updated_at: string | Date;
  item_group_id?: number | null;
  item_group_name?: string | null;
}) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    item_id: Number(row.item_id),
    variant_id: row.variant_id == null ? null : Number(row.variant_id),
    price: Number(row.price),
    is_active: row.is_active === 1,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    item_group_name: row.item_group_name ?? null,
    updated_at: toUtcIso.dateLike(row.updated_at) as string
  };
}

async function ensureCompanyItemExists(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<void> {
  const row = await db
    .selectFrom("items")
    .where("id", "=", itemId)
    .where("company_id", "=", companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!row) {
    throw new DatabaseReferenceError("Item not found for company");
  }
}

async function ensureCompanyOutletExists(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<void> {
  const row = await db
    .selectFrom("outlets")
    .where("id", "=", outletId)
    .where("company_id", "=", companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!row) {
    throw new DatabaseReferenceError("Outlet not found for company");
  }
}

async function findItemPriceByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  itemPriceId: number,
  options?: { forUpdate?: boolean }
) {
  let query = db
    .selectFrom("item_prices")
    .where("company_id", "=", companyId)
    .where("id", "=", itemPriceId)
    .select(["id", "company_id", "outlet_id", "item_id", "variant_id", "price", "is_active", "updated_at"]);

  if (options?.forUpdate) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return null;
  }

  return normalizeItemPrice(row);
}

export async function listItemPrices(
  companyId: number,
  filters?: { outletId?: number; outletIds?: readonly number[]; isActive?: boolean; includeDefaults?: boolean; variantId?: number | null; itemId?: number }
) {
  const db = getDb();

  let query = db
    .selectFrom("item_prices as ip")
    .innerJoin("items as i", "i.id", "ip.item_id")
    .leftJoin("item_groups as ig", "ig.id", "i.item_group_id")
    .where("ip.company_id", "=", companyId)
    .where("i.company_id", "=", companyId)
    .select([
      "ip.id",
      "ip.company_id",
      "ip.outlet_id",
      "ip.item_id",
      "ip.variant_id",
      "ip.price",
      "ip.is_active",
      "ip.updated_at",
      "i.item_group_id",
      "ig.name as item_group_name"
    ]);

  if (typeof filters?.outletId === "number") {
    if (filters.includeDefaults !== false) {
      query = query.where((eb) => eb.or([
        eb("ip.outlet_id", "=", filters.outletId!),
        eb("ip.outlet_id", "is", null)
      ]));
    } else {
      query = query.where("ip.outlet_id", "=", filters.outletId);
    }
  } else if (Array.isArray(filters?.outletIds)) {
    if (filters.outletIds.length === 0) {
      return [];
    }

    if (filters.includeDefaults !== false) {
      query = query.where((eb) => eb.or([
        eb("ip.outlet_id", "in", filters.outletIds as number[]),
        eb("ip.outlet_id", "is", null)
      ]));
    } else {
      query = query.where("ip.outlet_id", "in", filters.outletIds as number[]);
    }
  }

  if (typeof filters?.isActive === "boolean") {
    query = query.where("ip.is_active", "=", filters.isActive ? 1 : 0);
  }

  // Filter by item_id
  if (typeof filters?.itemId === "number") {
    query = query.where("ip.item_id", "=", filters.itemId);
  }

  // Filter by variant_id
  if (filters?.variantId !== undefined) {
    if (filters.variantId === null) {
      query = query.where("ip.variant_id", "is", null);
    } else {
      query = query.where("ip.variant_id", "=", filters.variantId);
    }
  }

  const rows = await query.orderBy("ip.outlet_id", "asc").orderBy("ip.id", "asc").execute();
  return rows.map(normalizeItemPrice);
}

export async function listEffectiveItemPricesForOutlet(
  companyId: number,
  outletId: number,
  filters?: { isActive?: boolean }
) {
  const db = getDb();

  type ItemPriceRow = {
    id: number;
    company_id: number;
    outlet_id: number | null;
    item_id: number;
    variant_id: number | null;
    price: number | string;
    is_active: number;
    updated_at: Date | string;
    item_group_id: number | null;
    item_group_name: string | null;
    is_override: number;
  };

  let query = db
    .selectFrom("items as i")
    .leftJoin("item_prices as override", (join) =>
      join
        .onRef("override.item_id", "=", "i.id")
        .onRef("override.company_id", "=", "i.company_id")
        .on("override.outlet_id", "=", outletId)
    )
    .leftJoin("item_prices as def", (join) =>
      join
        .onRef("def.item_id", "=", "i.id")
        .onRef("def.company_id", "=", "i.company_id")
        .on("def.outlet_id", "is", null)
    )
    .leftJoin("item_groups as ig", (join) =>
      join
        .onRef("ig.id", "=", "i.item_group_id")
        .onRef("ig.company_id", "=", "i.company_id")
    )
    .where("i.company_id", "=", companyId)
    .where((eb) =>
      eb.or([
        eb("override.id", "is not", null),
        eb("def.id", "is not", null)
      ])
    )
    .select([
      sql<number>`COALESCE(override.id, def.id)`.as("id"),
      sql<number>`COALESCE(override.company_id, def.company_id)`.as("company_id"),
      sql<number>`COALESCE(override.outlet_id, ${outletId})`.as("outlet_id"),
      sql<number>`COALESCE(override.item_id, def.item_id)`.as("item_id"),
      sql<number | null>`COALESCE(override.variant_id, def.variant_id)`.as("variant_id"),
      sql<string | number>`COALESCE(override.price, def.price)`.as("price"),
      sql<number>`COALESCE(override.is_active, def.is_active)`.as("is_active"),
      sql<Date | string>`COALESCE(override.updated_at, def.updated_at)`.as("updated_at"),
      "i.item_group_id",
      sql<string | null>`ig.name`.as("item_group_name"),
      sql<number>`CASE WHEN override.id IS NOT NULL THEN 1 ELSE 0 END`.as("is_override")
    ]);

  if (typeof filters?.isActive === "boolean") {
    const activeValue = filters.isActive ? 1 : 0;
    query = query
      .where(sql`COALESCE(override.is_active, def.is_active)`, "=", activeValue)
      .where("i.is_active", "=", activeValue);
  }

  const rows = await query.orderBy("i.id", "asc").execute();

  return (rows as ItemPriceRow[]).map((row) => {
    const normalized = normalizeItemPrice(row);
    return {
      ...normalized,
      outlet_id: normalized.outlet_id ?? outletId,
      is_override: row.is_override === 1
    };
  });
}

export async function findItemPriceById(companyId: number, itemPriceId: number) {
  const db = getDb();
  return findItemPriceByIdWithExecutor(db, companyId, itemPriceId);
}

export async function updateItemPrice(
  companyId: number,
  itemPriceId: number,
  input: {
    item_id?: number;
    outlet_id?: number | null;
    variant_id?: number | null;
    price?: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const db = getDb();
  const fields: Array<{ field: string; value: unknown }> = [];

  if (typeof input.price === "number") {
    fields.push({ field: "price", value: input.price });
  }

  if (typeof input.is_active === "boolean") {
    fields.push({ field: "is_active", value: input.is_active ? 1 : 0 });
  }

  // Retry on deadlock since parallel test fixtures can contend on item_prices table
  return withTransactionRetry(db, async (trx) => {
    const before = await findItemPriceByIdWithExecutor(trx, companyId, itemPriceId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (actor && before.outlet_id !== null) {
      await ensureUserHasOutletAccess(actor.userId, companyId, before.outlet_id);
    }

    if (actor && before.outlet_id === null && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    if (typeof input.item_id === "number") {
      await ensureCompanyItemExists(trx, companyId, input.item_id);
      fields.push({ field: "item_id", value: input.item_id });
    }

    if (Object.hasOwn(input, "outlet_id")) {
      if (input.outlet_id === null) {
        if (actor && actor.canManageCompanyDefaults !== true) {
          throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
        }
        fields.push({ field: "outlet_id", value: null });
      } else if (typeof input.outlet_id === "number") {
        if (actor) {
          await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
        }
        await ensureCompanyOutletExists(trx, companyId, input.outlet_id);
        fields.push({ field: "outlet_id", value: input.outlet_id });
      }
    }

    if (Object.hasOwn(input, "variant_id")) {
      if (input.variant_id === null) {
        fields.push({ field: "variant_id", value: null });
      } else if (typeof input.variant_id === "number") {
        // Validate variant belongs to the item
        const itemId = input.item_id ?? before.item_id;
        const variantRow = await trx
          .selectFrom("item_variants")
          .where("id", "=", input.variant_id)
          .where("item_id", "=", itemId)
          .where("company_id", "=", companyId)
          .select(["id"])
          .executeTakeFirst();
        if (!variantRow) {
          throw new DatabaseReferenceError("Variant not found for item");
        }
        fields.push({ field: "variant_id", value: input.variant_id });
      }
    }

    if (fields.length === 0) {
      return before;
    }

    // Build and execute update query
    const updateData: Record<string, unknown> = {};
    for (const { field, value } of fields) {
      updateData[field] = value;
    }
    updateData.updated_at = new Date();

    await trx
      .updateTable("item_prices")
      .set(updateData)
      .where("company_id", "=", companyId)
      .where("id", "=", itemPriceId)
      .execute();

    const itemPrice = await findItemPriceByIdWithExecutor(trx, companyId, itemPriceId);
    if (!itemPrice) {
      return null;
    }

    await recordItemPriceAuditLog(trx, {
      companyId,
      outletId: itemPrice.outlet_id,
      actor,
      action: itemPriceAuditActions.update,
      payload: {
        item_price_id: itemPrice.id,
        before,
        after: itemPrice
      }
    });

    // Clear price cache when price updated
    const { clearPriceCache } = await import("../pricing/variant-price-resolver.js");
    clearPriceCache();

    return itemPrice;
  });
}

export async function deleteItemPrice(
  companyId: number,
  itemPriceId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  const db = getDb();
  // Retry on deadlock since parallel test fixtures can contend on item_prices table
  return withTransactionRetry(db, async (trx) => {
    const before = await findItemPriceByIdWithExecutor(trx, companyId, itemPriceId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    if (actor && before.outlet_id !== null) {
      await ensureUserHasOutletAccess(actor.userId, companyId, before.outlet_id);
    }

    if (actor && before.outlet_id === null && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    await trx
      .deleteFrom("item_prices")
      .where("company_id", "=", companyId)
      .where("id", "=", itemPriceId)
      .execute();

    await recordItemPriceAuditLog(trx, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: itemPriceAuditActions.delete,
      payload: {
        item_price_id: before.id,
        before
      }
    });

    // Clear price cache when price deleted
    const { clearPriceCache } = await import("../pricing/variant-price-resolver.js");
    clearPriceCache();

    return true;
  });
}
