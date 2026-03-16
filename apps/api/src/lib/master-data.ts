// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  listCompanyDefaultTaxRates,
  listCompanyTaxRates,
  resolveCombinedTaxConfig
} from "./taxes";
import type { SyncPullPayload, SyncPullResponse } from "@jurnapod/shared";
import { SyncPullConfigSchema } from "@jurnapod/shared";
import { getDbPool } from "./db";

type ItemRow = RowDataPacket & {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  item_group_id: number | null;
  is_active: number;
  updated_at: string;
};

type ItemGroupRow = RowDataPacket & {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: number;
  updated_at: string;
};

type ItemPriceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: string | number;
  is_active: number;
  updated_at: string;
  item_group_id?: number | null;
  item_group_name?: string | null;
};

type SupplyRow = RowDataPacket & {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: number;
  updated_at: string;
};

type FixedAssetRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: string | number | null;
  is_active: number;
  updated_at: string;
};

type FixedAssetCategoryRow = RowDataPacket & {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
  useful_life_months: number;
  residual_value_pct: string | number;
  expense_account_id: number | null;
  accum_depr_account_id: number | null;
  is_active: number;
  updated_at: string;
};

type OutletTableRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  updated_at: string;
};

type ReservationRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: string;
  duration_minutes: number | null;
  status: "BOOKED" | "CONFIRMED" | "ARRIVED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes: string | null;
  linked_order_id: string | null;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

type VersionRow = RowDataPacket & {
  current_version: number;
};

type CompanyModuleRow = RowDataPacket & {
  enabled: number | null;
  config_json: string | null;
};

const mysqlDuplicateErrorCode = 1062;
const mysqlForeignKeyErrorCode = 1452;

const masterDataAuditActions = {
  itemCreate: "MASTER_DATA_ITEM_CREATE",
  itemUpdate: "MASTER_DATA_ITEM_UPDATE",
  itemDelete: "MASTER_DATA_ITEM_DELETE",
  itemGroupCreate: "MASTER_DATA_ITEM_GROUP_CREATE",
  itemGroupUpdate: "MASTER_DATA_ITEM_GROUP_UPDATE",
  itemGroupDelete: "MASTER_DATA_ITEM_GROUP_DELETE",
  itemPriceCreate: "MASTER_DATA_ITEM_PRICE_CREATE",
  itemPriceUpdate: "MASTER_DATA_ITEM_PRICE_UPDATE",
  itemPriceDelete: "MASTER_DATA_ITEM_PRICE_DELETE",
  supplyCreate: "MASTER_DATA_SUPPLY_CREATE",
  supplyUpdate: "MASTER_DATA_SUPPLY_UPDATE",
  supplyDelete: "MASTER_DATA_SUPPLY_DELETE",
  fixedAssetCreate: "MASTER_DATA_FIXED_ASSET_CREATE",
  fixedAssetUpdate: "MASTER_DATA_FIXED_ASSET_UPDATE",
  fixedAssetDelete: "MASTER_DATA_FIXED_ASSET_DELETE",
  fixedAssetCategoryCreate: "MASTER_DATA_FIXED_ASSET_CATEGORY_CREATE",
  fixedAssetCategoryUpdate: "MASTER_DATA_FIXED_ASSET_CATEGORY_UPDATE",
  fixedAssetCategoryDelete: "MASTER_DATA_FIXED_ASSET_CATEGORY_DELETE"
} as const;

type MasterDataAuditAction = (typeof masterDataAuditActions)[keyof typeof masterDataAuditActions];

type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

export class DatabaseConflictError extends Error {}
export class DatabaseReferenceError extends Error {}
export class DatabaseForbiddenError extends Error {}

const paymentMethodConfigSchema = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  method: z.string().trim().min(1).optional()
});

const syncPaymentMethodsConfigSchema = z
  .array(z.string().trim().min(1))
  .or(z.array(paymentMethodConfigSchema))
  .or(
    z.object({
      methods: z
        .array(z.string().trim().min(1))
        .or(z.array(paymentMethodConfigSchema))
    })
  )
  .optional();

function normalizePaymentMethods(value: unknown): string[] | null {
  const parsed = syncPaymentMethodsConfigSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const methods = Array.isArray(parsed.data) ? parsed.data : parsed.data?.methods;
  if (!methods || methods.length === 0) {
    return null;
  }

  const normalized = methods
    .map((method) => (typeof method === "string" ? method.trim() : method.code.trim()))
    .filter((method) => method.length > 0);

  return normalized.length > 0 ? normalized : null;
}

async function readLegacyPaymentMethods(
  executor: QueryExecutor,
  companyId: number
): Promise<string[] | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT \`key\`, enabled, config_json
     FROM feature_flags
     WHERE company_id = ?
       AND \`key\` IN ('pos.payment_methods', 'pos.config')`,
    [companyId]
  );

  let resolved: string[] | null = null;
  for (const row of rows as Array<{ key?: string; enabled?: number; config_json?: string }>) {
    if (row.enabled !== 1 || typeof row.key !== "string") {
      continue;
    }

    let parsed: unknown = null;
    try {
      parsed = typeof row.config_json === "string" ? JSON.parse(row.config_json) : null;
    } catch {
      parsed = null;
    }

    let candidate = parsed;
    if (row.key === "pos.config" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      candidate = (parsed as Record<string, unknown>).payment_methods ?? parsed;
    }

    const normalized = normalizePaymentMethods(candidate);
    if (normalized) {
      resolved = normalized;
    }
  }

  return resolved;
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordMasterDataAuditLog(
  executor: QueryExecutor,
  input: {
    companyId: number;
    outletId: number | null;
    actor: MutationAuditActor | undefined;
    action: MasterDataAuditAction;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await executor.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      input.companyId,
      input.outletId,
      input.actor?.userId ?? null,
      input.action,
      JSON.stringify(input.payload)
    ]
  );
}

