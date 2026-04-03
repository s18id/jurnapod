// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Asset Repository
 *
 * Database access layer for all fixed-asset related tables:
 * - fixed_asset_categories
 * - fixed_assets
 * - fixed_asset_books
 * - fixed_asset_events
 * - fixed_asset_disposals
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type {
  FixedAssetCategory,
  FixedAssetCategoryCreateInput,
  FixedAssetCategoryUpdateInput,
  FixedAssetCategoryFilters,
  FixedAsset,
  FixedAssetCreateInput,
  FixedAssetUpdateInput,
  FixedAssetFilters,
  AssetBook,
  AssetBookUpsertInput,
  LifecycleEvent,
  LifecycleEventCreateInput,
  LifecycleEventFilters,
  DepreciationPlan,
  DepreciationPlanCreateInput,
  DepreciationPlanFilters,
  DepreciationRun,
  DepreciationRunCreateInput,
  DepreciationRunFilters,
} from "../interfaces/types.js";

/**
 * Normalize a fixed_asset_categories DB row to domain type.
 */
function normalizeCategory(row: Record<string, unknown>): FixedAssetCategory {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: String(row.code),
    name: String(row.name),
    depreciation_method: String(row.depreciation_method),
    useful_life_months: Number(row.useful_life_months),
    residual_value_pct: String(row.residual_value_pct),
    accum_depr_account_id: row.accum_depr_account_id == null ? null : Number(row.accum_depr_account_id),
    expense_account_id: row.expense_account_id == null ? null : Number(row.expense_account_id),
    is_active: row.is_active === 1,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * Normalize a fixed_assets DB row to domain type.
 */
function normalizeAsset(row: Record<string, unknown>): FixedAsset {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
    category_id: row.category_id == null ? null : Number(row.category_id),
    asset_tag: row.asset_tag as string | null,
    name: String(row.name),
    serial_number: row.serial_number as string | null,
    purchase_cost: row.purchase_cost as string | null,
    purchase_date: row.purchase_date as Date | null,
    disposed_at: row.disposed_at as Date | null,
    is_active: row.is_active === 1,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * Normalize a fixed_asset_books DB row to domain type.
 */
function normalizeAssetBook(row: Record<string, unknown>): AssetBook {
  return {
    id: Number(row.id),
    asset_id: Number(row.asset_id),
    company_id: Number(row.company_id),
    cost_basis: String(row.cost_basis),
    accum_depreciation: String(row.accum_depreciation),
    accum_impairment: String(row.accum_impairment),
    carrying_amount: String(row.carrying_amount),
    last_event_id: Number(row.last_event_id),
    as_of_date: row.as_of_date as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * FixedAssetRepository provides database operations for fixed assets.
 */
export class FixedAssetRepository {
  constructor(private readonly db: KyselySchema) {}

  // -------------------------------------------------------------------------
  // Category Operations
  // -------------------------------------------------------------------------

  async listCategories(
    companyId: number,
    filters?: FixedAssetCategoryFilters
  ): Promise<FixedAssetCategory[]> {
    let query = this.db
      .selectFrom("fixed_asset_categories")
      .where("company_id", "=", companyId)
      .select([
        "id", "company_id", "code", "name", "depreciation_method",
        "useful_life_months", "residual_value_pct", "expense_account_id",
        "accum_depr_account_id", "is_active", "created_at", "updated_at"
      ])
      .orderBy("id", "asc");

    if (filters?.is_active !== undefined) {
      query = query.where("is_active", "=", filters.is_active ? 1 : 0);
    }

    const rows = await query.execute();
    return rows.map((row) => normalizeCategory(row as Record<string, unknown>));
  }

  async findCategoryById(id: number, companyId: number): Promise<FixedAssetCategory | null> {
    const row = await this.db
      .selectFrom("fixed_asset_categories")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "company_id", "code", "name", "depreciation_method",
        "useful_life_months", "residual_value_pct", "expense_account_id",
        "accum_depr_account_id", "is_active", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return normalizeCategory(row as Record<string, unknown>);
  }

  async findCategoryByCode(code: string, companyId: number): Promise<FixedAssetCategory | null> {
    const row = await this.db
      .selectFrom("fixed_asset_categories")
      .where("code", "=", code)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "company_id", "code", "name", "depreciation_method",
        "useful_life_months", "residual_value_pct", "expense_account_id",
        "accum_depr_account_id", "is_active", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return normalizeCategory(row as Record<string, unknown>);
  }

  async createCategory(input: FixedAssetCategoryCreateInput): Promise<FixedAssetCategory> {
    const result = await this.db
      .insertInto("fixed_asset_categories")
      .values({
        company_id: input.company_id,
        code: input.code,
        name: input.name,
        depreciation_method: input.depreciation_method ?? "STRAIGHT_LINE",
        useful_life_months: input.useful_life_months,
        residual_value_pct: input.residual_value_pct ?? "0",
        expense_account_id: input.expense_account_id ?? null,
        accum_depr_account_id: input.accum_depr_account_id ?? null,
        is_active: 1,
      })
      .executeTakeFirst();

    const id = Number(result.insertId);
    const created = await this.findCategoryById(id, input.company_id);
    if (!created) throw new Error("Failed to create fixed asset category");
    return created;
  }

  async updateCategory(
    id: number,
    companyId: number,
    input: FixedAssetCategoryUpdateInput
  ): Promise<FixedAssetCategory> {
    const updateData: Record<string, unknown> = {};

    if (input.code !== undefined) updateData.code = input.code;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.depreciation_method !== undefined) updateData.depreciation_method = input.depreciation_method;
    if (input.useful_life_months !== undefined) updateData.useful_life_months = input.useful_life_months;
    if (input.residual_value_pct !== undefined) updateData.residual_value_pct = input.residual_value_pct;
    if (input.expense_account_id !== undefined) updateData.expense_account_id = input.expense_account_id;
    if (input.accum_depr_account_id !== undefined) updateData.accum_depr_account_id = input.accum_depr_account_id;
    if (input.is_active !== undefined) updateData.is_active = input.is_active ? 1 : 0;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .updateTable("fixed_asset_categories")
        .set(updateData)
        .where("id", "=", id)
        .where("company_id", "=", companyId)
        .execute();
    }

    const updated = await this.findCategoryById(id, companyId);
    if (!updated) throw new Error("Failed to update fixed asset category");
    return updated;
  }

  async deleteCategory(id: number, companyId: number): Promise<void> {
    await this.db
      .deleteFrom("fixed_asset_categories")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();
  }

  async countAssetsByCategory(categoryId: number, companyId: number): Promise<number> {
    const result = await this.db
      .selectFrom("fixed_assets")
      .where("category_id", "=", categoryId)
      .where("company_id", "=", companyId)
      .select(sql<string>`count(*)`.as("cnt"))
      .executeTakeFirst();
    return Number(result?.cnt ?? 0);
  }

  // -------------------------------------------------------------------------
  // Asset Operations
  // -------------------------------------------------------------------------

  async listAssets(companyId: number, filters?: FixedAssetFilters): Promise<FixedAsset[]> {
    let query = this.db
      .selectFrom("fixed_assets")
      .where("company_id", "=", companyId)
      .select([
        "id", "company_id", "outlet_id", "category_id", "asset_tag", "name",
        "serial_number", "purchase_cost", "purchase_date",
        "disposed_at", "is_active", "created_at", "updated_at"
      ])
      .orderBy("id", "asc");

    if (filters?.outlet_id !== undefined && filters.outlet_id !== null) {
      query = query.where("outlet_id", "=", filters.outlet_id);
    }

    if (filters?.category_id !== undefined && filters.category_id !== null) {
      query = query.where("category_id", "=", filters.category_id);
    }

    if (filters?.is_active !== undefined) {
      query = query.where("is_active", "=", filters.is_active ? 1 : 0);
    }

    if (filters?.allowedOutletIds !== undefined) {
      if (filters.allowedOutletIds.length > 0) {
        query = query.where((eb) =>
          eb.or([
            eb("outlet_id", "is", null),
            eb("outlet_id", "in", filters.allowedOutletIds!)
          ])
        );
      } else {
        query = query.where("outlet_id", "is", null);
      }
    }

    const rows = await query.execute();
    return rows.map((row) => normalizeAsset(row as Record<string, unknown>));
  }

  async findAssetById(id: number, companyId: number): Promise<FixedAsset | null> {
    const row = await this.db
      .selectFrom("fixed_assets")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "company_id", "outlet_id", "category_id", "asset_tag", "name",
        "serial_number", "purchase_cost", "purchase_date",
        "disposed_at", "is_active", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return normalizeAsset(row as Record<string, unknown>);
  }

  async findAssetByTag(assetTag: string, companyId: number): Promise<FixedAsset | null> {
    const row = await this.db
      .selectFrom("fixed_assets")
      .where("asset_tag", "=", assetTag)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "company_id", "outlet_id", "category_id", "asset_tag", "name",
        "serial_number", "purchase_cost", "purchase_date",
        "disposed_at", "is_active", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return normalizeAsset(row as Record<string, unknown>);
  }

  async createAsset(input: FixedAssetCreateInput): Promise<FixedAsset> {
    const result = await this.db
      .insertInto("fixed_assets")
      .values({
        company_id: input.company_id,
        outlet_id: input.outlet_id ?? null,
        category_id: input.category_id ?? null,
        asset_tag: input.asset_tag ?? null,
        name: input.name,
        serial_number: input.serial_number ?? null,
        purchase_cost: input.purchase_cost ?? null,
        purchase_date: input.purchase_date ?? null,
        is_active: 1,
      })
      .executeTakeFirst();

    const id = Number(result.insertId);
    const created = await this.findAssetById(id, input.company_id);
    if (!created) throw new Error("Failed to create fixed asset");
    return created;
  }

  async updateAsset(
    id: number,
    companyId: number,
    input: FixedAssetUpdateInput
  ): Promise<FixedAsset> {
    const updateData: Record<string, unknown> = {};

    if (input.outlet_id !== undefined) updateData.outlet_id = input.outlet_id;
    if (input.category_id !== undefined) updateData.category_id = input.category_id;
    if (input.asset_tag !== undefined) updateData.asset_tag = input.asset_tag;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.serial_number !== undefined) updateData.serial_number = input.serial_number;
    if (input.purchase_cost !== undefined) updateData.purchase_cost = input.purchase_cost;
    if (input.purchase_date !== undefined) updateData.purchase_date = input.purchase_date;
    if (input.is_active !== undefined) updateData.is_active = input.is_active ? 1 : 0;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .updateTable("fixed_assets")
        .set(updateData)
        .where("id", "=", id)
        .where("company_id", "=", companyId)
        .execute();
    }

    const updated = await this.findAssetById(id, companyId);
    if (!updated) throw new Error("Failed to update fixed asset");
    return updated;
  }

  async deleteAsset(id: number, companyId: number): Promise<void> {
    await this.db
      .deleteFrom("fixed_assets")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();
  }

  async countAssetEvents(assetId: number, companyId: number): Promise<number> {
    const result = await this.db
      .selectFrom("fixed_asset_events")
      .where("asset_id", "=", assetId)
      .where("company_id", "=", companyId)
      .select(sql<string>`count(*)`.as("cnt"))
      .executeTakeFirst();
    return Number(result?.cnt ?? 0);
  }

  // -------------------------------------------------------------------------
  // Asset Book Operations
  // -------------------------------------------------------------------------

  async findBookByAssetId(assetId: number, companyId: number): Promise<AssetBook | null> {
    const row = await this.db
      .selectFrom("fixed_asset_books")
      .where("asset_id", "=", assetId)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "asset_id", "company_id", "cost_basis", "accum_depreciation",
        "accum_impairment", "carrying_amount", "last_event_id", "as_of_date", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return normalizeAssetBook(row as Record<string, unknown>);
  }

  async upsertAssetBook(
    assetId: number,
    companyId: number,
    input: AssetBookUpsertInput
  ): Promise<AssetBook> {
    const existing = await this.findBookByAssetId(assetId, companyId);

    if (existing) {
      await this.db
        .updateTable("fixed_asset_books")
        .set({
          cost_basis: input.cost_basis,
          accum_depreciation: input.accum_depreciation,
          accum_impairment: input.accum_impairment,
          carrying_amount: input.carrying_amount,
          last_event_id: input.last_event_id,
          as_of_date: input.as_of_date,
        })
        .where("asset_id", "=", assetId)
        .where("company_id", "=", companyId)
        .execute();
    } else {
      await this.db
        .insertInto("fixed_asset_books")
        .values({
          asset_id: assetId,
          company_id: companyId,
          cost_basis: input.cost_basis,
          accum_depreciation: input.accum_depreciation,
          accum_impairment: input.accum_impairment,
          carrying_amount: input.carrying_amount,
          last_event_id: input.last_event_id,
          as_of_date: input.as_of_date,
        })
        .execute();
    }

    const updated = await this.findBookByAssetId(assetId, companyId);
    if (!updated) throw new Error("Failed to upsert asset book");
    return updated;
  }

  // -------------------------------------------------------------------------
  // Lifecycle Event Operations
  // -------------------------------------------------------------------------

  async listLifecycleEvents(
    companyId: number,
    filters?: LifecycleEventFilters
  ): Promise<LifecycleEvent[]> {
    let query = this.db
      .selectFrom("fixed_asset_events")
      .where("company_id", "=", companyId)
      .select([
        "id", "asset_id", "company_id", "outlet_id", "event_type", "event_date",
        "event_data", "created_by", "journal_batch_id", "status", "idempotency_key",
        "voided_at", "voided_by", "created_at"
      ])
      .orderBy("id", "asc");

    if (filters?.asset_id !== undefined) {
      query = query.where("asset_id", "=", filters.asset_id);
    }

    if (filters?.event_type !== undefined) {
      query = query.where("event_type", "=", filters.event_type);
    }

    if (filters?.status !== undefined) {
      query = query.where("status", "=", filters.status);
    }

    const rows = await query.execute();
    return rows as unknown as LifecycleEvent[];
  }

  async findLifecycleEventById(id: number, companyId: number): Promise<LifecycleEvent | null> {
    const row = await this.db
      .selectFrom("fixed_asset_events")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "asset_id", "company_id", "outlet_id", "event_type", "event_date",
        "event_data", "created_by", "journal_batch_id", "status", "idempotency_key",
        "voided_at", "voided_by", "created_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return row as unknown as LifecycleEvent;
  }

  async findLifecycleEventByIdemKey(
    idempotencyKey: string,
    companyId: number
  ): Promise<LifecycleEvent | null> {
    const row = await this.db
      .selectFrom("fixed_asset_events")
      .where("idempotency_key", "=", idempotencyKey)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "asset_id", "company_id", "outlet_id", "event_type", "event_date",
        "event_data", "created_by", "journal_batch_id", "status", "idempotency_key",
        "voided_at", "voided_by", "created_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return row as unknown as LifecycleEvent;
  }

  async createLifecycleEvent(input: LifecycleEventCreateInput): Promise<LifecycleEvent> {
    const result = await this.db
      .insertInto("fixed_asset_events")
      .values({
        asset_id: input.asset_id,
        company_id: input.company_id,
        outlet_id: input.outlet_id ?? null,
        event_type: input.event_type,
        event_date: input.event_date,
        event_data: input.event_data ?? "",
        created_by: input.created_by,
        idempotency_key: input.idempotency_key,
        status: "PENDING",
      })
      .executeTakeFirst();

    const id = Number(result.insertId);
    const created = await this.findLifecycleEventById(id, input.company_id);
    if (!created) throw new Error("Failed to create lifecycle event");
    return created;
  }

  async voidLifecycleEvent(
    id: number,
    companyId: number,
    voidedBy: number
  ): Promise<LifecycleEvent> {
    await this.db
      .updateTable("fixed_asset_events")
      .set({
        status: "VOIDED",
        voided_at: new Date(),
        voided_by: voidedBy,
      })
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();

    const updated = await this.findLifecycleEventById(id, companyId);
    if (!updated) throw new Error("Failed to void lifecycle event");
    return updated;
  }

  // -------------------------------------------------------------------------
  // Depreciation Plan Operations
  // -------------------------------------------------------------------------

  async listDepreciationPlans(
    companyId: number,
    _filters?: DepreciationPlanFilters
  ): Promise<DepreciationPlan[]> {
    const rows = await this.db
      .selectFrom("asset_depreciation_plans")
      .where("company_id", "=", companyId)
      .select([
        "id", "company_id", "outlet_id", "asset_id", "method",
        "useful_life_months", "start_date", "expense_account_id",
        "accum_depr_account_id", "status", "created_at", "updated_at"
      ])
      .orderBy("id", "asc")
      .execute();

    return rows as unknown as DepreciationPlan[];
  }

  async findDepreciationPlanById(id: number, companyId: number): Promise<DepreciationPlan | null> {
    const row = await this.db
      .selectFrom("asset_depreciation_plans")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "company_id", "outlet_id", "asset_id", "method",
        "useful_life_months", "start_date", "expense_account_id",
        "accum_depr_account_id", "status", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return row as unknown as DepreciationPlan;
  }

  async findDepreciationPlanByAssetId(
    assetId: number,
    companyId: number
  ): Promise<DepreciationPlan | null> {
    const row = await this.db
      .selectFrom("asset_depreciation_plans")
      .where("asset_id", "=", assetId)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "company_id", "outlet_id", "asset_id", "method",
        "useful_life_months", "start_date", "expense_account_id",
        "accum_depr_account_id", "status", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return row as unknown as DepreciationPlan;
  }

  async createDepreciationPlan(input: DepreciationPlanCreateInput): Promise<DepreciationPlan> {
    const result = await this.db
      .insertInto("asset_depreciation_plans")
      .values({
        company_id: input.company_id,
        outlet_id: input.outlet_id ?? null,
        asset_id: input.asset_id,
        method: input.method,
        useful_life_months: input.useful_life_months,
        start_date: input.start_date,
        expense_account_id: input.expense_account_id,
        accum_depr_account_id: input.accum_depr_account_id,
        status: input.status ?? "DRAFT",
        purchase_cost_snapshot: String(input.purchase_cost_snapshot ?? 0),
        salvage_value: String(input.salvage_value ?? 0),
      })
      .executeTakeFirst();

    const id = Number(result.insertId);
    const created = await this.findDepreciationPlanById(id, input.company_id);
    if (!created) throw new Error("Failed to create depreciation plan");
    return created;
  }

  async updateDepreciationPlanStatus(
    id: number,
    companyId: number,
    status: string
  ): Promise<DepreciationPlan> {
    await this.db
      .updateTable("asset_depreciation_plans")
      .set({ status })
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();

    const updated = await this.findDepreciationPlanById(id, companyId);
    if (!updated) throw new Error("Failed to update depreciation plan status");
    return updated;
  }

  async listActiveDepreciationPlans(companyId: number): Promise<DepreciationPlan[]> {
    const rows = await this.db
      .selectFrom("asset_depreciation_plans")
      .where("company_id", "=", companyId)
      .where("status", "=", "ACTIVE")
      .select([
        "id", "company_id", "outlet_id", "asset_id", "method",
        "useful_life_months", "start_date", "expense_account_id",
        "accum_depr_account_id", "status", "created_at", "updated_at"
      ])
      .orderBy("id", "asc")
      .execute();

    return rows as unknown as DepreciationPlan[];
  }

  async updateDepreciationPlan(
    id: number,
    companyId: number,
    input: Partial<DepreciationPlan>
  ): Promise<DepreciationPlan> {
    const updateData: Record<string, unknown> = {};

    if (input.outlet_id !== undefined) updateData.outlet_id = input.outlet_id;
    if (input.method !== undefined) updateData.method = input.method;
    if (input.start_date !== undefined) updateData.start_date = input.start_date;
    if (input.useful_life_months !== undefined) updateData.useful_life_months = input.useful_life_months;
    if (input.salvage_value !== undefined) updateData.salvage_value = String(input.salvage_value);
    if (input.expense_account_id !== undefined) updateData.expense_account_id = input.expense_account_id;
    if (input.accum_depr_account_id !== undefined) updateData.accum_depr_account_id = input.accum_depr_account_id;
    if (input.status !== undefined) updateData.status = input.status;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .updateTable("asset_depreciation_plans")
        .set(updateData)
        .where("id", "=", id)
        .where("company_id", "=", companyId)
        .execute();
    }

    const updated = await this.findDepreciationPlanById(id, companyId);
    if (!updated) throw new Error("Failed to update depreciation plan");
    return updated;
  }

  async countPostedRuns(planId: number): Promise<number> {
    const result = await this.db
      .selectFrom("asset_depreciation_runs")
      .where("plan_id", "=", planId)
      .where("status", "=", "POSTED")
      .select(sql<string>`count(*)`.as("cnt"))
      .executeTakeFirst();
    return Number(result?.cnt ?? 0);
  }

  async getPostedRunSummary(planId: number): Promise<{ totalCount: number; totalAmount: number }> {
    const result = await sql<{ total_count: number; total_amount: number }>`
      SELECT 
        COUNT(*) AS total_count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM asset_depreciation_runs
      WHERE plan_id = ${planId}
        AND status = 'POSTED'
    `.execute(this.db);

    const row = result.rows[0];
    return {
      totalCount: Number(row?.total_count ?? 0),
      totalAmount: Number(row?.total_amount ?? 0)
    };
  }

  // -------------------------------------------------------------------------
  // Depreciation Run Operations
  // -------------------------------------------------------------------------

  async listDepreciationRuns(
    companyId: number,
    _filters?: DepreciationRunFilters
  ): Promise<DepreciationRun[]> {
    const rows = await this.db
      .selectFrom("asset_depreciation_runs")
      .where("company_id", "=", companyId)
      .select([
        "id", "plan_id", "company_id", "run_date", "period_year",
        "period_month", "amount", "journal_batch_id", "status", "created_at", "updated_at"
      ])
      .orderBy("id", "asc")
      .execute();

    return rows as unknown as DepreciationRun[];
  }

  async findDepreciationRunById(id: number, companyId: number): Promise<DepreciationRun | null> {
    const row = await this.db
      .selectFrom("asset_depreciation_runs")
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .limit(1)
      .select([
        "id", "plan_id", "company_id", "run_date", "period_year",
        "period_month", "amount", "journal_batch_id", "status", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return row as unknown as DepreciationRun;
  }

  async findDepreciationRunByPeriod(
    planId: number,
    companyId: number,
    periodYear: number,
    periodMonth: number
  ): Promise<DepreciationRun | null> {
    const row = await this.db
      .selectFrom("asset_depreciation_runs")
      .where("plan_id", "=", planId)
      .where("company_id", "=", companyId)
      .where("period_year", "=", periodYear)
      .where("period_month", "=", periodMonth)
      .limit(1)
      .select([
        "id", "plan_id", "company_id", "run_date", "period_year",
        "period_month", "amount", "journal_batch_id", "status", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!row) return null;
    return row as unknown as DepreciationRun;
  }

  async createDepreciationRun(input: DepreciationRunCreateInput): Promise<DepreciationRun> {
    const result = await this.db
      .insertInto("asset_depreciation_runs")
      .values({
        plan_id: input.plan_id,
        company_id: input.company_id,
        run_date: input.run_date,
        period_year: input.period_year,
        period_month: input.period_month,
        amount: input.amount,
        status: "PENDING",
      })
      .executeTakeFirst();

    const id = Number(result.insertId);
    const created = await this.findDepreciationRunById(id, input.company_id);
    if (!created) throw new Error("Failed to create depreciation run");
    return created;
  }

  async updateDepreciationRunStatus(
    id: number,
    companyId: number,
    status: string,
    journalBatchId?: number
  ): Promise<DepreciationRun> {
    const updateData: Record<string, unknown> = { status };
    if (journalBatchId !== undefined) {
      updateData.journal_batch_id = journalBatchId;
    }

    await this.db
      .updateTable("asset_depreciation_runs")
      .set(updateData)
      .where("id", "=", id)
      .where("company_id", "=", companyId)
      .execute();

    const updated = await this.findDepreciationRunById(id, companyId);
    if (!updated) throw new Error("Failed to update depreciation run status");
    return updated;
  }
}
