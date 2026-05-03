// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import { toUtcIso, fromUtcIso } from "@jurnapod/shared";
import { PostingService, type PostingMapper, type PostingRepository } from "../index.js";
import { normalizeMoney } from "./common.js";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Types
// =============================================================================

export interface DepreciationPlan {
  id: number;
  company_id: number;
  outlet_id?: number | null;
  expense_account_id: number;
  accum_depr_account_id: number;
}

export interface DepreciationRun {
  id: number;
  company_id: number;
  plan_id: number;
  run_date: string;
  period_year: number;
  period_month: number;
  amount: number;
  updated_at: string;
}

// =============================================================================
// Executor Interface
// =============================================================================

export interface DepreciationPostingExecutor {
  ensureDateWithinOpenFiscalYear(db: KyselySchema, companyId: number, date: string): Promise<void>;
}

// =============================================================================
// Repository
// =============================================================================

const DEPRECIATION_DOC_TYPE = "DEPRECIATION";

export class DepreciationPostingRepository implements PostingRepository {
  private readonly lineDate: string;

  constructor(
    private readonly db: KyselySchema,
    private readonly postedAt: string
  ) {
    this.lineDate = postedAt.slice(0, 10);
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const result = await sql`
      INSERT INTO journal_batches (
        company_id,
        outlet_id,
        doc_type,
        doc_id,
        posted_at
      ) VALUES (
        ${request.company_id},
        ${request.outlet_id ?? null},
        ${request.doc_type},
        ${request.doc_id},
        ${this.postedAt}
      )
    `.execute(this.db);

    return {
      journal_batch_id: Number(result.insertId)
    };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    const values = lines.map((line) => sql`
      (
        ${journalBatchId},
        ${request.company_id},
        ${request.outlet_id ?? null},
        ${line.account_id},
        ${this.lineDate},
        ${line.debit},
        ${line.credit},
        ${line.description}
      )
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
}

// =============================================================================
// Mapper
// =============================================================================

export class DepreciationPostingMapper implements PostingMapper {
  constructor(
    private readonly _db: KyselySchema,
    private readonly plan: DepreciationPlan,
    private readonly run: DepreciationRun
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const lines: JournalLine[] = [];

    lines.push({
      account_id: this.plan.expense_account_id,
      debit: normalizeMoney(this.run.amount),
      credit: 0,
      description: `Depreciation for period ${this.run.period_year}-${String(this.run.period_month).padStart(2, "0")}`
    });

    lines.push({
      account_id: this.plan.accum_depr_account_id,
      debit: 0,
      credit: normalizeMoney(this.run.amount),
      description: `Accumulated depreciation for period ${this.run.period_year}-${String(this.run.period_month).padStart(2, "0")}`
    });

    return lines;
  }
}

// =============================================================================
// Public API Functions
// =============================================================================

export async function postDepreciationRun(
  db: KyselySchema,
  executor: DepreciationPostingExecutor,
  plan: DepreciationPlan,
  run: DepreciationRun
): Promise<PostingResult> {
  await executor.ensureDateWithinOpenFiscalYear(db, run.company_id, run.run_date);

  const postingRequest: PostingRequest = {
    doc_type: DEPRECIATION_DOC_TYPE,
    doc_id: run.id,
    company_id: run.company_id,
    outlet_id: plan.outlet_id ?? undefined
  };

  const postingService = new PostingService(
    new DepreciationPostingRepository(db, fromUtcIso.mysql(toUtcIso.dateLike(run.updated_at) as string)),
    {
      [DEPRECIATION_DOC_TYPE]: new DepreciationPostingMapper(db, plan, run)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: "external"
  });
}


