// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb } from "./db";
import type { KyselySchema } from "@jurnapod/db";
import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/core";
import {
  ACCOUNT_MAPPING_TYPE_ID_BY_CODE,
  accountMappingIdToCode,
  type AccountMappingCode,
  type JournalLine,
  type PostingRequest,
  type PostingResult
} from "@jurnapod/shared";

// Constants
const MONEY_SCALE = 100;
const COGS_DOC_TYPE = "COGS";

// Custom error classes
export class CogsCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CogsCalculationError";
  }
}

export class CogsAccountConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CogsAccountConfigError";
  }
}

export class CogsPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CogsPostingError";
  }
}

// Interfaces
export interface CogsPostingInput {
  saleId: string;
  companyId: number;
  outletId: number;
  items: Array<{
    itemId: number;
    quantity: number;
    unitCost?: number;
    totalCost?: number;
  }>;
  saleDate: Date;
  postedBy: number;
}

export interface CogsPostingResult {
  success: boolean;
  journalBatchId?: number;
  totalCogs: number;
  errors?: string[];
}

export interface CogsItemDetail {
  itemId: number;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

interface ItemAccountMapping {
  cogsAccountId: number;
  inventoryAssetAccountId: number;
}

// Helper functions
function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromMinorUnits(value: number): number {
  return value / MONEY_SCALE;
}

function normalizeMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

function resolveMappingCode(row: { mapping_type_id?: number | null; mapping_key?: string | null }): AccountMappingCode | undefined {
  const fromId = accountMappingIdToCode(row.mapping_type_id);
  if (fromId) {
    return fromId;
  }

  if (typeof row.mapping_key === "string") {
    const normalized = row.mapping_key.trim().toUpperCase() as AccountMappingCode;
    if (ACCOUNT_MAPPING_TYPE_ID_BY_CODE[normalized]) {
      return normalized;
    }
  }

  return undefined;
}

function toBusinessDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new CogsPostingError("Invalid saleDate for COGS posting");
  }

  return value.toISOString().slice(0, 10);
}

async function hasColumn(
  db: KyselySchema,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await sql<{ column_exists: number }>`
    SELECT COUNT(*) AS column_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
  `.execute(db);

  return Number(result.rows[0]?.column_exists ?? 0) > 0;
}

/**
 * Calculate COGS for a sale by retrieving item costs from inventory.
 * Uses average cost method (can be enhanced for FIFO/LIFO in Story 4.6).
 */
