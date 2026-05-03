// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplies Service Implementation
 * 
 * Core supplies management with database transaction support.
 * All methods enforce company_id scoping.
 */

import { toUtcIso } from "@jurnapod/shared";
import { withTransactionRetry } from "@jurnapod/db";
import type { KyselySchema } from "@jurnapod/db";
import { getInventoryDb } from "../db.js";
import type {
  SuppliesService,
  Supply,
  CreateSupplyInput,
  UpdateSupplyInput,
  ListSuppliesFilters
} from "../interfaces/supplies-service.js";
import {
  InventoryConflictError
} from "../errors.js";

// Re-export error classes for API compatibility
export { InventoryConflictError };

// Row type
type SupplyRow = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: number;
  updated_at: string | Date;
};

// Normalize row to Supply type
function normalizeSupply(row: SupplyRow): Supply {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    is_active: row.is_active === 1,
    updated_at: toUtcIso.dateLike(row.updated_at)!,
  };
}

// Find supply by ID helper
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

// Audit log helper
async function recordSupplyAuditLog(
  db: KyselySchema,
  input: {
    companyId: number;
    actor?: { userId: number };
    action: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await db
    .insertInto("audit_logs")
    .values({
      company_id: input.companyId,
      outlet_id: null,
      user_id: input.actor?.userId ?? null,
      action: input.action,
      result: "SUCCESS",
      success: 1,
      ip_address: null,
      payload_json: JSON.stringify(input.payload)
    })
    .execute();
}

// MySQL duplicate error code
const mysqlDuplicateErrorCode = 1062;

// Type guard for MySQL errors
function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

// Supplies Service Implementation
export class SuppliesServiceImpl implements SuppliesService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * List all supplies for a company.
   */
  async listSupplies(companyId: number, filters?: ListSuppliesFilters): Promise<Supply[]> {
    let query = this.db
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

  /**
   * Find a supply by ID.
   */
  async findSupplyById(companyId: number, supplyId: number): Promise<Supply | null> {
    return findSupplyByIdWithExecutor(this.db, companyId, supplyId);
  }

  /**
   * Create a new supply.
   */
  async createSupply(
    companyId: number,
    input: CreateSupplyInput,
    actor?: { userId: number }
  ): Promise<Supply> {
    return withTransactionRetry(this.db, async (trx) => {
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
          action: "MASTER_DATA_SUPPLY_CREATE",
          payload: {
            supply_id: supply.id,
            after: supply
          }
        });

        return supply;
      } catch (error) {
        if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
          throw new InventoryConflictError("Duplicate supply");
        }
        throw error;
      }
    });
  }

  /**
   * Update an existing supply.
   */
  async updateSupply(
    companyId: number,
    supplyId: number,
    input: UpdateSupplyInput,
    actor?: { userId: number }
  ): Promise<Supply | null> {
    return withTransactionRetry(this.db, async (trx) => {
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
          action: "MASTER_DATA_SUPPLY_UPDATE",
          payload: {
            supply_id: supply.id,
            before,
            after: supply
          }
        });

        return supply;
      } catch (error) {
        if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
          throw new InventoryConflictError("Duplicate supply");
        }
        throw error;
      }
    });
  }

  /**
   * Delete a supply.
   */
  async deleteSupply(
    companyId: number,
    supplyId: number,
    actor?: { userId: number }
  ): Promise<boolean> {
    return withTransactionRetry(this.db, async (trx) => {
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
        action: "MASTER_DATA_SUPPLY_DELETE",
        payload: {
          supply_id: before.id,
          before
        }
      });

      return true;
    });
  }
}

// Re-export types
export type {
  Supply,
  CreateSupplyInput,
  UpdateSupplyInput,
  ListSuppliesFilters
} from "../interfaces/supplies-service.js";

// Default singleton instance for convenience
export const suppliesService = new SuppliesServiceImpl(getInventoryDb());
