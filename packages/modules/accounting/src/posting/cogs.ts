// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import { PostingService, type PostingMapper, type PostingRepository } from "../index.js";
import { ACCOUNT_MAPPING_TYPE_ID_BY_CODE, accountMappingIdToCode } from "@jurnapod/shared";
import { normalizeMoney, resolveMappingCode } from "./common.js";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Public API Functions
// =============================================================================

export async function postCogsForSale(
  db: KyselySchema,
  executor: CogsPostingExecutor,
  input: CogsPostingInput
): Promise<CogsPostingResult> {
  const errors: string[] = [];

  try {
    let cogsItems: CogsItemDetail[];
    if (input.items.every((item) => item.totalCost !== undefined && item.unitCost !== undefined)) {
      cogsItems = input.items as CogsItemDetail[];
    } else {
      cogsItems = await executor.calculateSaleCogs(
        input.companyId,
        input.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity }))
      );
    }

    if (cogsItems.length === 0) {
      return {
        success: true,
        totalCogs: 0
      };
    }

    const totalCogs = cogsItems.reduce((sum, item) => sum + normalizeMoney(item.totalCost), 0);
    const lineDate = toBusinessDate(input.saleDate);

    const saleDetail: CogsSaleDetail = {
      saleId: input.saleId,
      companyId: input.companyId,
      outletId: input.outletId,
      items: cogsItems
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
        transactionOwner: "service"
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
