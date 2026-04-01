// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { toRfc3339Required } from "@jurnapod/shared";
import { getDb, type KyselySchema } from "../db.js";
import { DatabaseConflictError } from "../master-data-errors.js";
import {
  isMysqlError,
  mysqlDuplicateErrorCode,
  recordMasterDataAuditLog,
  withTransaction
} from "../shared/master-data-utils.js";

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

const supplyAuditActions = {
  create: "MASTER_DATA_SUPPLY_CREATE",
  update: "MASTER_DATA_SUPPLY_UPDATE",
  delete: "MASTER_DATA_SUPPLY_DELETE"
} as const;

async function recordSupplyAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    actor: MutationAuditActor | undefined;
    action: (typeof supplyAuditActions)[keyof typeof supplyAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await recordMasterDataAuditLog(db, {
    companyId: input.companyId,
    outletId: null,
    actor: input.actor,
    action: input.action,
    payload: input.payload
  });
}

type SupplyRow = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: number;
  updated_at: string | Date;
};

function normalizeSupply(row: SupplyRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

async function findSupplyByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  supplyId: number,
  options?: { forUpdate?: boolean }
) {
  let query = db
    .selectFrom("supplies")
    .where("company_id", "=", companyId)
    .where("id", "=", supplyId)
    .select(["id", "company_id", "sku", "name", "unit", "is_active", "updated_at"]);

  if (options?.forUpdate) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return null;
  }

  return normalizeSupply(row as SupplyRow);
}

export async function listSupplies(companyId: number, filters?: { isActive?: boolean }) {
  const db = getDb();

  let query = db
    .selectFrom("supplies")
    .where("company_id", "=", companyId)
    .select(["id", "company_id", "sku", "name", "unit", "is_active", "updated_at"])
    .orderBy("id", "asc");

  if (typeof filters?.isActive === "boolean") {
    query = query.where("is_active", "=", filters.isActive ? 1 : 0);
  }

  const rows = await query.execute();
  return rows.map((row) => normalizeSupply(row as SupplyRow));
}

export async function findSupplyById(companyId: number, supplyId: number) {
  const db = getDb();
  return findSupplyByIdWithExecutor(db, companyId, supplyId);
}

export async function createSupply(
  companyId: number,
  input: {
    sku?: string | null;
    name: string;
    unit?: string;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    try {
      const result = await trx
        .insertInto("supplies")
        .values({
          company_id: companyId,
          sku: input.sku ?? null,
          name: input.name,
          unit: input.unit?.trim() || "unit",
          is_active: input.is_active === false ? 0 : 1
        })
        .executeTakeFirst();

      if (!result) {
        throw new Error("Created supply not found");
      }

      const supply = await findSupplyByIdWithExecutor(trx, companyId, Number(result.insertId));
      if (!supply) {
        throw new Error("Created supply not found");
      }

      await recordSupplyAuditLog(trx, {
        companyId,
        actor,
        action: supplyAuditActions.create,
        payload: {
          supply_id: supply.id,
          after: supply
        }
      });

      return supply;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate supply");
      }

      throw error;
    }
  });
}

export async function updateSupply(
  companyId: number,
  supplyId: number,
  input: {
    sku?: string | null;
    name?: string;
    unit?: string;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    const before = await findSupplyByIdWithExecutor(trx, companyId, supplyId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    const fields: Record<string, unknown> = {};

    if (Object.hasOwn(input, "sku")) {
      fields["sku"] = input.sku ?? null;
    }

    if (typeof input.name === "string") {
      fields["name"] = input.name;
    }

    if (typeof input.unit === "string") {
      fields["unit"] = input.unit.trim();
    }

    if (typeof input.is_active === "boolean") {
      fields["is_active"] = input.is_active ? 1 : 0;
    }

    if (Object.keys(fields).length === 0) {
      return before;
    }

    try {
      await trx
        .updateTable("supplies")
        .set({
          ...fields,
          updated_at: new Date()
        })
        .where("company_id", "=", companyId)
        .where("id", "=", supplyId)
        .execute();

      const supply = await findSupplyByIdWithExecutor(trx, companyId, supplyId);
      if (!supply) {
        return null;
      }

      await recordSupplyAuditLog(trx, {
        companyId,
        actor,
        action: supplyAuditActions.update,
        payload: {
          supply_id: supply.id,
          before,
          after: supply
        }
      });

      return supply;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate supply");
      }

      throw error;
    }
  });
}

export async function deleteSupply(
  companyId: number,
  supplyId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  const db = getDb();
  return withTransaction(db, async (trx) => {
    const before = await findSupplyByIdWithExecutor(trx, companyId, supplyId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await trx
      .deleteFrom("supplies")
      .where("company_id", "=", companyId)
      .where("id", "=", supplyId)
      .execute();

    await recordSupplyAuditLog(trx, {
      companyId,
      actor,
      action: supplyAuditActions.delete,
      payload: {
        supply_id: before.id,
        before
      }
    });

    return true;
  });
}
