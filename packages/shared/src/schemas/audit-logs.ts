// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

/**
 * Audit log action types
 */
export const AuditActionSchema = z.enum([
  "CREATE",
  "UPDATE",
  "DELETE",
  "DEACTIVATE",
  "REACTIVATE",
  "VOID",
  "REFUND",
  "POST",
  "IMPORT"
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

/**
 * Audit log entity types
 */
export const AuditEntityTypeSchema = z.enum([
  "account",
  "account_type",
  "item",
  "item_price",
  "invoice",
  "payment",
  "journal_batch",
  "pos_transaction",
  "user",
  "outlet",
  "company",
  "setting",
  "feature_flag",
  "tax_rate"
]);

export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

/**
 * Audit log result
 */
export const AuditResultSchema = z.enum(["SUCCESS", "FAIL"]);

export type AuditResult = z.infer<typeof AuditResultSchema>;

/**
 * Audit log entry request (for creating audit logs)
 */
export const AuditLogEntryRequestSchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable().optional(),
  user_id: z.number().int().positive(),
  entity_type: AuditEntityTypeSchema,
  entity_id: z.string(),
  action: AuditActionSchema,
  result: AuditResultSchema.default("SUCCESS"),
  ip_address: z.string().max(45).nullable().optional(),
  payload: z.record(z.any()).optional(),
  changes: z
    .object({
      before: z.record(z.any()).optional(),
      after: z.record(z.any()).optional()
    })
    .optional()
});

export type AuditLogEntryRequest = z.infer<typeof AuditLogEntryRequestSchema>;

/**
 * Audit log response
 */
export const AuditLogResponseSchema = z.object({
  id: z.number().int().positive(),
  company_id: z.number().int().positive().nullable(),
  outlet_id: z.number().int().positive().nullable(),
  user_id: z.number().int().positive().nullable(),
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  action: z.string(),
  result: AuditResultSchema,
  ip_address: z.string().nullable(),
  payload_json: z.string(),
  changes_json: z.string().nullable(),
  created_at: z.string()
});

export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

/**
 * Audit log query filters
 */
export const AuditLogQuerySchema = z.object({
  company_id: z.number().int().positive(),
  entity_type: AuditEntityTypeSchema.optional(),
  entity_id: z.string().optional(),
  user_id: z.number().int().positive().optional(),
  action: AuditActionSchema.optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0)
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