function normalizeItem(row: ItemRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    type: row.item_type,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  };
}

function normalizeItemGroup(row: ItemGroupRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    code: row.code,
    name: row.name,
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  };
}

function normalizeItemPrice(row: ItemPriceRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    item_id: Number(row.item_id),
    price: Number(row.price),
    is_active: row.is_active === 1,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    item_group_name: row.item_group_name ?? null,
    updated_at: row.updated_at
  };
}

function normalizeSupply(row: SupplyRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  };
}

function normalizeOutletTable(row: OutletTableRow) {
  return {
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    updated_at: row.updated_at
  };
}

function normalizeReservation(row: ReservationRow) {
  return {
    reservation_id: Number(row.id),
    table_id: row.table_id == null ? null : Number(row.table_id),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: row.reservation_at,
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    status: row.status,
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    arrived_at: row.arrived_at ? row.arrived_at : null,
    seated_at: row.seated_at ? row.seated_at : null,
    cancelled_at: row.cancelled_at ? row.cancelled_at : null,
    updated_at: row.updated_at
  };
}

function normalizeFixedAsset(row: FixedAssetRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    category_id: row.category_id == null ? null : Number(row.category_id),
    asset_tag: row.asset_tag,
    name: row.name,
    serial_number: row.serial_number,
    purchase_date: row.purchase_date ? row.purchase_date : null,
    purchase_cost: row.purchase_cost == null ? null : Number(row.purchase_cost),
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  };
}

function normalizeFixedAssetCategory(row: FixedAssetCategoryRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    depreciation_method: row.depreciation_method,
    useful_life_months: Number(row.useful_life_months),
    residual_value_pct: Number(row.residual_value_pct),
    expense_account_id: row.expense_account_id == null ? null : Number(row.expense_account_id),
    accum_depr_account_id: row.accum_depr_account_id == null ? null : Number(row.accum_depr_account_id),
    is_active: row.is_active === 1,
    updated_at: row.updated_at
  };
}

async function ensureCompanyAccountExists(
  executor: QueryExecutor,
  companyId: number,
  accountId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM accounts
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [accountId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Account not found for company");
  }
}