export async function calculateSaleCogs(
  companyId: number,
  saleItems: Array<{ itemId: number; quantity: number }>,
  connection?: KyselySchema
): Promise<CogsItemDetail[]> {
  const db = connection ?? getDb();

  return await db.transaction().execute(async (trx) => {
    const inventoryHasUnitCost = await hasColumn(trx, "inventory_transactions", "unit_cost");
    const itemPricesHasBaseCost = await hasColumn(trx, "item_prices", "base_cost");
    const uniqueItemIds = Array.from(new Set(saleItems.map((item) => Number(item.itemId))));

    const stockByItemId = new Map<number, { quantityOnHand: number; totalCost: number }>();
    const latestPriceByItemId = new Map<number, { baseCost: number; price: number }>();

    if (uniqueItemIds.length > 0) {
      const stockSql = inventoryHasUnitCost
        ? sql<{ product_id: number | undefined; quantity_on_hand: number; total_cost: number }>`
            SELECT
              product_id,
              COALESCE(SUM(quantity_delta), 0) as quantity_on_hand,
              COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta * unit_cost ELSE 0 END), 0) as total_cost
            FROM inventory_transactions
            WHERE company_id = ${companyId} AND product_id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})
            GROUP BY product_id`
        : sql<{ product_id: number | undefined; quantity_on_hand: number; total_cost: number }>`
            SELECT
              product_id,
              COALESCE(SUM(quantity_delta), 0) as quantity_on_hand,
              0 as total_cost
            FROM inventory_transactions
            WHERE company_id = ${companyId} AND product_id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})
            GROUP BY product_id`;

      const stockResult = await stockSql.execute(trx);
      for (const row of stockResult.rows) {
        const productId = Number(row.product_id ?? 0);
        if (!productId) continue;
        stockByItemId.set(productId, {
          quantityOnHand: Number(row.quantity_on_hand ?? 0),
          totalCost: Number(row.total_cost ?? 0)
        });
      }

      const priceSql = itemPricesHasBaseCost
        ? sql<{ item_id: number; base_cost: number | null; price: number | null }>`
            SELECT item_id, base_cost, price
            FROM item_prices
            WHERE company_id = ${companyId} AND item_id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})
            ORDER BY item_id ASC, updated_at DESC, id DESC`
        : sql<{ item_id: number; base_cost: number | null; price: number | null }>`
            SELECT item_id, price
            FROM item_prices
            WHERE company_id = ${companyId} AND item_id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})
            ORDER BY item_id ASC, updated_at DESC, id DESC`;

      const priceResult = await priceSql.execute(trx);
      for (const row of priceResult.rows) {
        const itemId = Number(row.item_id ?? 0);
        if (!itemId || latestPriceByItemId.has(itemId)) continue;
        latestPriceByItemId.set(itemId, {
          baseCost: itemPricesHasBaseCost ? Number(row.base_cost ?? 0) : 0,
          price: Number(row.price ?? 0)
        });
      }
    }

    const cogsDetails: CogsItemDetail[] = [];

    for (const saleItem of saleItems) {
      const stock = stockByItemId.get(saleItem.itemId);
      const quantityOnHand = Number(stock?.quantityOnHand ?? 0);
      const totalCost = Number(stock?.totalCost ?? 0);

      // Calculate average cost
      let unitCost = 0;
      if (quantityOnHand > 0) {
        unitCost = totalCost / quantityOnHand;
      }

      // If no stock history, try to get cost from item prices
      if (unitCost === 0) {
        const priceRow = latestPriceByItemId.get(saleItem.itemId);
        if (priceRow) {
          const baseCost = priceRow.baseCost;
          const price = priceRow.price;
          unitCost = baseCost > 0 ? baseCost : price;
        }
      }

      // Validate we have a cost
      if (unitCost <= 0) {
        throw new CogsCalculationError(
          `Unable to determine cost for item ${saleItem.itemId}. No inventory history or pricing data available.`
        );
      }

      const totalItemCost = normalizeMoney(saleItem.quantity * unitCost);

      cogsDetails.push({
        itemId: saleItem.itemId,
        quantity: saleItem.quantity,
        unitCost: normalizeMoney(unitCost),
        totalCost: totalItemCost
      });
    }

    return cogsDetails;
  });
}

/**
 * Get COGS and Inventory Asset accounts for an item.
 * Falls back to company default accounts if item-level accounts not set.
 */
export async function getItemAccounts(
  companyId: number,
  itemId: number,
  connection?: KyselySchema
): Promise<ItemAccountMapping> {
  const mappings = await getItemAccountsBatch(companyId, [itemId], connection);
  const mapping = mappings.get(itemId);
  if (!mapping) {
    throw new CogsAccountConfigError(`Item ${itemId} not found in company ${companyId}`);
  }
  return mapping;
}

