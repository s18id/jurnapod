// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

export const PostingRequestSchema = z.object({
  doc_type: z.string().min(1),
  doc_id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema.optional()
});

export const JournalLineSchema = z.object({
  account_id: NumericIdSchema,
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  description: z.string().min(1)
});

export const PostingResultSchema = z.object({
  journal_batch_id: NumericIdSchema,
  lines: z.array(JournalLineSchema).min(1)
});

export type PostingRequest = z.infer<typeof PostingRequestSchema>;
export type JournalLine = z.infer<typeof JournalLineSchema>;
export type PostingResult = z.infer<typeof PostingResultSchema>;
