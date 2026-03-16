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
  "outlet_table",
  "reservation",
  "company",
  "setting",
  "feature_flag",
  "tax_rate"
]);

export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

/**
 * Audit log result (legacy field)
 */
export const AuditResultSchema = z.enum(["SUCCESS", "FAIL"]);

export type AuditResult = z.infer<typeof AuditResultSchema>;

/**
 * Audit log status codes (TINYINT)
 */
export const AuditStatus = {
  FAIL: 0,
  SUCCESS: 1,
  PARTIAL: 2,
  PENDING: 3,
  CANCELLED: 4,
  TIMEOUT: 5,
  RETRY: 6,
  CORRUPTED: 7
} as const;

export type AuditStatusCode = typeof AuditStatus[keyof typeof AuditStatus];

export const AuditStatusSchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3),
  z.literal(4), z.literal(5), z.literal(6), z.literal(7)
]);

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
  result: AuditResultSchema.default("SUCCESS"), // Legacy field for backward compatibility
  status: AuditStatusSchema.default(1), // New canonical status field
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
  result: AuditResultSchema, // Legacy field
  success: z.boolean(), // Derived from status for backward compatibility
  status: AuditStatusSchema, // New canonical status field
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
