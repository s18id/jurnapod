// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/modules-accounting";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import type { DepreciationPlan, DepreciationRun } from "./depreciation";
import { toMysqlDateTime } from "./date-helpers";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";
import type { KyselySchema } from "./db";

const DEPRECIATION_DOC_TYPE = "DEPRECIATION";

const MONEY_SCALE = 100;

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromMinorUnits(value: number): number {
  return value / MONEY_SCALE;
}

function normalizeMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

class DepreciationPostingMapper implements PostingMapper {
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

class DepreciationPostingRepository implements PostingRepository {
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

export async function postDepreciationRunToJournal(
  db: KyselySchema,
  plan: DepreciationPlan,
  run: DepreciationRun
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(db, run.company_id, run.run_date);

  const postingRequest: PostingRequest = {
    doc_type: DEPRECIATION_DOC_TYPE,
    doc_id: run.id,
    company_id: run.company_id,
    outlet_id: plan.outlet_id ?? undefined
  };

  const postingService = new PostingService(
    new DepreciationPostingRepository(db, toMysqlDateTime(run.updated_at)),
    {
      [DEPRECIATION_DOC_TYPE]: new DepreciationPostingMapper(db, plan, run)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: "external"
  });
}
