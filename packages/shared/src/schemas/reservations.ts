// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common.js";
import { UtcIsoSchema } from "./datetime.js";

export const ReservationStatusSchema = z.enum([
  "BOOKED",
  "CONFIRMED",
  "ARRIVED",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW"
]);

export const ReservationCreateRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  table_id: NumericIdSchema.nullable().optional(),
  customer_name: z.string().trim().min(1).max(191),
  customer_phone: z.string().trim().max(64).nullable().optional(),
  guest_count: z.coerce.number().int().positive(),
  reservation_at: UtcIsoSchema,
  duration_minutes: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional()
});

export const ReservationUpdateRequestSchema = z
  .object({
    table_id: NumericIdSchema.nullable().optional(),
    customer_name: z.string().trim().min(1).max(191).optional(),
    customer_phone: z.string().trim().max(64).nullable().optional(),
    guest_count: z.coerce.number().int().positive().optional(),
    reservation_at: UtcIsoSchema.optional(),
    duration_minutes: z.coerce.number().int().positive().nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    status: ReservationStatusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const ReservationRowSchema = z.object({
  reservation_id: NumericIdSchema,
  company_id: NumericIdSchema,
  outlet_id: NumericIdSchema,
  reservation_group_id: NumericIdSchema.nullable().optional(), // Links to group for multi-table reservations
  table_id: NumericIdSchema.nullable(),
  customer_name: z.string().min(1),
  customer_phone: z.string().nullable(),
  guest_count: z.number().int().positive(),
  reservation_at: UtcIsoSchema,
  duration_minutes: z.number().int().positive().nullable(),
  status: ReservationStatusSchema,
  notes: z.string().nullable(),
  linked_order_id: z.string().uuid().nullable(),
  created_at: UtcIsoSchema,
  updated_at: UtcIsoSchema,
  arrived_at: UtcIsoSchema.nullable(),
  seated_at: UtcIsoSchema.nullable(),
  cancelled_at: UtcIsoSchema.nullable(),
  // Group display fields (populated via JOIN)
  group_name: z.string().nullable().optional(),
  group_table_count: z.number().int().nullable().optional()
});

export const ReservationListQuerySchema = z.object({
  outlet_id: NumericIdSchema,
  status: ReservationStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  overlap_filter: z.coerce.boolean().optional(),
  from: UtcIsoSchema.optional(),
  to: UtcIsoSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;
export type ReservationCreateRequest = z.infer<typeof ReservationCreateRequestSchema>;
export type ReservationUpdateRequest = z.infer<typeof ReservationUpdateRequestSchema>;
export type ReservationRow = z.infer<typeof ReservationRowSchema>;
export type ReservationListQuery = z.infer<typeof ReservationListQuerySchema>;
