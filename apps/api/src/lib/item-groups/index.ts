// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { toRfc3339Required } from "@jurnapod/shared";
import { getDbPool } from "../db.js";
import { DatabaseConflictError, DatabaseReferenceError } from "../master-data-errors.js";
import {
  isMysqlError,
  mysqlDuplicateErrorCode,
  recordMasterDataAuditLog,
  withTransaction
} from "../shared/master-data-utils.js";

type ItemGroupRow = RowDataPacket & {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
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

const itemGroupAuditActions = {
  create: "MASTER_DATA_ITEM_GROUP_CREATE",
  update: "MASTER_DATA_ITEM_GROUP_UPDATE",
  delete: "MASTER_DATA_ITEM_GROUP_DELETE"
} as const;

async function recordItemGroupAuditLog(
  executor: QueryExecutor,
  input: {
    companyId: number;
    actor: MutationAuditActor | undefined;
    action: (typeof itemGroupAuditActions)[keyof typeof itemGroupAuditActions];
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

function normalizeItemGroup(row: ItemGroupRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    code: row.code,
    name: row.name,
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

async function ensureCompanyItemGroupExists(
  executor: QueryExecutor,
  companyId: number,
  groupId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM item_groups
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [groupId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Item group not found for company");
  }
}

async function getItemGroupParentId(
  executor: QueryExecutor,
  companyId: number,
  groupId: number
): Promise<number | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT parent_id
     FROM item_groups
     WHERE company_id = ?
       AND id = ?
     LIMIT 1`,
    [companyId, groupId]
  );

  if (!rows[0]) {
    return null;
  }

  const parentId = (rows[0] as { parent_id: number | null }).parent_id;
  return parentId == null ? null : Number(parentId);
}

async function isItemGroupDescendant(
  executor: QueryExecutor,
  companyId: number,
  candidateParentId: number,
  groupId: number
): Promise<boolean> {
  let currentId: number | null = candidateParentId;
  const visited = new Set<number>();

  while (typeof currentId === "number") {
    if (currentId === groupId) {
      return true;
    }

    if (visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    currentId = await getItemGroupParentId(executor, companyId, currentId);
    if (currentId == null) {
      break;
    }
  }

  return false;
}

async function findItemGroupByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  groupId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<ItemGroupRow[]>(
    `SELECT id, company_id, parent_id, code, name, is_active, updated_at
     FROM item_groups
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, groupId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeItemGroup(rows[0]);
}

export async function listItemGroups(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, parent_id, code, name, is_active, updated_at FROM item_groups WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<ItemGroupRow[]>(sql, values);
  return rows.map(normalizeItemGroup);
}

export async function findItemGroupById(companyId: number, groupId: number) {
  const pool = getDbPool();
  return findItemGroupByIdWithExecutor(pool, companyId, groupId);
}

export async function createItemGroup(
  companyId: number,
  input: {
    code?: string | null;
    name: string;
    parent_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      if (typeof input.parent_id === "number") {
        await ensureCompanyItemGroupExists(connection, companyId, input.parent_id);
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO item_groups (company_id, parent_id, code, name, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, input.parent_id ?? null, input.code ?? null, input.name, input.is_active === false ? 0 : 1]
      );

      const itemGroup = await findItemGroupByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!itemGroup) {
        throw new Error("Created item group not found");
      }

      await recordItemGroupAuditLog(connection, {
        companyId,
        actor,
        action: itemGroupAuditActions.create,
        payload: {
          item_group_id: itemGroup.id,
          after: itemGroup
        }
      });

      return itemGroup;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item group");
      }

      throw error;
    }
  });
}

export class ItemGroupBulkConflictError extends Error {
  constructor(
    message: string,
    public readonly code: "DUPLICATE_CODE" | "CODE_EXISTS" | "PARENT_CODE_NOT_FOUND" | "CYCLE_DETECTED"
  ) {
    super(message);
  }
}

