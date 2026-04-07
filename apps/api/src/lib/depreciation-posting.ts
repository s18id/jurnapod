// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Thin adapter that delegates to @jurnapod/modules-accounting
// All business logic is in the accounting package

import type { PostingResult } from "@jurnapod/shared";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";
import type { KyselySchema } from "./db";
import {
  type DepreciationPostingExecutor,
  type DepreciationPlan as DepreciationPlanType,
  type DepreciationRun as DepreciationRunType,
  postDepreciationRun
} from "@jurnapod/modules-accounting";

// Re-export types
export type { DepreciationPlan, DepreciationRun } from "@jurnapod/modules-accounting";

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
  plan: DepreciationPlanType,
  run: DepreciationRunType
): Promise<PostingResult> {
  const executor = new ApiDepreciationPostingExecutor();
  return postDepreciationRun(db, executor, plan, run);
}