async function ensureCompanyItemExists(
  executor: QueryExecutor,
  companyId: number,
  itemId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM items
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [itemId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Item not found for company");
  }
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

async function ensureCompanyOutletExists(
  executor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [outletId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Outlet not found for company");
  }
}

async function ensureCompanyFixedAssetCategoryExists(
  executor: QueryExecutor,
  companyId: number,
  categoryId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM fixed_asset_categories
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [categoryId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Fixed asset category not found for company");
  }
}

async function ensureUserHasOutletAccess(
  executor: QueryExecutor,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM users u
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND (
         EXISTS (
           SELECT 1
           FROM user_role_assignments ura
           INNER JOIN roles r ON r.id = ura.role_id
           WHERE ura.user_id = u.id
             AND r.is_global = 1
             AND ura.outlet_id IS NULL
         )
         OR EXISTS (
           SELECT 1
           FROM user_role_assignments ura
           WHERE ura.user_id = u.id
             AND ura.outlet_id = ?
         )
       )
     LIMIT 1`,
    [userId, companyId, outletId]
  );

  if (rows.length === 0) {
    throw new DatabaseForbiddenError("User cannot access outlet");
  }
}

async function findItemByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  itemId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<ItemRow[]>(
    `SELECT id, company_id, sku, name, item_type, item_group_id, is_active, updated_at
     FROM items
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, itemId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeItem(rows[0]);
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

async function findItemPriceByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  itemPriceId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<ItemPriceRow[]>(
    `SELECT id, company_id, outlet_id, item_id, price, is_active, updated_at
     FROM item_prices
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, itemPriceId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeItemPrice(rows[0]);
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

async function findFixedAssetCategoryByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  categoryId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<FixedAssetCategoryRow[]>(
    `SELECT id, company_id, code, name, depreciation_method, useful_life_months, residual_value_pct,
            expense_account_id, accum_depr_account_id, is_active, updated_at
     FROM fixed_asset_categories
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, categoryId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeFixedAssetCategory(rows[0]);
}

async function findFixedAssetByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  assetId: number,
  options?: { forUpdate?: boolean }
) {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<FixedAssetRow[]>(
    `SELECT id, company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost,
            is_active, updated_at
     FROM fixed_assets
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, assetId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizeFixedAsset(rows[0]);
}

export async function listItems(companyId: number, filters?: { isActive?: boolean }) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, sku, name, item_type, item_group_id, is_active, updated_at FROM items WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<ItemRow[]>(sql, values);
  return rows.map(normalizeItem);
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

export async function listOutletTables(companyId: number, outletId: number) {
  const pool = getDbPool();
  const sql = `
    SELECT id, company_id, outlet_id, code, name, zone, capacity, status, updated_at
    FROM outlet_tables
    WHERE company_id = ? AND outlet_id = ?
    ORDER BY code ASC
  `;
  const [rows] = await pool.execute<OutletTableRow[]>(sql, [companyId, outletId]);
  return rows.map(normalizeOutletTable);
}

export async function listActiveReservations(companyId: number, outletId: number) {
  const pool = getDbPool();
  const sql = `
    SELECT id, company_id, outlet_id, table_id, customer_name, customer_phone, guest_count,
           reservation_at, duration_minutes, status, notes, linked_order_id,
           arrived_at, seated_at, cancelled_at, updated_at
    FROM reservations
    WHERE company_id = ? AND outlet_id = ?
      AND status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED')
    ORDER BY reservation_at ASC
  `;
  const [rows] = await pool.execute<ReservationRow[]>(sql, [companyId, outletId]);
  return rows.map(normalizeReservation);
}

export async function findItemById(companyId: number, itemId: number) {
  const pool = getDbPool();
  return findItemByIdWithExecutor(pool, companyId, itemId);
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
        [
          companyId,
          input.parent_id ?? null,
          input.code ?? null,
          input.name,
          input.is_active === false ? 0 : 1
        ]
      );

      const itemGroup = await findItemGroupByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!itemGroup) {
        throw new Error("Created item group not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemGroupCreate,
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
          throw new ItemGroupBulkConflictError(
            `Duplicate code in file: ${row.code}`,
            "DUPLICATE_CODE"
          );
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
        throw new ItemGroupBulkConflictError(
          `Code(s) already exist: ${existingCodes}`,
          "CODE_EXISTS"
        );
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
            throw new ItemGroupBulkConflictError(
              `Parent code not found: ${row.parent_code}`,
              "PARENT_CODE_NOT_FOUND"
            );
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
        const parentIdx = -1 - parentId;
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
          throw new ItemGroupBulkConflictError(
            `Parent code not found: ${row.parent_code}`,
            "PARENT_CODE_NOT_FOUND"
          );
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

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemGroupCreate,
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
          const isDescendant = await isItemGroupDescendant(
            connection,
            companyId,
            nextParentId,
            groupId
          );
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

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemGroupUpdate,
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

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.itemGroupDelete,
      payload: {
        item_group_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function createItem(
  companyId: number,
  input: {
    sku?: string | null;
    name: string;
    type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    item_group_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      if (typeof input.item_group_id === "number") {
        await ensureCompanyItemGroupExists(connection, companyId, input.item_group_id);
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO items (company_id, sku, name, item_type, item_group_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.sku ?? null,
          input.name,
          input.type,
          input.item_group_id ?? null,
          input.is_active === false ? 0 : 1
        ]
      );

      const item = await findItemByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!item) {
        throw new Error("Created item not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemCreate,
        payload: {
          item_id: item.id,
          after: item
        }
      });

      return item;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item");
      }

      throw error;
    }
  });
}

export async function updateItem(
  companyId: number,
  itemId: number,
  input: {
    sku?: string | null;
    name?: string;
    type?: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    item_group_id?: number | null;
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

  if (typeof input.type === "string") {
    fields.push("item_type = ?");
    values.push(input.type);
  }

  if (Object.hasOwn(input, "item_group_id") && input.item_group_id !== undefined) {
    if (typeof input.item_group_id === "number") {
      fields.push("item_group_id = ?");
      values.push(input.item_group_id);
    } else {
      fields.push("item_group_id = ?");
      values.push(null);
    }
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findItemByIdWithExecutor(connection, companyId, itemId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (fields.length === 0) {
      return before;
    }

    if (
      Object.hasOwn(input, "item_group_id") &&
      input.item_group_id !== undefined &&
      typeof input.item_group_id === "number"
    ) {
      await ensureCompanyItemGroupExists(connection, companyId, input.item_group_id);
    }

    values.push(companyId, itemId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE items
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      // If deactivating the item, also deactivate its prices
      if (typeof input.is_active === "boolean" && input.is_active === false) {
        await connection.execute<ResultSetHeader>(
          `UPDATE item_prices 
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ? AND item_id = ?`,
          [companyId, itemId]
        );
      }

      const item = await findItemByIdWithExecutor(connection, companyId, itemId);
      if (!item) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.itemUpdate,
        payload: {
          item_id: item.id,
          before,
          after: item
        }
      });

      return item;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item");
      }

      throw error;
    }
  });
}

export async function deleteItem(
  companyId: number,
  itemId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findItemByIdWithExecutor(connection, companyId, itemId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM items
       WHERE company_id = ?
         AND id = ?`,
      [companyId, itemId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.itemDelete,
      payload: {
        item_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function listItemPrices(
  companyId: number,
  filters?: { outletId?: number; outletIds?: readonly number[]; isActive?: boolean; includeDefaults?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT ip.id, ip.company_id, ip.outlet_id, ip.item_id, ip.price, ip.is_active, ip.updated_at, i.item_group_id, ig.name AS item_group_name " +
    "FROM item_prices ip " +
    "INNER JOIN items i ON i.id = ip.item_id AND i.company_id = ip.company_id " +
    "LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = ip.company_id " +
    "WHERE ip.company_id = ?";

  if (typeof filters?.outletId === "number") {
    // When querying by specific outlet, return both outlet overrides and company defaults
    // unless includeDefaults is explicitly false
    if (filters.includeDefaults !== false) {
      sql += " AND (ip.outlet_id = ? OR ip.outlet_id IS NULL)";
      values.push(filters.outletId);
    } else {
      sql += " AND ip.outlet_id = ?";
      values.push(filters.outletId);
    }
  } else if (Array.isArray(filters?.outletIds)) {
    if (filters.outletIds.length === 0) {
      return [];
    }

    const outletPlaceholders = filters.outletIds.map(() => "?").join(", ");
    if (filters.includeDefaults !== false) {
      sql += ` AND (ip.outlet_id IN (${outletPlaceholders}) OR ip.outlet_id IS NULL)`;
      values.push(...filters.outletIds);
    } else {
      sql += ` AND ip.outlet_id IN (${outletPlaceholders})`;
      values.push(...filters.outletIds);
    }
  }

  if (typeof filters?.isActive === "boolean") {
    sql += " AND ip.is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  // MySQL doesn't support NULLS LAST syntax; use IS NULL trick to put nulls last in descending order
  sql += " ORDER BY ip.outlet_id IS NULL ASC, ip.outlet_id DESC, ip.id ASC";

  const [rows] = await pool.execute<ItemPriceRow[]>(sql, values);
  return rows.map(normalizeItemPrice);
}

/**
 * List effective item prices for a specific outlet.
 * Returns outlet overrides when available, otherwise company defaults.
 * Override takes precedence regardless of active state - inactive override hides item.
 * Filters out items without any price (neither override nor default).
 */
export async function listEffectiveItemPricesForOutlet(
  companyId: number,
  outletId: number,
  filters?: { isActive?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [outletId, outletId, companyId];

  // Override takes precedence regardless of active state.
  // If override exists but is inactive, item is hidden from active prices.
  let sql = `
    SELECT 
      COALESCE(override.id, def.id) AS id,
      COALESCE(override.company_id, def.company_id) AS company_id,
      COALESCE(override.outlet_id, ?) AS outlet_id,
      COALESCE(override.item_id, def.item_id) AS item_id,
      COALESCE(override.price, def.price) AS price,
      COALESCE(override.is_active, def.is_active) AS is_active,
      COALESCE(override.updated_at, def.updated_at) AS updated_at,
      i.item_group_id,
      ig.name AS item_group_name,
      CASE WHEN override.id IS NOT NULL THEN 1 ELSE 0 END AS is_override
    FROM items i
    LEFT JOIN item_prices override ON override.item_id = i.id 
      AND override.company_id = i.company_id 
      AND override.outlet_id = ?
    LEFT JOIN item_prices def ON def.item_id = i.id 
      AND def.company_id = i.company_id 
      AND def.outlet_id IS NULL
    LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = i.company_id
    WHERE i.company_id = ?
      AND (override.id IS NOT NULL OR def.id IS NOT NULL)
  `;

  if (typeof filters?.isActive === "boolean") {
    sql += " AND COALESCE(override.is_active, def.is_active) = ?";
    values.push(filters.isActive ? 1 : 0);
    // Also filter by item active status when filtering for active prices
    sql += " AND i.is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY i.id ASC";

  const [rows] = await pool.execute<(ItemPriceRow & { is_override: number })[]>(sql, values);
  return rows.map((row) => {
    const normalized = normalizeItemPrice(row);
    return {
      ...normalized,
      outlet_id: normalized.outlet_id ?? outletId, // COALESCE ensures this is always outletId
      is_override: row.is_override === 1
    };
  });
}

export async function findItemPriceById(companyId: number, itemPriceId: number) {
  const pool = getDbPool();
  return findItemPriceByIdWithExecutor(pool, companyId, itemPriceId);
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
        [
          companyId,
          input.sku ?? null,
          input.name,
          input.unit?.trim() || "unit",
          input.is_active === false ? 0 : 1
        ]
      );

      const supply = await findSupplyByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!supply) {
        throw new Error("Created supply not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.supplyCreate,
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

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.supplyUpdate,
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

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.supplyDelete,
      payload: {
        supply_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function listFixedAssetCategories(
  companyId: number,
  filters?: { isActive?: boolean }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, expense_account_id, accum_depr_account_id, is_active, updated_at FROM fixed_asset_categories WHERE company_id = ?";

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<FixedAssetCategoryRow[]>(sql, values);
  return rows.map(normalizeFixedAssetCategory);
}

export async function findFixedAssetCategoryById(
  companyId: number,
  categoryId: number
) {
  const pool = getDbPool();
  return findFixedAssetCategoryByIdWithExecutor(pool, companyId, categoryId);
}

export async function createFixedAssetCategory(
  companyId: number,
  input: {
    code: string;
    name: string;
    depreciation_method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    useful_life_months: number;
    residual_value_pct?: number;
    expense_account_id?: number | null;
    accum_depr_account_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    try {
      if (typeof input.expense_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.expense_account_id);
      }
      if (typeof input.accum_depr_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.accum_depr_account_id);
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fixed_asset_categories (
           company_id, code, name, depreciation_method, useful_life_months, residual_value_pct,
           expense_account_id, accum_depr_account_id, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.code,
          input.name,
          input.depreciation_method ?? "STRAIGHT_LINE",
          input.useful_life_months,
          input.residual_value_pct ?? 0,
          input.expense_account_id ?? null,
          input.accum_depr_account_id ?? null,
          input.is_active === false ? 0 : 1
        ]
      );

      const category = await findFixedAssetCategoryByIdWithExecutor(
        connection,
        companyId,
        Number(result.insertId)
      );
      if (!category) {
        throw new Error("Created fixed asset category not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.fixedAssetCategoryCreate,
        payload: {
          fixed_asset_category_id: category.id,
          after: category
        }
      });

      return category;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed asset category");
      }

      throw error;
    }
  });
}

export async function updateFixedAssetCategory(
  companyId: number,
  categoryId: number,
  input: {
    code?: string;
    name?: string;
    depreciation_method?: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
    useful_life_months?: number;
    residual_value_pct?: number;
    expense_account_id?: number | null;
    accum_depr_account_id?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (typeof input.code === "string") {
    fields.push("code = ?");
    values.push(input.code);
  }

  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }

  if (typeof input.depreciation_method === "string") {
    fields.push("depreciation_method = ?");
    values.push(input.depreciation_method);
  }

  if (typeof input.useful_life_months === "number") {
    fields.push("useful_life_months = ?");
    values.push(input.useful_life_months);
  }

  if (typeof input.residual_value_pct === "number") {
    fields.push("residual_value_pct = ?");
    values.push(input.residual_value_pct);
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    if (input.expense_account_id !== undefined) {
      if (typeof input.expense_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.expense_account_id);
      }
      fields.push("expense_account_id = ?");
      values.push(input.expense_account_id);
    }

    if (input.accum_depr_account_id !== undefined) {
      if (typeof input.accum_depr_account_id === "number") {
        await ensureCompanyAccountExists(connection, companyId, input.accum_depr_account_id);
      }
      fields.push("accum_depr_account_id = ?");
      values.push(input.accum_depr_account_id);
    }

    const before = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, categoryId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE fixed_asset_categories
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const category = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId);
      if (!category) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: null,
        actor,
        action: masterDataAuditActions.fixedAssetCategoryUpdate,
        payload: {
          fixed_asset_category_id: category.id,
          before,
          after: category
        }
      });

      return category;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed asset category");
      }

      throw error;
    }
  });
}

