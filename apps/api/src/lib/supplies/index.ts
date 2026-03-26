// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { toRfc3339Required } from "@jurnapod/shared";
import { getDbPool } from "../db.js";
import { DatabaseConflictError } from "../master-data-errors.js";
import {
  isMysqlError,
  mysqlDuplicateErrorCode,
  recordMasterDataAuditLog,
  withTransaction
} from "../shared/master-data-utils.js";

type SupplyRow = RowDataPacket & {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: number;
  updated_at: string;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

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
  executor: QueryExecutor,
  input: {
    companyId: number;
    actor: MutationAuditActor | undefined;
    action: (typeof supplyAuditActions)[keyof typeof supplyAuditActions];
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await recordMasterDataAuditLog(executor, {
    companyId: input.companyId,
    outletId: null,
    actor: input.actor,
    action: input.action,
    payload: input.payload
  });
}

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
  executor: QueryExecutor,
  companyId: number,
  supplyId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SupplyRow[]>(
    `SELECT id, company_id, sku, name, unit, is_active, updated_at
     FROM supplies
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, supplyId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeSupply(rows[0]);
}

export async function listSupplies(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, sku, name, unit, is_active, updated_at FROM supplies WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<SupplyRow[]>(sql, values);
  return rows.map(normalizeSupply);
}

export async function findSupplyById(companyId: number, supplyId: number) {
  const pool = getDbPool();
  return findSupplyByIdWithExecutor(pool, companyId, supplyId);
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
  return withTransaction(async (connection) => {
    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO supplies (company_id, sku, name, unit, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, input.sku ?? null, input.name, input.unit?.trim() || "unit", input.is_active === false ? 0 : 1]
      );

      const supply = await findSupplyByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!supply) {
        throw new Error("Created supply not found");
      }

      await recordSupplyAuditLog(connection, {
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
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (Object.hasOwn(input, "sku")) {
    fields.push("sku = ?");
    values.push(input.sku ?? null);
  }

  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }

  if (typeof input.unit === "string") {
    fields.push("unit = ?");
    values.push(input.unit.trim());
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findSupplyByIdWithExecutor(connection, companyId, supplyId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, supplyId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE supplies
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const supply = await findSupplyByIdWithExecutor(connection, companyId, supplyId);
      if (!supply) {
        return null;
      }

      await recordSupplyAuditLog(connection, {
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
  return withTransaction(async (connection) => {
    const before = await findSupplyByIdWithExecutor(connection, companyId, supplyId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM supplies
       WHERE company_id = ?
         AND id = ?`,
      [companyId, supplyId]
    );

    await recordSupplyAuditLog(connection, {
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