type ItemGroupBulkRow = {
  code: string | null;
  name: string;
  parent_code: string | null;
  is_active: boolean;
};

export async function createItemGroupsBulk(
  companyId: number,
  rows: ItemGroupBulkRow[],
  actor?: MutationAuditActor
): Promise<{ created_count: number; groups: Awaited<ReturnType<typeof findItemGroupById>>[] }> {
  return withTransaction(async (connection) => {
    const normalizedRows = rows.map((r) => ({
      code: r.code?.trim() ?? null,
      name: r.name.trim(),
      parent_code: r.parent_code?.trim() ?? null,
      is_active: r.is_active ?? true
    }));

    const codeSet = new Set<string>();
    for (const row of normalizedRows) {
      if (row.code) {
        const lowerCode = row.code.toLowerCase();
        if (codeSet.has(lowerCode)) {
          throw new ItemGroupBulkConflictError(`Duplicate code in file: ${row.code}`, "DUPLICATE_CODE");
        }
        codeSet.add(lowerCode);
      }
    }

    const codeToIdMap = new Map<string, number>();
    if (codeSet.size > 0) {
      const codes = Array.from(codeSet);
      const placeholders = codes.map(() => "?").join(",");
      const [existing] = await connection.execute<RowDataPacket[]>(
        `SELECT id, code FROM item_groups WHERE company_id = ? AND LOWER(code) IN (${placeholders})`,
        [companyId, ...codes]
      );
      for (const row of existing as Array<{ id: number; code: string }>) {
        codeToIdMap.set(row.code.toLowerCase(), row.id);
      }
      if (codeToIdMap.size > 0) {
        const existingCodes = Array.from(codeToIdMap.keys()).join(", ");
        throw new ItemGroupBulkConflictError(`Code(s) already exist: ${existingCodes}`, "CODE_EXISTS");
      }
    }

    const codeToRowMap = new Map<string, number>();
    normalizedRows.forEach((row, idx) => {
      if (row.code) {
        codeToRowMap.set(row.code.toLowerCase(), idx);
      }
    });

    const parentIdMap = new Map<number, number | null>();
    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      if (row.parent_code) {
        const parentLower = row.parent_code.toLowerCase();
        const parentId = codeToIdMap.get(parentLower);
        if (parentId !== undefined) {
          parentIdMap.set(i, parentId);
        } else {
          const parentIdx = codeToRowMap.get(parentLower);
          if (parentIdx !== undefined) {
            parentIdMap.set(i, -1 - parentIdx);
          } else {
            throw new ItemGroupBulkConflictError(`Parent code not found: ${row.parent_code}`, "PARENT_CODE_NOT_FOUND");
          }
        }
      } else {
        parentIdMap.set(i, null);
      }
    }

    const inDegree = new Map<number, number>();
    for (let i = 0; i < normalizedRows.length; i++) {
      inDegree.set(i, 0);
    }
    for (let i = 0; i < normalizedRows.length; i++) {
      const parentId = parentIdMap.get(i);
      if (parentId !== undefined && parentId !== null && parentId < 0) {
        inDegree.set(i, (inDegree.get(i) ?? 0) + 1);
      }
    }

    const stack: number[] = [];
    for (const [idx, degree] of inDegree) {
      if (degree === 0) {
        stack.push(idx);
      }
    }

    const topoOrder: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop()!;
      topoOrder.push(idx);

      for (let j = 0; j < normalizedRows.length; j++) {
        const childParentId = parentIdMap.get(j);
        if (childParentId !== undefined && childParentId !== null && childParentId < 0) {
          const parentIdx = -1 - childParentId;
          if (parentIdx === idx) {
            const newDegree = (inDegree.get(j) ?? 1) - 1;
            inDegree.set(j, newDegree);
            if (newDegree === 0) {
              stack.push(j);
            }
          }
        }
      }
    }

    if (topoOrder.length !== normalizedRows.length) {
      throw new ItemGroupBulkConflictError("Cycle detected in parent relationships", "CYCLE_DETECTED");
    }

    const createdGroups: Awaited<ReturnType<typeof findItemGroupById>>[] = [];

    for (const idx of topoOrder) {
      const row = normalizedRows[idx];

      let parentId: number | null = null;
      if (row.parent_code) {
        const resolvedParentId = codeToIdMap.get(row.parent_code.toLowerCase());
        if (resolvedParentId === undefined) {
          throw new ItemGroupBulkConflictError(`Parent code not found: ${row.parent_code}`, "PARENT_CODE_NOT_FOUND");
        }
        parentId = resolvedParentId;
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO item_groups (company_id, parent_id, code, name, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, parentId, row.code, row.name, row.is_active ? 1 : 0]
      );

      const newId = Number(result.insertId);

      if (row.code) {
        codeToIdMap.set(row.code.toLowerCase(), newId);
      }

      const itemGroup = await findItemGroupByIdWithExecutor(connection, companyId, newId);
      if (!itemGroup) {
        throw new Error("Created item group not found");
      }

      await recordItemGroupAuditLog(connection, {
        companyId,
        actor,
        action: itemGroupAuditActions.create,
        payload: {
          item_group_id: itemGroup.id,
          after: itemGroup
        }
      });

      createdGroups.push(itemGroup);
    }

    return { created_count: createdGroups.length, groups: createdGroups };
  });
}

