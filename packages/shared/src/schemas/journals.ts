// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { DateOnlySchema } from "./datetime.js";
import { JournalLineSchema } from "./posting.js";

/**
 * Journal Line Response Schema
 * Extends the base JournalLine with database fields
 */
export const JournalLineResponseSchema = JournalLineSchema.extend({
  id: z.number().int().positive(),
  journal_batch_id: z.number().int().positive(),
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  line_date: DateOnlySchema,
  created_at: z.string(),
  updated_at: z.string()
});

export const JournalStatusSchema = z.enum(["DRAFT", "POSTED"]);

export const JournalEntryLineResponseSchema = JournalLineSchema.extend({
  id: z.number().int().positive(),
  journal_id: z.number().int().positive(),
  journal_batch_id: z.number().int().positive().nullable().optional(),
  journal_draft_id: z.number().int().positive().nullable().optional(),
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  line_date: DateOnlySchema,
  created_at: z.string(),
  updated_at: z.string()
});

/**
 * Journal Batch (Transaction) Schema
 * A batch groups multiple journal lines together (must balance)
 */
export const JournalBatchSchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  doc_type: z.string().max(64),
  doc_id: z.number().int().positive(),
  posted_at: z.string(), // ISO datetime string
  lines: z.array(JournalLineSchema).min(2) // Must have at least 2 lines
});

export const JournalBatchResponseSchema = z.object({
  id: z.number().int().positive(),
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  status: JournalStatusSchema.default("POSTED"),
  reference: z.string().nullable().optional(),
  total_debits: z.number().nonnegative().optional(),
  total_credits: z.number().nonnegative().optional(),
  doc_type: z.string(),
  doc_id: z.number().int().positive(),
  client_ref: z.string().uuid().nullable().optional(),
  posted_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  lines: z.array(JournalLineResponseSchema)
});

/**
 * Manual Journal Entry Create Request
 * For creating general journal entries (expenses, transfers, adjustments)
 */
export const ManualJournalEntryCreateRequestSchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable().optional(),
  client_ref: z.string().uuid().optional(),
  entry_date: DateOnlySchema,
  reference: z.string().max(100).optional(),
  description: z.string().max(500),
  lines: z.array(
    z.object({
      account_id: z.number().int().positive(),
      debit: z.number().nonnegative().default(0),
      credit: z.number().nonnegative().default(0),
      description: z.string().max(255)
    })
  ).min(2).refine(
    (lines) => {
      // Validate each line has either debit or credit (not both, not neither)
      return lines.every(line => 
        (line.debit > 0 && line.credit === 0) || 
        (line.credit > 0 && line.debit === 0)
      );
    },
    { message: "Each line must have either debit or credit, not both" }
  ).refine(
    (lines) => {
      // Validate debits = credits (balanced entry)
      const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
      return Math.abs(totalDebit - totalCredit) < 0.01; // Allow for floating point precision
    },
    { message: "Total debits must equal total credits" }
  )
});

export const ManualJournalEntryUpdateRequestSchema = ManualJournalEntryCreateRequestSchema.omit({
  company_id: true,
  client_ref: true,
}).extend({
  company_id: z.number().int().positive().optional(),
  client_ref: z.string().uuid().optional(),
});

export const JournalDraftResponseSchema = z.object({
  id: z.number().int().positive(),
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable(),
  status: z.literal("DRAFT"),
  reference: z.string().nullable(),
  description: z.string(),
  entry_date: DateOnlySchema,
  doc_type: z.literal("MANUAL"),
  doc_id: z.number().int().positive(),
  client_ref: z.string().uuid().nullable().optional(),
  posted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  total_debits: z.number().nonnegative(),
  total_credits: z.number().nonnegative(),
  lines: z.array(JournalEntryLineResponseSchema),
});

export const JournalEntryResponseSchema = z.union([
  JournalDraftResponseSchema,
  JournalBatchResponseSchema.extend({
    status: z.literal("POSTED"),
    reference: z.string().nullable().optional(),
    total_debits: z.number().nonnegative(),
    total_credits: z.number().nonnegative(),
    lines: z.array(JournalEntryLineResponseSchema),
  }),
]);

/**
 * Query parameters for listing journal entries
 */
export const JournalListQuerySchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().optional(),
  start_date: DateOnlySchema.optional(),
  end_date: DateOnlySchema.optional(),
  doc_type: z.string().optional(),
  account_id: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0)
});

/**
 * Transaction Types for common journal entries
 */
export const TransactionTypeSchema = z.enum([
  "MANUAL", // General journal entry
  "EXPENSE", // Cash/Bank expense payment
  "CASH_TRANSFER", // Transfer between cash/bank accounts
  "BANK_DEPOSIT", // Deposit cash to bank
  "BANK_WITHDRAWAL", // Withdraw cash from bank
  "ADJUSTMENT" // Adjusting entry
]);

/**
 * Type exports
 */
export type JournalLineResponse = z.infer<typeof JournalLineResponseSchema>;
export type JournalStatus = z.infer<typeof JournalStatusSchema>;
export type JournalEntryLineResponse = z.infer<typeof JournalEntryLineResponseSchema>;
export type JournalBatch = z.infer<typeof JournalBatchSchema>;
export type JournalBatchResponse = z.infer<typeof JournalBatchResponseSchema>;
export type ManualJournalEntryCreateRequest = z.infer<typeof ManualJournalEntryCreateRequestSchema>;
export type ManualJournalEntryUpdateRequest = z.infer<typeof ManualJournalEntryUpdateRequestSchema>;
export type JournalDraftResponse = z.infer<typeof JournalDraftResponseSchema>;
export type JournalEntryResponse = z.infer<typeof JournalEntryResponseSchema>;
export type JournalListQuery = z.infer<typeof JournalListQuerySchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