export async function deleteFixedAssetCategory(
  companyId: number,
  categoryId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findFixedAssetCategoryByIdWithExecutor(connection, companyId, categoryId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM fixed_asset_categories
       WHERE company_id = ?
         AND id = ?`,
      [companyId, categoryId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: null,
      actor,
      action: masterDataAuditActions.fixedAssetCategoryDelete,
      payload: {
        fixed_asset_category_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function listFixedAssets(
  companyId: number,
  filters?: { outletId?: number; isActive?: boolean; allowedOutletIds?: number[] }
) {
  const pool = getDbPool();
  const values: Array<number> = [companyId];

  let sql =
    "SELECT id, company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost, is_active, updated_at FROM fixed_assets WHERE company_id = ?";

  if (typeof filters?.outletId === "number") {
    sql += " AND outlet_id = ?";
    values.push(filters.outletId);
  }

  if (filters?.allowedOutletIds !== undefined) {
    if (filters.allowedOutletIds.length > 0) {
      const placeholders = filters.allowedOutletIds.map(() => "?").join(", ");
      sql += ` AND (outlet_id IS NULL OR outlet_id IN (${placeholders}))`;
      values.push(...filters.allowedOutletIds);
    } else {
      sql += " AND outlet_id IS NULL";
    }
  }

  if (typeof filters?.isActive === "boolean") {
    sql += " AND is_active = ?";
    values.push(filters.isActive ? 1 : 0);
  }

  sql += " ORDER BY id ASC";

  const [rows] = await pool.execute<FixedAssetRow[]>(sql, values);
  return rows.map(normalizeFixedAsset);
}

export async function findFixedAssetById(companyId: number, assetId: number) {
  const pool = getDbPool();
  return findFixedAssetByIdWithExecutor(pool, companyId, assetId);
}

export async function createFixedAsset(
  companyId: number,
  input: {
    outlet_id?: number | null;
    category_id?: number | null;
    asset_tag?: string | null;
    name: string;
    serial_number?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
    }

    if (typeof input.category_id === "number") {
      await ensureCompanyFixedAssetCategoryExists(connection, companyId, input.category_id);
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO fixed_assets (
           company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.outlet_id ?? null,
          input.category_id ?? null,
          input.asset_tag ?? null,
          input.name,
          input.serial_number ?? null,
          input.purchase_date ?? null,
          input.purchase_cost ?? null,
          input.is_active === false ? 0 : 1
        ]
      );

      const fixed_assets = await findFixedAssetByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!fixed_assets) {
        throw new Error("Created fixed_assets not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: fixed_assets.outlet_id,
        actor,
        action: masterDataAuditActions.fixedAssetCreate,
        payload: {
          equipment_id: fixed_assets.id,
          after: fixed_assets
        }
      });

      return fixed_assets;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed_assets");
      }

      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }

      throw error;
    }
  });
}

export async function updateFixedAsset(
  companyId: number,
  assetId: number,
  input: {
    outlet_id?: number | null;
    category_id?: number | null;
    asset_tag?: string | null;
    name?: string;
    serial_number?: string | null;
    purchase_date?: string | null;
    purchase_cost?: number | null;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (Object.hasOwn(input, "asset_tag")) {
    fields.push("asset_tag = ?");
    values.push(input.asset_tag ?? null);
  }

  if (typeof input.name === "string") {
    fields.push("name = ?");
    values.push(input.name);
  }

  if (Object.hasOwn(input, "serial_number")) {
    fields.push("serial_number = ?");
    values.push(input.serial_number ?? null);
  }

  if (Object.hasOwn(input, "purchase_date")) {
    fields.push("purchase_date = ?");
    values.push(input.purchase_date ?? null);
  }

  if (Object.hasOwn(input, "purchase_cost")) {
    fields.push("purchase_cost = ?");
    values.push(input.purchase_cost ?? null);
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findFixedAssetByIdWithExecutor(connection, companyId, assetId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (Object.hasOwn(input, "outlet_id")) {
      if (typeof input.outlet_id === "number") {
        await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
        }
      }
      fields.push("outlet_id = ?");
      values.push(input.outlet_id ?? null);
    }

    if (Object.hasOwn(input, "category_id")) {
      if (typeof input.category_id === "number") {
        await ensureCompanyFixedAssetCategoryExists(connection, companyId, input.category_id);
      }
      fields.push("category_id = ?");
      values.push(input.category_id ?? null);
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, assetId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE fixed_assets
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const fixed_assets = await findFixedAssetByIdWithExecutor(connection, companyId, assetId);
      if (!fixed_assets) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: fixed_assets.outlet_id,
        actor,
        action: masterDataAuditActions.fixedAssetUpdate,
        payload: {
          equipment_id: fixed_assets.id,
          before,
          after: fixed_assets
        }
      });

      return fixed_assets;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate fixed_assets");
      }

      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }

      throw error;
    }
  });
}

export async function deleteFixedAsset(
  companyId: number,
  assetId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findFixedAssetByIdWithExecutor(connection, companyId, assetId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    if (actor && before.outlet_id != null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM fixed_assets
       WHERE company_id = ?
         AND id = ?`,
      [companyId, assetId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: masterDataAuditActions.fixedAssetDelete,
      payload: {
        equipment_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function createItemPrice(
  companyId: number,
  input: {
    item_id: number;
    outlet_id: number | null;
    price: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  return withTransaction(async (connection) => {
    if (input.outlet_id === null && actor && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    await ensureCompanyItemExists(connection, companyId, input.item_id);
    
    // Only validate outlet if outlet_id is provided (non-NULL = outlet override)
    if (input.outlet_id !== null) {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.item_id,
          input.price,
          input.is_active === false ? 0 : 1
        ]
      );

      const itemPrice = await findItemPriceByIdWithExecutor(connection, companyId, Number(result.insertId));
      if (!itemPrice) {
        throw new Error("Created item price not found");
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: itemPrice.outlet_id,
        actor,
        action: masterDataAuditActions.itemPriceCreate,
        payload: {
          item_price_id: itemPrice.id,
          after: itemPrice
        }
      });

      return itemPrice;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item price");
      }

      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }

      throw error;
    }
  });
}

export async function updateItemPrice(
  companyId: number,
  itemPriceId: number,
  input: {
    item_id?: number;
    outlet_id?: number | null;
    price?: number;
    is_active?: boolean;
  },
  actor?: MutationAuditActor
) {
  const fields: string[] = [];
  const values: Array<number | null> = [];

  if (typeof input.price === "number") {
    fields.push("price = ?");
    values.push(input.price);
  }

  if (typeof input.is_active === "boolean") {
    fields.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }

  return withTransaction(async (connection) => {
    const before = await findItemPriceByIdWithExecutor(connection, companyId, itemPriceId, {
      forUpdate: true
    });
    if (!before) {
      return null;
    }

    // Check outlet access for existing price (if it's an outlet override)
    if (actor && before.outlet_id !== null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (actor && before.outlet_id === null && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    if (typeof input.item_id === "number") {
      await ensureCompanyItemExists(connection, companyId, input.item_id);
      fields.push("item_id = ?");
      values.push(input.item_id);
    }

    // Handle outlet_id update (can be null for company default or number for outlet override)
    if (Object.hasOwn(input, "outlet_id")) {
      if (input.outlet_id === null) {
        if (actor && actor.canManageCompanyDefaults !== true) {
          throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
        }
        // Changing to company default
        fields.push("outlet_id = ?");
        values.push(null);
      } else if (typeof input.outlet_id === "number") {
        // Changing to outlet override
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
        }
        await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
        fields.push("outlet_id = ?");
        values.push(input.outlet_id);
      }
    }

    if (fields.length === 0) {
      return before;
    }

    values.push(companyId, itemPriceId);

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE item_prices
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        values
      );

      const itemPrice = await findItemPriceByIdWithExecutor(connection, companyId, itemPriceId);
      if (!itemPrice) {
        return null;
      }

      await recordMasterDataAuditLog(connection, {
        companyId,
        outletId: itemPrice.outlet_id,
        actor,
        action: masterDataAuditActions.itemPriceUpdate,
        payload: {
          item_price_id: itemPrice.id,
          before,
          after: itemPrice
        }
      });

      return itemPrice;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate item price");
      }

      if (isMysqlError(error) && error.errno === mysqlForeignKeyErrorCode) {
        throw new DatabaseReferenceError("Invalid company references");
      }

      throw error;
    }
  });
}

