// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
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

interface InventoryStockRow extends RowDataPacket {
  product_id?: number;
  quantity_on_hand: number;
  total_cost: number;
}

interface ItemPriceLookupRow extends RowDataPacket {
  item_id: number;
  base_cost?: number | null;
  price: number | null;
}

interface ItemAccountRow extends RowDataPacket {
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
}

interface AccountTypeRow extends RowDataPacket {
  account_id?: number;
  account_type: string;
}

interface ColumnExistsRow extends RowDataPacket {
  column_exists: number;
}

interface InTransactionRow extends RowDataPacket {
  in_transaction: number;
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
  conn: PoolConnection,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const [rows] = await conn.execute<ColumnExistsRow[]>(
    `SELECT COUNT(*) AS column_exists
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(rows[0]?.column_exists ?? 0) > 0;
}

/**
 * Calculate COGS for a sale by retrieving item costs from inventory.
 * Uses average cost method (can be enhanced for FIFO/LIFO in Story 4.6).
 */
export async function calculateSaleCogs(
  companyId: number,
  saleItems: Array<{ itemId: number; quantity: number }>,
  connection?: PoolConnection
): Promise<CogsItemDetail[]> {
  const pool = getDbPool();
  const conn = connection ?? await pool.getConnection();
  
  try {
    const inventoryHasUnitCost = await hasColumn(conn, "inventory_transactions", "unit_cost");
    const itemPricesHasBaseCost = await hasColumn(conn, "item_prices", "base_cost");
    const uniqueItemIds = Array.from(new Set(saleItems.map((item) => Number(item.itemId))));

    const stockByItemId = new Map<number, { quantityOnHand: number; totalCost: number }>();
    const latestPriceByItemId = new Map<number, { baseCost: number; price: number }>();

    if (uniqueItemIds.length > 0) {
      const itemPlaceholders = uniqueItemIds.map(() => "?").join(", ");
      const stockSql = inventoryHasUnitCost
        ? `SELECT
             product_id,
             COALESCE(SUM(quantity_delta), 0) as quantity_on_hand,
             COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta * unit_cost ELSE 0 END), 0) as total_cost
           FROM inventory_transactions
           WHERE company_id = ? AND product_id IN (${itemPlaceholders})
           GROUP BY product_id`
        : `SELECT
             product_id,
             COALESCE(SUM(quantity_delta), 0) as quantity_on_hand,
             0 as total_cost
           FROM inventory_transactions
           WHERE company_id = ? AND product_id IN (${itemPlaceholders})
           GROUP BY product_id`;

      const [stockRows] = await conn.execute<InventoryStockRow[]>(stockSql, [companyId, ...uniqueItemIds]);
      for (const row of stockRows) {
        const productId = Number(row.product_id ?? 0);
        if (!productId) continue;
        stockByItemId.set(productId, {
          quantityOnHand: Number(row.quantity_on_hand ?? 0),
          totalCost: Number(row.total_cost ?? 0)
        });
      }

      const priceSql = itemPricesHasBaseCost
        ? `SELECT item_id, base_cost, price
           FROM item_prices
           WHERE company_id = ? AND item_id IN (${itemPlaceholders})
           ORDER BY item_id ASC, updated_at DESC, id DESC`
        : `SELECT item_id, price
           FROM item_prices
           WHERE company_id = ? AND item_id IN (${itemPlaceholders})
           ORDER BY item_id ASC, updated_at DESC, id DESC`;

      const [priceRows] = await conn.execute<ItemPriceLookupRow[]>(priceSql, [companyId, ...uniqueItemIds]);
      for (const row of priceRows) {
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
  } finally {
    if (!connection) {
      conn.release();
    }
  }
}

/**
 * Get COGS and Inventory Asset accounts for an item.
 * Falls back to company default accounts if item-level accounts not set.
 */
export async function getItemAccounts(
  companyId: number,
  itemId: number,
  connection?: PoolConnection
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
  connection?: PoolConnection
): Promise<Map<number, ItemAccountMapping>> {
  const pool = getDbPool();
  const conn = connection ?? await pool.getConnection();

  try {
    const uniqueItemIds = Array.from(new Set(itemIds.map(Number)));
    if (uniqueItemIds.length === 0) {
      return new Map();
    }

    const itemPlaceholders = uniqueItemIds.map(() => "?").join(", ");
    const [itemRows] = await conn.execute<(ItemAccountRow & { id: number })[]>(
      `SELECT id, cogs_account_id, inventory_asset_account_id
       FROM items
       WHERE company_id = ? AND id IN (${itemPlaceholders})`,
      [companyId, ...uniqueItemIds]
    );

    const itemRowById = new Map(itemRows.map((row) => [Number(row.id), row]));
    for (const itemId of uniqueItemIds) {
      if (!itemRowById.has(itemId)) {
        throw new CogsAccountConfigError(`Item ${itemId} not found in company ${companyId}`);
      }
    }

    let defaultCogsAccountId: number | null = null;
    let defaultInventoryAssetAccountId: number | null = null;
    if (itemRows.some((row) => !row.cogs_account_id || !row.inventory_asset_account_id)) {
      const hasMappingTypeId = await hasColumn(conn, "company_account_mappings", "mapping_type_id");

      const [companyRows] = await conn.execute<RowDataPacket[]>(
        hasMappingTypeId
          ? `SELECT mapping_type_id, mapping_key, account_id
             FROM company_account_mappings
             WHERE company_id = ?
               AND (mapping_type_id IN (?, ?) OR mapping_key IN ('COGS_DEFAULT', 'INVENTORY_ASSET_DEFAULT'))`
          : `SELECT NULL AS mapping_type_id, mapping_key, account_id
             FROM company_account_mappings
             WHERE company_id = ?
               AND mapping_key IN ('COGS_DEFAULT', 'INVENTORY_ASSET_DEFAULT')`,
        hasMappingTypeId
          ? [
              companyId,
              ACCOUNT_MAPPING_TYPE_ID_BY_CODE.COGS_DEFAULT,
              ACCOUNT_MAPPING_TYPE_ID_BY_CODE.INVENTORY_ASSET_DEFAULT
            ]
          : [companyId]
      );
      
      const accountMap = new Map<string, number>();
      for (const row of companyRows) {
        const mappingCode = resolveMappingCode(row as { mapping_type_id?: number | null; mapping_key?: string | null });
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
    const accountPlaceholders = accountIds.map(() => "?").join(", ");
    const [accountTypeRows] = await conn.execute<AccountTypeRow[]>(
      `SELECT a.id AS account_id, at.name AS account_type
       FROM accounts a
       JOIN account_types at ON a.account_type_id = at.id
       WHERE a.company_id = ? AND a.id IN (${accountPlaceholders})`,
      [companyId, ...accountIds]
    );

    const accountTypeById = new Map(accountTypeRows.map((row) => [Number(row.account_id), row.account_type?.toUpperCase() ?? null]));

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

    return result;
  } finally {
    if (!connection) {
      conn.release();
    }
  }
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
    private readonly dbExecutor: { execute: PoolConnection["execute"] },
    private readonly lineDate: string
  ) {}

  async begin(): Promise<void> {
    await this.dbExecutor.execute("START TRANSACTION");
  }

  async commit(): Promise<void> {
    await this.dbExecutor.execute("COMMIT");
  }

  async rollback(): Promise<void> {
    await this.dbExecutor.execute("ROLLBACK");
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const [result] = await this.dbExecutor.execute<ResultSetHeader>(
      `INSERT INTO journal_batches (
        company_id,
        outlet_id,
        doc_type,
        doc_id,
        posted_at
      ) VALUES (?, ?, ?, ?, NOW())`,
      [request.company_id, request.outlet_id ?? null, request.doc_type, request.doc_id]
    );

    return { journal_batch_id: Number(result.insertId) };
  }

  async insertJournalLines(
    journalBatchId: number,
    request: PostingRequest,
    lines: JournalLine[]
  ): Promise<void> {
    const placeholders = lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = lines.flatMap((line) => [
      journalBatchId,
      request.company_id,
      request.outlet_id ?? null,
      line.account_id,
      this.lineDate,
      line.debit,
      line.credit,
      line.description
    ]);

    await this.dbExecutor.execute(
      `INSERT INTO journal_lines (
        journal_batch_id,
        company_id,
        outlet_id,
        account_id,
        line_date,
        debit,
        credit,
        description
      ) VALUES ${placeholders}`,
      values
    );
  }

  async linkInventoryToJournalBatch(
    inventoryTransactionIds: number[],
    journalBatchId: number
  ): Promise<void> {
    if (inventoryTransactionIds.length === 0) return;

    const placeholders = inventoryTransactionIds.map(() => "?").join(", ");
    await this.dbExecutor.execute(
      `UPDATE inventory_transactions 
       SET journal_batch_id = ? 
       WHERE id IN (${placeholders})`,
      [journalBatchId, ...inventoryTransactionIds]
    );
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
    private readonly dbExecutor: { execute: PoolConnection["execute"] },
    private readonly saleDetail: CogsSaleDetail
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const lines: JournalLine[] = [];
    const inventoryCreditsByAccount = new Map<number, number>();
    const itemAccounts = await getItemAccountsBatch(
      this.saleDetail.companyId,
      this.saleDetail.items.map((item) => item.itemId),
      this.dbExecutor as PoolConnection
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
  connection?: PoolConnection
): Promise<CogsPostingResult> {
  const pool = getDbPool();
  const conn = connection ?? await pool.getConnection();
  const ownsConnection = !connection;
  
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
        conn
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
    
    // Create repository and mapper
    const repository = new CogsRepository(conn, lineDate);
    const mapper = new CogsPostingMapper(conn, saleDetail);
    
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

    let transactionOwner: "service" | "external" = "service";
    if (connection) {
      const [txRows] = await conn.execute<InTransactionRow[]>(
        `SELECT @@in_transaction AS in_transaction`
      );
      transactionOwner = Number(txRows[0]?.in_transaction ?? 0) === 1 ? "external" : "service";
    }
    
    const result = await postingService.post(postingRequest, {
      transactionOwner
    });
    
    // Link inventory transactions to journal batch if IDs provided
    if (saleDetail.inventoryTransactionIds && saleDetail.inventoryTransactionIds.length > 0) {
      await repository.linkInventoryToJournalBatch(
        saleDetail.inventoryTransactionIds,
        result.journal_batch_id as number
      );
    }
    
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
  } finally {
    if (ownsConnection) {
      conn.release();
    }
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
