import { z } from "zod";
import { UUID } from "./common";

export const PostingRequestSchema = z.object({
  doc_type: z.string().min(1),
  doc_id: UUID,
  company_id: UUID,
  outlet_id: UUID.optional()
});

export const JournalLineSchema = z.object({
  account_id: UUID,
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  description: z.string().min(1)
});

export const PostingResultSchema = z.object({
  journal_batch_id: UUID,
  lines: z.array(JournalLineSchema).min(1)
});

export type PostingRequest = z.infer<typeof PostingRequestSchema>;
export type JournalLine = z.infer<typeof JournalLineSchema>;
export type PostingResult = z.infer<typeof PostingResultSchema>;