export async function updateItemGroup(
  companyId: number,
  groupId: number,
  input: {
    code?: string | null;
    name?: string;
    parent_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    const before = await findItemGroupByIdWithExecutor(connection, companyId, groupId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (Object.hasOwn(input, "code")) {
      fields.push("code = ?");
      values.push(input.code ?? null);
    }

    if (typeof input.name === "string") {
      fields.push("name = ?");
      values.push(input.name);
    }

    if (typeof input.is_active === "boolean") {
      fields.push("is_active = ?");
      values.push(input.is_active ? 1 : 0);
    }

    if (Object.hasOwn(input, "parent_id")) {
      const nextParentId = input.parent_id ?? null;
      if (nextParentId !== before.parent_id) {
        if (nextParentId == null) {
          fields.push("parent_id = ?");
          values.push(null);
        } else {
          if (nextParentId === groupId) {
            throw new DatabaseConflictError("Item group parent cannot be itself");
          }

          await ensureCompanyItemGroupExists(connection, companyId, nextParentId);
          const isDescendant = await isItemGroupDescendant(connection, companyId, nextParentId, groupId);
          if (isDescendant) {
            throw new DatabaseConflictError("Item group parent cannot be descendant");
          }

          fields.push("parent_id = ?");
          values.push(nextParentId);
        }
      }
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, groupId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE item_groups
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const itemGroup = await findItemGroupByIdWithExecutor(connection, companyId, groupId);
      if (!itemGroup) {
        return null;
      }

      await recordItemGroupAuditLog(connection, {
        companyId,
        actor,
        action: itemGroupAuditActions.update,
        payload: {
          item_group_id: itemGroup.id,
          before,
          after: itemGroup
        }
      });

      return itemGroup;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item group");
      }

      throw error;
    }
  });
}

export async function deleteItemGroup(
  companyId: number,
  groupId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findItemGroupByIdWithExecutor(connection, companyId, groupId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    const [children] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM item_groups
       WHERE company_id = ?
         AND parent_id = ?
       LIMIT 1`,
      [companyId, groupId]
    );
    if (children.length > 0) {
      throw new DatabaseConflictError("Item group has child groups");
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM item_groups
       WHERE company_id = ?
         AND id = ?`,
      [companyId, groupId]
    );

    await recordItemGroupAuditLog(connection, {
      companyId,
      actor,
      action: itemGroupAuditActions.delete,
      payload: {
        item_group_id: before.id,
        before
      }
    });

    return true;
  });
}
