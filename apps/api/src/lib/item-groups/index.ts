// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { toRfc3339Required } from "@jurnapod/shared";
import { getDb, type KyselySchema } from "../db.js";
import { DatabaseConflictError, DatabaseReferenceError } from "../master-data-errors.js";
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

const itemGroupAuditActions = {
  create: "MASTER_DATA_ITEM_GROUP_CREATE",
  update: "MASTER_DATA_ITEM_GROUP_UPDATE",
  delete: "MASTER_DATA_ITEM_GROUP_DELETE"
} as const;

async function recordItemGroupAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    actor: MutationAuditActor | undefined;
    action: (typeof itemGroupAuditActions)[keyof typeof itemGroupAuditActions];
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

function normalizeItemGroup(row: {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: number;
  updated_at: string | Date;
}) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    code: row.code,
    name: row.name,
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at)
  };
}

async function ensureCompanyItemGroupExists(
  db: KyselySchema,
  companyId: number,
  groupId: number
): Promise<void> {
  const row = await db
    .selectFrom("item_groups")
    .where("id", "=", groupId)
    .where("company_id", "=", companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!row) {
    throw new DatabaseReferenceError("Item group not found for company");
  }
}

async function getItemGroupParentId(
  db: KyselySchema,
  companyId: number,
  groupId: number
): Promise<number | null> {
  const row = await db
    .selectFrom("item_groups")
    .where("company_id", "=", companyId)
    .where("id", "=", groupId)
    .select(["parent_id"])
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const parentId = (row as { parent_id: number | null }).parent_id;
  return parentId == null ? null : Number(parentId);
}

async function isItemGroupDescendant(
  db: KyselySchema,
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
    currentId = await getItemGroupParentId(db, companyId, currentId);
    if (currentId == null) {
      break;
    }
  }

  return false;
}

async function findItemGroupByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  groupId: number,
  options?: { forUpdate?: boolean }
) {
  let query = db
    .selectFrom("item_groups")
    .where("company_id", "=", companyId)
    .where("id", "=", groupId)
    .select(["id", "company_id", "parent_id", "code", "name", "is_active", "updated_at"]);

  if (options?.forUpdate) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return null;
  }

  return normalizeItemGroup(row);
}

export async function listItemGroups(companyId: number, filters?: { isActive?: boolean }) {
  const db = getDb();

  let query = db
    .selectFrom("item_groups")
    .where("company_id", "=", companyId)
    .select(["id", "company_id", "parent_id", "code", "name", "is_active", "updated_at"]);

  if (typeof filters?.isActive === "boolean") {
    query = query.where("is_active", "=", filters.isActive ? 1 : 0);
  }

  const rows = await query.orderBy("id", "asc").execute();
  return rows.map(normalizeItemGroup);
}

export async function findItemGroupById(companyId: number, groupId: number) {
  const db = getDb();
  return findItemGroupByIdWithExecutor(db, companyId, groupId);
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
  const db = getDb();
  return withTransaction(db, async (trx) => {
    try {
      if (typeof input.parent_id === "number") {
        await ensureCompanyItemGroupExists(trx, companyId, input.parent_id);
      }

      const result = await trx
        .insertInto("item_groups")
        .values({
          company_id: companyId,
          parent_id: input.parent_id ?? null,
          code: input.code ?? null,
          name: input.name,
          is_active: input.is_active === false ? 0 : 1
        })
        .returningAll()
        .executeTakeFirst();

      if (!result) {
        throw new Error("Created item group not found");
      }

      const itemGroup = await findItemGroupByIdWithExecutor(trx, companyId, Number(result.id));
      if (!itemGroup) {
        throw new Error("Created item group not found");
      }

      await recordItemGroupAuditLog(trx, {
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
  const db = getDb();
  return withTransaction(db, async (trx) => {
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
      const existingResult = await sql<{ id: number; code: string }>`
        SELECT id, code FROM item_groups 
        WHERE company_id = ${companyId} 
        AND LOWER(code) IN (${sql.join(codes.map(c => sql`${c.toLowerCase()}`))})
      `.execute(trx);

      for (const row of existingResult.rows) {
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

      const result = await trx
        .insertInto("item_groups")
        .values({
          company_id: companyId,
          parent_id: parentId,
          code: row.code,
          name: row.name,
          is_active: row.is_active ? 1 : 0
        })
        .returningAll()
        .executeTakeFirst();

      const newId = Number(result!.id);

      if (row.code) {
        codeToIdMap.set(row.code.toLowerCase(), newId);
      }

      const itemGroup = await findItemGroupByIdWithExecutor(trx, companyId, newId);
      if (!itemGroup) {
        throw new Error("Created item group not found");
      }

      await recordItemGroupAuditLog(trx, {
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
  const db = getDb();
  return withTransaction(db, async (trx) => {
    const before = await findItemGroupByIdWithExecutor(trx, companyId, groupId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    // Build update values dynamically
    type UpdateValues = {
      code?: string | null;
      name?: string;
      parent_id?: number | null;
      is_active?: number;
    };
    const updateValues: UpdateValues = {};

    if (Object.hasOwn(input, "code")) {
      updateValues.code = input.code ?? null;
    }

    if (typeof input.name === "string") {
      updateValues.name = input.name;
    }

    if (typeof input.is_active === "boolean") {
      updateValues.is_active = input.is_active ? 1 : 0;
    }

    if (Object.hasOwn(input, "parent_id")) {
      const nextParentId = input.parent_id ?? null;
      if (nextParentId !== before.parent_id) {
        if (nextParentId == null) {
          updateValues.parent_id = null;
        } else {
          if (nextParentId === groupId) {
            throw new DatabaseConflictError("Item group parent cannot be itself");
          }

          await ensureCompanyItemGroupExists(trx, companyId, nextParentId);
          const isDescendant = await isItemGroupDescendant(trx, companyId, nextParentId, groupId);
          if (isDescendant) {
            throw new DatabaseConflictError("Item group parent cannot be descendant");
          }

          updateValues.parent_id = nextParentId;
        }
      }
    }

    if (Object.keys(updateValues).length === 0) {
      return before;
    }

    try {
      await trx
        .updateTable("item_groups")
        .set({ ...updateValues, updated_at: new Date() })
        .where("company_id", "=", companyId)
        .where("id", "=", groupId)
        .execute();

      const itemGroup = await findItemGroupByIdWithExecutor(trx, companyId, groupId);
      if (!itemGroup) {
        return null;
      }

      await recordItemGroupAuditLog(trx, {
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
  const db = getDb();
  return withTransaction(db, async (trx) => {
    const before = await findItemGroupByIdWithExecutor(trx, companyId, groupId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    const children = await trx
      .selectFrom("item_groups")
      .where("company_id", "=", companyId)
      .where("parent_id", "=", groupId)
      .select(["id"])
      .limit(1)
      .execute();

    if (children.length > 0) {
      throw new DatabaseConflictError("Item group has child groups");
    }

    await trx
      .deleteFrom("item_groups")
      .where("company_id", "=", companyId)
      .where("id", "=", groupId)
      .execute();

    await recordItemGroupAuditLog(trx, {
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