export async function deleteItemPrice(
  companyId: number,
  itemPriceId: number,
  actor?: MutationAuditActor
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const before = await findItemPriceByIdWithExecutor(connection, companyId, itemPriceId, {
      forUpdate: true
    });
    if (!before) {
      return false;
    }

    // Check outlet access only if deleting an outlet override (not company default)
    if (actor && before.outlet_id !== null) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, before.outlet_id);
    }

    if (actor && before.outlet_id === null && actor.canManageCompanyDefaults !== true) {
      throw new DatabaseForbiddenError("Company defaults require OWNER or COMPANY_ADMIN role");
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM item_prices
       WHERE company_id = ?
         AND id = ?`,
      [companyId, itemPriceId]
    );

    await recordMasterDataAuditLog(connection, {
      companyId,
      outletId: before.outlet_id,
      actor,
      action: masterDataAuditActions.itemPriceDelete,
      payload: {
        item_price_id: before.id,
        before
      }
    });

    return true;
  });
}

export async function getCompanyDataVersion(companyId: number): Promise<number> {
  const pool = getDbPool();
  const [rows] = await pool.execute<VersionRow[]>(
    `SELECT current_version
     FROM sync_data_versions
     WHERE company_id = ?
     LIMIT 1`,
    [companyId]
  );

  return Number(rows[0]?.current_version ?? 0);
}

async function readSyncConfig(companyId: number): Promise<SyncPullResponse["data"]["config"]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<CompanyModuleRow[]>(
    `SELECT cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ?
       AND m.code = 'pos'
     LIMIT 1`,
    [companyId]
  );

  const [taxRates, defaultTaxRates] = await Promise.all([
    listCompanyTaxRates(pool, companyId),
    listCompanyDefaultTaxRates(pool, companyId)
  ]);

  const activeTaxRates = taxRates.filter((rate) => rate.is_active);
  const defaultTaxRateIds = defaultTaxRates.map((rate) => rate.id);
  const combinedTax = resolveCombinedTaxConfig(defaultTaxRates);

  let taxRate = combinedTax.rate;
  let taxInclusive = combinedTax.inclusive;
  let paymentMethods: Array<string | z.infer<typeof paymentMethodConfigSchema>> = ["CASH"];
  let resolvedPaymentMethods = false;

  const posRow = rows[0];
  if (posRow && posRow.enabled === 1) {
    let parsed: unknown = null;
    try {
      parsed = typeof posRow.config_json === "string" ? JSON.parse(posRow.config_json) : null;
    } catch {
      parsed = null;
    }

    const candidate =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).payment_methods ?? parsed
        : parsed;
    const normalized = normalizePaymentMethods(candidate);
    if (normalized) {
      paymentMethods = normalized;
      resolvedPaymentMethods = true;
    }
  }

  if ((!posRow || (posRow.enabled === 1 && !resolvedPaymentMethods)) && !resolvedPaymentMethods) {
    const legacyPaymentMethods = await readLegacyPaymentMethods(pool, companyId);
    if (legacyPaymentMethods) {
      paymentMethods = legacyPaymentMethods;
    }
  }

  return SyncPullConfigSchema.parse({
    tax: {
      rate: taxRate,
      inclusive: taxInclusive
    },
    tax_rates: activeTaxRates.map((rate) => ({
      id: rate.id,
      code: rate.code,
      name: rate.name,
      rate_percent: rate.rate_percent,
      account_id: rate.account_id,
      is_inclusive: rate.is_inclusive,
      is_active: rate.is_active
    })),
    default_tax_rate_ids: defaultTaxRateIds,
    payment_methods: paymentMethods
  });
}

export async function buildSyncPullPayload(
  companyId: number,
  outletId: number,
  sinceVersion: number,
  ordersCursor: number = 0
): Promise<SyncPullPayload> {
  const currentVersion = await getCompanyDataVersion(companyId);
  const config = await readSyncConfig(companyId);

  if (currentVersion <= sinceVersion) {
    const [openOrderSync, tables, reservations] = await Promise.all([
      readOpenOrderSyncPayload(companyId, outletId, ordersCursor),
      listOutletTables(companyId, outletId),
      listActiveReservations(companyId, outletId)
    ]);
    return {
      data_version: currentVersion,
      items: [],
      item_groups: [],
      prices: [],
      config,
      open_orders: openOrderSync.open_orders,
      open_order_lines: openOrderSync.open_order_lines,
      order_updates: openOrderSync.order_updates,
      orders_cursor: openOrderSync.orders_cursor,
      tables,
      reservations
    };
  }

  const [items, effectivePrices, itemGroups, tables, reservations] = await Promise.all([
    listItems(companyId, { isActive: true }),
    listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true }),
    listItemGroups(companyId),
    listOutletTables(companyId, outletId),
    listActiveReservations(companyId, outletId)
  ]);

  const openOrderSync = await readOpenOrderSyncPayload(companyId, outletId, ordersCursor);

  return {
    data_version: currentVersion,
    items: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      type: item.type,
      item_group_id: item.item_group_id,
      is_active: item.is_active,
      updated_at: item.updated_at
    })),
    item_groups: itemGroups.map((group) => ({
      id: group.id,
      parent_id: group.parent_id,
      code: group.code,
      name: group.name,
      is_active: group.is_active,
      updated_at: group.updated_at
    })),
    prices: effectivePrices.map((price) => ({
      id: price.id,
      item_id: price.item_id,
      outlet_id: price.outlet_id,
      price: price.price,
      is_active: price.is_active,
      updated_at: price.updated_at
    })),
    config,
    open_orders: openOrderSync.open_orders,
    open_order_lines: openOrderSync.open_order_lines,
    order_updates: openOrderSync.order_updates,
    orders_cursor: openOrderSync.orders_cursor,
    tables,
    reservations
  };
}

async function readOpenOrderSyncPayload(
  companyId: number,
  outletId: number,
  ordersCursor: number
): Promise<{
  open_orders: SyncPullPayload["open_orders"];
  open_order_lines: SyncPullPayload["open_order_lines"];
  order_updates: SyncPullPayload["order_updates"];
  orders_cursor: number;
}> {
  const pool = getDbPool();

  try {
    const [ordersRows, linesRows, updatesRows] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT order_id, company_id, outlet_id, service_type, source_flow, settlement_flow, table_id, reservation_id, guest_count,
                is_finalized, order_status, order_state, paid_amount, opened_at, closed_at, notes, updated_at
         FROM pos_order_snapshots
         WHERE company_id = ?
           AND outlet_id = ?
           AND order_state = 'OPEN'
         ORDER BY updated_at DESC`,
        [companyId, outletId]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT order_id, company_id, outlet_id, item_id, sku_snapshot, name_snapshot, item_type_snapshot,
                unit_price_snapshot, qty, discount_amount, updated_at
         FROM pos_order_snapshot_lines
         WHERE company_id = ?
           AND outlet_id = ?`,
        [companyId, outletId]
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT sequence_no, update_id, order_id, company_id, outlet_id, base_order_updated_at, event_type,
                delta_json, actor_user_id, device_id, event_at, created_at
         FROM pos_order_updates
         WHERE company_id = ?
           AND outlet_id = ?
           AND sequence_no > ?
         ORDER BY sequence_no ASC`,
        [companyId, outletId, ordersCursor]
      )
    ]);

    const orderUpdates = (updatesRows[0] as RowDataPacket[]).map((row) => ({
      sequence_no: Number(row.sequence_no),
      update_id: String(row.update_id),
      order_id: String(row.order_id),
      company_id: Number(row.company_id),
      outlet_id: Number(row.outlet_id),
      base_order_updated_at: row.base_order_updated_at ? row.base_order_updated_at : null,
      event_type: String(row.event_type) as SyncPullPayload["order_updates"][number]["event_type"],
      delta_json: String(row.delta_json),
      actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
      device_id: String(row.device_id),
      event_at: row.event_at,
      created_at: row.created_at
    }));

    const nextCursor = orderUpdates.length > 0 ? orderUpdates[orderUpdates.length - 1].sequence_no : ordersCursor;

    return {
      open_orders: (ordersRows[0] as RowDataPacket[]).map((row) => ({
        order_id: String(row.order_id),
        company_id: Number(row.company_id),
        outlet_id: Number(row.outlet_id),
        service_type: String(row.service_type) as SyncPullPayload["open_orders"][number]["service_type"],
        source_flow: row.source_flow == null ? undefined : String(row.source_flow) as SyncPullPayload["open_orders"][number]["source_flow"],
        settlement_flow: row.settlement_flow == null ? undefined : String(row.settlement_flow) as SyncPullPayload["open_orders"][number]["settlement_flow"],
        table_id: row.table_id == null ? null : Number(row.table_id),
        reservation_id: row.reservation_id == null ? null : Number(row.reservation_id),
        guest_count: row.guest_count == null ? null : Number(row.guest_count),
        is_finalized: Number(row.is_finalized) === 1,
        order_status: String(row.order_status) as SyncPullPayload["open_orders"][number]["order_status"],
        order_state: String(row.order_state) as SyncPullPayload["open_orders"][number]["order_state"],
        paid_amount: Number(row.paid_amount),
        opened_at: row.opened_at,
        closed_at: row.closed_at ? row.closed_at : null,
        notes: row.notes == null ? null : String(row.notes),
        updated_at: row.updated_at
      })),
      open_order_lines: (linesRows[0] as RowDataPacket[]).map((row) => ({
        order_id: String(row.order_id),
        company_id: Number(row.company_id),
        outlet_id: Number(row.outlet_id),
        item_id: Number(row.item_id),
        sku_snapshot: row.sku_snapshot == null ? null : String(row.sku_snapshot),
        name_snapshot: String(row.name_snapshot),
        item_type_snapshot: String(row.item_type_snapshot) as SyncPullPayload["open_order_lines"][number]["item_type_snapshot"],
        unit_price_snapshot: Number(row.unit_price_snapshot),
        qty: Number(row.qty),
        discount_amount: Number(row.discount_amount),
        updated_at: row.updated_at
      })),
      order_updates: orderUpdates,
      orders_cursor: nextCursor
    };
  } catch (error) {
    if (isMysqlError(error) && (error as { code?: string }).code === "ER_NO_SUCH_TABLE") {
      return {
        open_orders: [],
        open_order_lines: [],
        order_updates: [],
        orders_cursor: ordersCursor
      };
    }

    throw error;
  }
}