export async function getItemAccountsBatch(
  companyId: number,
  itemIds: readonly number[],
  connection?: KyselySchema
): Promise<Map<number, ItemAccountMapping>> {
  const db = connection ?? getDb();

  return await db.transaction().execute(async (trx) => {
    const uniqueItemIds = Array.from(new Set(itemIds.map(Number)));
    if (uniqueItemIds.length === 0) {
      return new Map();
    }

    const itemRowsResult = await sql<{ id: number; cogs_account_id: number | null; inventory_asset_account_id: number | null }>`
      SELECT id, cogs_account_id, inventory_asset_account_id
      FROM items
      WHERE company_id = ${companyId} AND id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})
    `.execute(trx);

    const itemRowById = new Map(itemRowsResult.rows.map((row) => [Number(row.id), row]));
    for (const itemId of uniqueItemIds) {
      if (!itemRowById.has(itemId)) {
        throw new CogsAccountConfigError(`Item ${itemId} not found in company ${companyId}`);
      }
    }

    let defaultCogsAccountId: number | null = null;
    let defaultInventoryAssetAccountId: number | null = null;
    if (itemRowsResult.rows.some((row: { cogs_account_id: number | null; inventory_asset_account_id: number | null }) => !row.cogs_account_id || !row.inventory_asset_account_id)) {
      const hasMappingTypeId = await hasColumn(trx, "company_account_mappings", "mapping_type_id");

      const companyRowsResult = hasMappingTypeId
        ? await sql<{ mapping_type_id: number | null; mapping_key: string | null; account_id: number | undefined }>`
            SELECT mapping_type_id, mapping_key, account_id
            FROM company_account_mappings
            WHERE company_id = ${companyId}
              AND (mapping_type_id IN (${sql`${ACCOUNT_MAPPING_TYPE_ID_BY_CODE.COGS_DEFAULT}`}, ${sql`${ACCOUNT_MAPPING_TYPE_ID_BY_CODE.INVENTORY_ASSET_DEFAULT}`}) OR mapping_key IN ('COGS_DEFAULT', 'INVENTORY_ASSET_DEFAULT'))`
          .execute(trx)
        : await sql<{ mapping_type_id: number | null; mapping_key: string | null; account_id: number | undefined }>`
            SELECT NULL AS mapping_type_id, mapping_key, account_id
            FROM company_account_mappings
            WHERE company_id = ${companyId}
              AND mapping_key IN ('COGS_DEFAULT', 'INVENTORY_ASSET_DEFAULT')`
          .execute(trx);

      const accountMap = new Map<string, number>();
      for (const row of companyRowsResult.rows) {
        const mappingCode = resolveMappingCode(row);
        if (mappingCode && row.account_id) {
          accountMap.set(mappingCode, Number(row.account_id));
        }
      }

      defaultCogsAccountId = accountMap.get('COGS_DEFAULT') ?? null;
      defaultInventoryAssetAccountId = accountMap.get('INVENTORY_ASSET_DEFAULT') ?? null;
    }

    const result = new Map<number, ItemAccountMapping>();
    const accountIdsToValidate = new Set<number>();

    for (const itemId of uniqueItemIds) {
      const row = itemRowById.get(itemId)!;
      const cogsAccountId = row.cogs_account_id ?? defaultCogsAccountId;
      const inventoryAssetAccountId = row.inventory_asset_account_id ?? defaultInventoryAssetAccountId;

      if (!cogsAccountId) {
        throw new CogsAccountConfigError(`No COGS account configured for item ${itemId} and no company default set`);
      }

      if (!inventoryAssetAccountId) {
        throw new CogsAccountConfigError(`No inventory asset account configured for item ${itemId} and no company default set`);
      }

      result.set(itemId, {
        cogsAccountId: Number(cogsAccountId),
        inventoryAssetAccountId: Number(inventoryAssetAccountId)
      });
      accountIdsToValidate.add(Number(cogsAccountId));
      accountIdsToValidate.add(Number(inventoryAssetAccountId));
    }

    const accountIds = Array.from(accountIdsToValidate);
    if (accountIds.length > 0) {
      const accountTypeRowsResult = await sql<{ account_id: number | undefined; account_type: string | null }>`
        SELECT a.id AS account_id, at.name AS account_type
        FROM accounts a
        JOIN account_types at ON a.account_type_id = at.id
        WHERE a.company_id = ${companyId} AND a.id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
      `.execute(trx);

      const accountTypeById = new Map(accountTypeRowsResult.rows.map((row: { account_id: number | undefined; account_type: string | null }) => [Number(row.account_id), row.account_type?.toUpperCase() ?? null]));

      for (const [itemId, mapping] of result.entries()) {
        const cogsType = accountTypeById.get(mapping.cogsAccountId);
        if (!cogsType) {
          throw new CogsAccountConfigError(`COGS account ${mapping.cogsAccountId} not found`);
        }
        if (cogsType !== 'EXPENSE') {
          throw new CogsAccountConfigError(`COGS account must be an expense account, got ${cogsType}`);
        }

        const invType = accountTypeById.get(mapping.inventoryAssetAccountId);
        if (!invType) {
          throw new CogsAccountConfigError(`Inventory asset account ${mapping.inventoryAssetAccountId} not found`);
        }
        if (invType !== 'ASSET') {
          throw new CogsAccountConfigError(`Inventory asset account must be an asset account, got ${invType}`);
        }
      }
    }

    return result;
  });
}

