// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { JournalLine, PostingRequest, PostingResult, AccountMappingCode } from "@jurnapod/shared";
import { PostingService, type PostingMapper, type PostingRepository } from "../index.js";
import { ACCOUNT_MAPPING_TYPE_ID_BY_CODE, accountMappingIdToCode } from "@jurnapod/shared";
import { normalizeMoney, resolveMappingCode } from "./common.js";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Types
// =============================================================================

/**
 * Pre-calculated item cost keyed by stockTxId.
 * Produced by deductWithCost from the costing package.
 * When present, postCogsForSale uses these instead of re-querying inventory.
 */
export interface StockCostEntry {
  stockTxId: number;
  itemId: number;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

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
  /**
   * Optional pre-calculated costs from deductWithCost.
   * When provided, postCogsForSale uses these instead of re-querying inventory by itemId.
   * Keys journal entries to the specific stockTxId for deterministic linkage.
   */
  deductionCosts?: StockCostEntry[];
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
  /**
   * stockTxId from the inventory transaction that was deducted.
   * Present when postCogsForSale was called with pre-calculated deductionCosts.
   */
  stockTxId?: number;
}

export interface ItemAccountMapping {
  cogsAccountId: number;
  inventoryAssetAccountId: number;
}

export interface CogsSaleDetail {
  saleId: string;
  companyId: number;
  outletId: number;
  items: CogsItemDetail[];
  inventoryTransactionIds?: number[];
  /**
   * When true, items array contains stockTxId-linked costs from deductWithCost.
   * Journal entries will be keyed by stockTxId instead of itemId-only matching.
   */
  useDeductionCosts?: boolean;
}

// =============================================================================
// Executor Interface
// =============================================================================

export interface CogsPostingExecutor {
  calculateSaleCogs(
    companyId: number,
    saleItems: Array<{ itemId: number; quantity: number }>
  ): Promise<CogsItemDetail[]>;

  getItemAccountsBatch(
    companyId: number,
    itemIds: readonly number[]
  ): Promise<Map<number, ItemAccountMapping>>;

  ensureDateWithinOpenFiscalYear(companyId: number, date: string): Promise<void>;
}

// =============================================================================
// Repository
// =============================================================================

export class CogsRepository implements PostingRepository {
  constructor(
    private readonly db: KyselySchema,
    private readonly lineDate: string
  ) {}

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

