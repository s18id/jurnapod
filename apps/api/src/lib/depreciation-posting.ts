// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Thin adapter that delegates to @jurnapod/modules-accounting
// All business logic is in the accounting package

import { sql } from "kysely";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import { toMysqlDateTime } from "./date-helpers";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";
import type { KyselySchema } from "./db";
import {
  type DepreciationPostingExecutor,
  type DepreciationPlan as DepreciationPlanType,
  type DepreciationRun as DepreciationRunType,
  DepreciationPostingRepository,
  DepreciationPostingMapper,
  postDepreciationRun
} from "@jurnapod/modules-accounting";

// Re-export types
export type { DepreciationPlan, DepreciationRun } from "@jurnapod/modules-accounting";
import type { DepreciationPlan, DepreciationRun } from "./depreciation";

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

// =============================================================================
// API Implementation of DepreciationPostingExecutor
// =============================================================================

class ApiDepreciationPostingExecutor implements DepreciationPostingExecutor {
  async ensureDateWithinOpenFiscalYear(
    db: KyselySchema,
    companyId: number,
    date: string
  ): Promise<void> {
    await ensureDateWithinOpenFiscalYearWithExecutor(db, companyId, date);
  }
}

export async function postDepreciationRunToJournal(
  db: KyselySchema,
  plan: DepreciationPlan,
  run: DepreciationRun
): Promise<PostingResult> {
  const executor = new ApiDepreciationPostingExecutor();
  return postDepreciationRun(db, executor, plan, run);
}