// Repository implementation for COGS posting
interface CogsPostingRepository extends PostingRepository {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  linkInventoryToJournalBatch(inventoryTransactionIds: number[], journalBatchId: number): Promise<void>;
}

class CogsRepository implements CogsPostingRepository {
  constructor(
    private readonly db: KyselySchema,
    private readonly lineDate: string
  ) {}

  async begin(): Promise<void> {
    // No-op: transaction is managed externally via Kysely's transaction wrapper
  }

  async commit(): Promise<void> {
    // No-op: transaction is managed externally via Kysely's transaction wrapper
  }

  async rollback(): Promise<void> {
    // No-op: transaction is managed externally via Kysely's transaction wrapper
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const result = await sql`
      INSERT INTO journal_batches (
        company_id,
        outlet_id,
        doc_type,
        doc_id,
        posted_at
      ) VALUES (${request.company_id}, ${request.outlet_id ?? null}, ${request.doc_type}, ${request.doc_id}, NOW())
    `.execute(this.db);

    const insertId = result.insertId;
    return { journal_batch_id: Number(insertId) };
  }

  async insertJournalLines(
    journalBatchId: number,
    request: PostingRequest,
    lines: JournalLine[]
  ): Promise<void> {
    if (lines.length === 0) return;

    const values = lines.map((line) => sql`
      (${journalBatchId}, ${request.company_id}, ${request.outlet_id ?? null}, ${line.account_id}, ${this.lineDate}, ${line.debit}, ${line.credit}, ${line.description})
    `);

    await sql`
      INSERT INTO journal_lines (
        journal_batch_id,
        company_id,
        outlet_id,
        account_id,
        line_date,
        debit,
        credit,
        description
      ) VALUES ${sql.join(values, sql`, `)}
    `.execute(this.db);
  }

  async linkInventoryToJournalBatch(
    inventoryTransactionIds: number[],
    journalBatchId: number
  ): Promise<void> {
    if (inventoryTransactionIds.length === 0) return;

    await sql`
      UPDATE inventory_transactions
      SET journal_batch_id = ${journalBatchId}
      WHERE id IN (${sql.join(inventoryTransactionIds.map(id => sql`${id}`), sql`, `)})
    `.execute(this.db);
  }
}

// Mapper implementation for COGS posting
interface CogsSaleDetail {
  saleId: string;
  companyId: number;
  outletId: number;
  items: CogsItemDetail[];
  inventoryTransactionIds?: number[];
}