    return { journal_batch_id: Number(result.insertId) };
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

// =============================================================================
// Mapper
// =============================================================================

export class CogsPostingMapper implements PostingMapper {
  constructor(
    private readonly executor: CogsPostingExecutor,
    private readonly saleDetail: CogsSaleDetail
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const lines: JournalLine[] = [];
    const inventoryCreditsByAccount = new Map<number, number>();

    const itemAccounts = await this.executor.getItemAccountsBatch(
      this.saleDetail.companyId,
      this.saleDetail.items.map((item) => item.itemId)
    );

    for (const item of this.saleDetail.items) {
      const accounts = itemAccounts.get(item.itemId);
      if (!accounts) {
        throw new CogsAccountConfigError(`Item ${item.itemId} not found in company ${this.saleDetail.companyId}`);
      }

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

// =============================================================================
// Error Classes
// =============================================================================

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

// =============================================================================
// Constants
// =============================================================================

const COGS_DOC_TYPE = "COGS";
const MONEY_SCALE = 100;

// =============================================================================
// Helper Functions
// =============================================================================

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromMinorUnits(value: number): number {
  return value / MONEY_SCALE;
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

// =============================================================================
// Standalone COGS Functions
// =============================================================================

/**
 * Calculate COGS for a sale by retrieving item costs from inventory.
 * Uses average cost method.
 */
export async function calculateSaleCogs(
  companyId: number,
  saleItems: Array<{ itemId: number; quantity: number }>,
  db: KyselySchema
): Promise<CogsItemDetail[]> {
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

      const totalItemCost = fromMinorUnits(toMinorUnits(saleItem.quantity * unitCost));

      cogsDetails.push({
        itemId: saleItem.itemId,
        quantity: saleItem.quantity,
        unitCost: fromMinorUnits(toMinorUnits(unitCost)),
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
  db: KyselySchema
): Promise<ItemAccountMapping> {
  const mappings = await getItemAccountsBatch(companyId, [itemId], db);
  const mapping = mappings.get(itemId);
  if (!mapping) {
    throw new CogsAccountConfigError(`Item ${itemId} not found in company ${companyId}`);
  }
  return mapping;
}

export async function getItemAccountsBatch(
  companyId: number,
  itemIds: readonly number[],
  db: KyselySchema
): Promise<Map<number, ItemAccountMapping>> {
  // Note: do NOT wrap in db.transaction().execute() here.
  // When called from CogsPostingMapper.mapToJournal within postCogsForSale's
  // existing transaction, nesting is not supported by Kysely.
  // Read-only batch is safe to run against the provided executor directly.
  const uniqueItemIds = Array.from(new Set(itemIds.map(Number)));
  if (uniqueItemIds.length === 0) {
    return new Map();
  }

  const itemRowsResult = await sql<{ id: number; cogs_account_id: number | null; inventory_asset_account_id: number | null }>`
    SELECT id, cogs_account_id, inventory_asset_account_id
    FROM items
    WHERE company_id = ${companyId} AND id IN (${sql.join(uniqueItemIds.map(id => sql`${id}`), sql`, `)})
  `.execute(db);

  const itemRowById = new Map(itemRowsResult.rows.map((row) => [Number(row.id), row]));
  for (const itemId of uniqueItemIds) {
    if (!itemRowById.has(itemId)) {
      throw new CogsAccountConfigError(`Item ${itemId} not found in company ${companyId}`);
    }
  }

  let defaultCogsAccountId: number | null = null;
  let defaultInventoryAssetAccountId: number | null = null;
  if (itemRowsResult.rows.some((row: { cogs_account_id: number | null; inventory_asset_account_id: number | null }) => !row.cogs_account_id || !row.inventory_asset_account_id)) {
    // Query unified account_mappings table for company-wide mappings only (outlet_id IS NULL)
    const companyRowsResult = await sql<{ mapping_type_id: number | null; mapping_key: string | null; account_id: number | undefined }>`
        SELECT mapping_type_id, mapping_key, account_id
        FROM account_mappings
        WHERE company_id = ${companyId}
          AND outlet_id IS NULL
          AND (mapping_type_id IN (${sql`${ACCOUNT_MAPPING_TYPE_ID_BY_CODE.COGS_DEFAULT}`}, ${sql`${ACCOUNT_MAPPING_TYPE_ID_BY_CODE.INVENTORY_ASSET_DEFAULT}`}) OR mapping_key IN ('COGS_DEFAULT', 'INVENTORY_ASSET_DEFAULT'))`
      .execute(db);

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
    `.execute(db);

    const accountTypeById = new Map(accountTypeRowsResult.rows.map((row: { account_id: number | undefined; account_type: string | null }) => [Number(row.account_id), row.account_type?.toUpperCase() ?? null]));

    for (const [, mapping] of result.entries()) {
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
}

// =============================================================================
// Public API Functions
// =============================================================================

/**
 * Default executor that uses standalone functions.
 * Used by the backward-compatible overload of postCogsForSale(input, connection?).
 */
function createDefaultCogsExecutor(db: KyselySchema): CogsPostingExecutor {
  return {
    calculateSaleCogs: (companyId, saleItems) => calculateSaleCogs(companyId, saleItems, db),
    getItemAccountsBatch: (companyId, itemIds) => getItemAccountsBatch(companyId, itemIds, db),
    ensureDateWithinOpenFiscalYear: async () => {
      // No-op: fiscal year validation is handled at a higher level in the API
    }
  };
}

/**
 * Post COGS for a sale.
 * Supports two signatures for API compatibility:
 * - (input, db?) - backward compatible, creates default executor
 * - (db, executor, input) - explicit executor for fine-grained control
 */
export async function postCogsForSale(
  inputOrDb: CogsPostingInput | KyselySchema,
  executorOrConnectionOrInput?: CogsPostingExecutor | KyselySchema | CogsPostingInput,
  input?: CogsPostingInput
): Promise<CogsPostingResult> {
  let db: KyselySchema;
  let executor: CogsPostingExecutor;

  if (input === undefined) {
    // Called as postCogsForSale(input, db?)
    // inputOrDb is actually the input
    const cogsInput = inputOrDb as CogsPostingInput;
    const connection = executorOrConnectionOrInput as KyselySchema | undefined;
    db = connection!;
    if (!db) {
      throw new Error("Database connection is required");
    }
    executor = createDefaultCogsExecutor(db);
    return postCogsForSaleInternal(db, executor, cogsInput);
  } else {
    // Called as postCogsForSale(db, executor, input)
    db = inputOrDb as KyselySchema;
    executor = executorOrConnectionOrInput as CogsPostingExecutor;
    return postCogsForSaleInternal(db, executor, input);
  }
}

async function postCogsForSaleInternal(
  db: KyselySchema,
  executor: CogsPostingExecutor,
  input: CogsPostingInput
): Promise<CogsPostingResult> {
  const errors: string[] = [];

  try {
    // Determine cogsItems source with stockTxId-aware linkage
    let cogsItems: CogsItemDetail[];

    if (input.deductionCosts && input.deductionCosts.length > 0) {
      // Use pre-calculated costs from deductWithCost (stockTxId-aware contract)
      // Build COGS rows directly from deduction costs to avoid itemId ambiguity.
      cogsItems = input.deductionCosts.map((cost) => ({
        itemId: cost.itemId,
        quantity: cost.quantity,
        unitCost: cost.unitCost,
        totalCost: cost.totalCost,
        stockTxId: cost.stockTxId
      }));

      // Validate aggregate quantities by item to catch contract mismatch.
      const expectedQtyByItem = new Map<number, number>();
      for (const item of input.items) {
        expectedQtyByItem.set(item.itemId, (expectedQtyByItem.get(item.itemId) ?? 0) + item.quantity);
      }

      const deductedQtyByItem = new Map<number, number>();
      for (const cost of input.deductionCosts) {
        deductedQtyByItem.set(cost.itemId, (deductedQtyByItem.get(cost.itemId) ?? 0) + cost.quantity);
      }

      const mismatches: number[] = [];
      for (const [itemId, expectedQty] of expectedQtyByItem.entries()) {
        const deductedQty = deductedQtyByItem.get(itemId) ?? 0;
        if (Math.abs(deductedQty - expectedQty) > 0.000001) {
          mismatches.push(itemId);
        }
      }

      if (mismatches.length > 0) {
        throw new CogsCalculationError(
          `Deduction cost quantity mismatch for items: ${mismatches.join(", ")}. ` +
          `COGS requires deductionCosts to align with deducted stock quantities.`
        );
      }
    } else if (input.items.every(item => item.totalCost !== undefined && item.unitCost !== undefined)) {
      // All items have pre-calculated costs passed in directly
      cogsItems = input.items as CogsItemDetail[];
    } else {
      // Fall back to calculating COGS from inventory
      cogsItems = await executor.calculateSaleCogs(
        input.companyId,
        input.items.map(item => ({ itemId: item.itemId, quantity: item.quantity }))
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
    // Extract inventory transaction IDs from stockTxId-aware costs for journal linking
    const inventoryTransactionIds = cogsItems
      .map(item => item.stockTxId)
      .filter((id): id is number => id !== undefined);

    const saleDetail: CogsSaleDetail = {
      saleId: input.saleId,
      companyId: input.companyId,
      outletId: input.outletId,
      items: cogsItems,
      inventoryTransactionIds: inventoryTransactionIds.length > 0 ? inventoryTransactionIds : undefined,
      useDeductionCosts: (input.deductionCosts?.length ?? 0) > 0
    };

    const result = await db.transaction().execute(async (trx) => {
      const repository = new CogsRepository(trx, lineDate);
      const mapper = new CogsPostingMapper(executor, saleDetail);

      const numericMatch = input.saleId.match(/\d+$/);
      const saleIdNumeric = numericMatch
        ? Number(numericMatch[0])
        : Number(input.saleId) || input.saleId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

      const postingRequest: PostingRequest = {
        doc_type: COGS_DOC_TYPE,
        doc_id: saleIdNumeric,
        company_id: input.companyId,
        outlet_id: input.outletId
      };

      const postingService = new PostingService(repository, {
        [COGS_DOC_TYPE]: mapper
      });

      const txResult = await postingService.post(postingRequest, {
        transactionOwner: "external"
      });

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

function toBusinessDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new CogsPostingError("Invalid saleDate for COGS posting");
  }

  return value.toISOString().slice(0, 10);
}
