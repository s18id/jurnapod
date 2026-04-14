// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";

/**
 * ReservationGroup entity (database row)
 */
export const ReservationGroupRowSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  group_name: z.string().nullable(),
  total_guest_count: z.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true })
});

/**
 * Request to create a reservation group (multi-table reservation)
 * Requires 2-10 tables for parties larger than single-table capacity
 */
export const ReservationGroupCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  customer_name: z.string().trim().min(1).max(191),
  customer_phone: z.string().trim().max(64).nullable().optional(),
  guest_count: z.coerce.number().int().min(2).max(100), // Multi-table = 2+ guests
  table_ids: z.array(NumericIdSchema).min(2).max(10), // 2-10 tables per group
  reservation_at: z.string().datetime({ offset: true }), // ISO 8601 with timezone
  duration_minutes: z.coerce.number().int().min(15).max(480).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional()
});

/**
 * Request to get suggestions for table combinations
 */
export const TableSuggestionQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  guest_count: z.coerce.number().int().min(2).max(100),
  reservation_at: z.string().datetime({ offset: true }),
  duration_minutes: z.coerce.number().int().min(15).max(480).default(120)
});

/**
 * A single table in a suggestion
 */
export const TableSuggestionItemSchema = z.object({
  id: NumericIdSchema,
  code: z.string(),
  name: z.string(),
  capacity: z.number().int().positive(),
  zone: z.string().nullable()
});

/**
 * A table combination suggestion with scoring
 * Lower score = better fit (fewer tables, less excess capacity)
 */
export const TableSuggestionSchema = z.object({
  tables: z.array(TableSuggestionItemSchema),
  total_capacity: z.number().int().positive(),
  excess_capacity: z.number().int(), // Can be negative if under capacity
  score: z.number().int().nonnegative() // Lower is better
});

/**
 * A single reservation within a group (for detail view).
 * Internal machine-time fields (`_ts`) are omitted from this public contract.
 */
export const ReservationGroupReservationSchema = z.object({
  reservation_id: NumericIdSchema,
  table_id: NumericIdSchema,
  table_code: z.string(),
  table_name: z.string(),
  status: z.string(),
  reservation_at: z.string().datetime({ offset: true })
  // reservation_start_ts and reservation_end_ts are internal canonical
  // timestamps (Unix ms) used for overlap/range queries only - not for display.
});

/**
 * Group detail response (includes all linked reservations)
 */
export const ReservationGroupDetailSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  group_name: z.string().nullable(),
  total_guest_count: z.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  reservations: z.array(ReservationGroupReservationSchema)
});

/**
 * Response for group creation
 */
export const ReservationGroupCreateResponseSchema = z.object({
  group_id: NumericIdSchema,
  reservation_ids: z.array(NumericIdSchema)
});

/**
 * Response for table suggestions
 */
export const TableSuggestionResponseSchema = z.object({
  suggestions: z.array(TableSuggestionSchema)
});

/**
 * Request to update an existing reservation group.
 * All fields are optional - only provide fields you want to change.
 */
export const ReservationGroupUpdateRequestSchema = z.object({
  customer_name: z.string().trim().min(1).max(191).optional(),
  customer_phone: z.string().trim().max(64).nullable().optional(),
  guest_count: z.coerce.number().int().min(2).max(100).optional(),
  reservation_at: z.string().datetime({ offset: true }).optional(), // ISO 8601
  duration_minutes: z.coerce.number().int().min(15).max(480).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  table_ids: z.array(NumericIdSchema).min(2).max(10).optional() // If provided, replaces all tables
});

/**
 * Response for group update
 */
export const ReservationGroupUpdateResponseSchema = z.object({
  group_id: NumericIdSchema,
  reservation_ids: z.array(NumericIdSchema),
  updated_tables: z.array(NumericIdSchema),
  removed_tables: z.array(NumericIdSchema)
});

// Type exports
export type ReservationGroupRow = z.infer<typeof ReservationGroupRowSchema>;
export type ReservationGroupCreateRequest = z.infer<typeof ReservationGroupCreateRequestSchema>;
export type TableSuggestionQuery = z.infer<typeof TableSuggestionQuerySchema>;
export type TableSuggestionItem = z.infer<typeof TableSuggestionItemSchema>;
export type TableSuggestion = z.infer<typeof TableSuggestionSchema>;
export type ReservationGroupReservation = z.infer<typeof ReservationGroupReservationSchema>;
export type ReservationGroupDetail = z.infer<typeof ReservationGroupDetailSchema>;
export type ReservationGroupCreateResponse = z.infer<typeof ReservationGroupCreateResponseSchema>;
export type TableSuggestionResponse = z.infer<typeof TableSuggestionResponseSchema>;
export type ReservationGroupUpdateRequest = z.infer<typeof ReservationGroupUpdateRequestSchema>;
export type ReservationGroupUpdateResponse = z.infer<typeof ReservationGroupUpdateResponseSchema>;