class CogsPostingMapper implements PostingMapper {
  constructor(
    private readonly db: KyselySchema,
    private readonly saleDetail: CogsSaleDetail
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const lines: JournalLine[] = [];
    const inventoryCreditsByAccount = new Map<number, number>();
    const itemAccounts = await getItemAccountsBatch(
      this.saleDetail.companyId,
      this.saleDetail.items.map((item) => item.itemId),
      this.db
    );

    for (const item of this.saleDetail.items) {
      const accounts = itemAccounts.get(item.itemId);
      if (!accounts) {
        throw new CogsAccountConfigError(`Item ${item.itemId} not found in company ${this.saleDetail.companyId}`);
      }

      // Debit COGS for this item
      lines.push({
        account_id: accounts.cogsAccountId,
        debit: normalizeMoney(item.totalCost),
        credit: 0,
        description: `COGS: ${item.quantity} x item ${item.itemId} (sale ${this.saleDetail.saleId})`
      });

      const currentCredit = inventoryCreditsByAccount.get(accounts.inventoryAssetAccountId) ?? 0;
      inventoryCreditsByAccount.set(accounts.inventoryAssetAccountId, currentCredit + item.totalCost);
    }

    for (const [inventoryAssetAccountId, creditAmount] of inventoryCreditsByAccount.entries()) {
      lines.push({
        account_id: inventoryAssetAccountId,
        debit: 0,
        credit: normalizeMoney(creditAmount),
        description: `Inventory reduction for sale ${this.saleDetail.saleId}`
      });
    }

    return lines;
  }
}

/**
 * Post COGS journal entries for a sale.
 * This is the main entry point for COGS posting.
 */
export async function postCogsForSale(
  input: CogsPostingInput,
  connection?: KyselySchema
): Promise<CogsPostingResult> {
  const db = connection ?? getDb();
  const errors: string[] = [];

  try {
    // Calculate COGS for all items if not provided
    let cogsItems: CogsItemDetail[];
    if (input.items.every(item => item.totalCost !== undefined && item.unitCost !== undefined)) {
      cogsItems = input.items as CogsItemDetail[];
    } else {
      cogsItems = await calculateSaleCogs(
        input.companyId,
        input.items.map(item => ({ itemId: item.itemId, quantity: item.quantity })),
        db
      );
    }

    if (cogsItems.length === 0) {
      return {
        success: true,
        totalCogs: 0
      };
    }

    const totalCogs = cogsItems.reduce((sum, item) => sum + item.totalCost, 0);
    const lineDate = toBusinessDate(input.saleDate);

    // Build sale detail for mapper
    const saleDetail: CogsSaleDetail = {
      saleId: input.saleId,
      companyId: input.companyId,
      outletId: input.outletId,
      items: cogsItems
    };

    // Execute posting within a transaction
    const result = await db.transaction().execute(async (trx) => {
      // Create repository and mapper
      const repository = new CogsRepository(trx, lineDate);
      const mapper = new CogsPostingMapper(trx, saleDetail);

      // Create posting request
      // saleId is typically "INV-{id}" or similar format; extract numeric ID for doc_id
      // If saleId is purely numeric, use it directly; otherwise extract trailing digits
      const numericMatch = input.saleId.match(/\d+$/);
      const saleIdNumeric = numericMatch ? Number(numericMatch[0]) : Number(input.saleId) || input.saleId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const postingRequest: PostingRequest = {
        doc_type: COGS_DOC_TYPE,
        doc_id: saleIdNumeric,
        company_id: input.companyId,
        outlet_id: input.outletId
      };

      // Execute posting
      const postingService = new PostingService(repository, {
        [COGS_DOC_TYPE]: mapper
      });

      const txResult = await postingService.post(postingRequest, {
        transactionOwner: "service"
      });

      // Link inventory transactions to journal batch if IDs provided
      if (saleDetail.inventoryTransactionIds && saleDetail.inventoryTransactionIds.length > 0) {
        await repository.linkInventoryToJournalBatch(
          saleDetail.inventoryTransactionIds,
          txResult.journal_batch_id as number
        );
      }

      return txResult;
    });

    return {
      success: true,
      journalBatchId: Number(result.journal_batch_id),
      totalCogs: normalizeMoney(totalCogs)
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);

    return {
      success: false,
      totalCogs: 0,
      errors
    };
  }
}

// Test exports
export const __cogsPostingTestables = {
  COGS_DOC_TYPE,
  CogsRepository,
  CogsPostingMapper,
  normalizeMoney,
  toMinorUnits,
  fromMinorUnits
};
