// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ReservationGroupCreateRequestSchema } from "@jurnapod/shared";
import { withAuth, requireAccess } from "@/lib/auth-guard";
import { createReservationGroupWithTables, checkMultiTableAvailability } from "@/lib/reservation-groups";
import { errorResponse, successResponse } from "@/lib/response";
import { ZodError } from "zod";

/**
 * POST /api/reservation-groups
 * 
 * Creates a multi-table reservation group for large parties.
 * 
 * Request Body:
 * - outlet_id: number (required)
 * - customer_name: string (required)
 * - customer_phone: string (optional)
 * - guest_count: number (2-100, required)
 * - table_ids: number[] (2-10 tables, required)
 * - reservation_at: ISO 8601 datetime string (required)
 * - duration_minutes: number (15-480, optional, default 120)
 * - notes: string (optional)
 * 
 * Response:
 * - success: true
 * - data: { group_id: number, reservation_ids: number[] }
 * 
 * Timestamps:
 * - reservation_start_ts: Unix milliseconds (from reservation_at)
 * - reservation_end_ts: Unix milliseconds (start + duration)
 * - All reservations in group have identical timestamps
 * 
 * Safety:
 * - Atomic transaction: all-or-nothing creation
 * - Capacity validation: total table capacity >= guest_count
 * - Conflict detection: no overlapping reservations
 * - Company scoping: only user's company/outlet
 * 
 * Errors:
 * - 400: Invalid input, insufficient capacity
 * - 401: Unauthorized
 * - 409: Tables not available (conflict)
 * - 500: Server error
 * 
 * @example
 * // Request
 * {
 *   "outlet_id": 1,
 *   "customer_name": "Smith Party",
 *   "guest_count": 10,
 *   "table_ids": [1, 2, 3],
 *   "reservation_at": "2026-01-15T19:00:00+07:00",
 *   "duration_minutes": 120
 * }
 * 
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "group_id": 123,
 *     "reservation_ids": [456, 457, 458]
 *   }
 * }
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      // Validate request
      const payload = await request.json();
      const validated = ReservationGroupCreateRequestSchema.parse(payload);

      // Calculate time range in Unix milliseconds
      const startTs = new Date(validated.reservation_at).getTime();
      const durationMs = (validated.duration_minutes ?? 120) * 60 * 1000;
      const endTs = startTs + durationMs;

      // Check availability for all requested tables
      const availability = await checkMultiTableAvailability({
        companyId: auth.companyId,
        outletId: validated.outlet_id,
        tableIds: validated.table_ids,
        startTs,
        endTs
      });

      if (!availability.available) {
        return errorResponse(
          "CONFLICT",
          `Tables not available: ${availability.conflicts.map(c => c.tableCode).join(', ')}`,
          409
        );
      }

      if (availability.totalCapacity < validated.guest_count) {
        return errorResponse(
          "INVALID_REQUEST",
          `Insufficient capacity: ${availability.totalCapacity} seats for ${validated.guest_count} guests`,
          400
        );
      }

      // Create group + reservations
      const result = await createReservationGroupWithTables({
        companyId: auth.companyId,
        outletId: validated.outlet_id,
        customerName: validated.customer_name,
        customerPhone: validated.customer_phone ?? null,
        guestCount: validated.guest_count,
        tableIds: validated.table_ids,
        reservationAt: validated.reservation_at,
        durationMinutes: validated.duration_minutes ?? null,
        notes: validated.notes ?? null
      });

      return successResponse({
        group_id: result.groupId,
        reservation_ids: result.reservationIds
      });

    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request format", 400);
      }

      console.error("POST /api/reservation-groups failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create reservation group", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "create",
      outletId: async (request, auth) => {
        try {
          const payload = await request.clone().json();
          return payload.outlet_id;
        } catch {
          return null;
        }
      }
    })
  ]
);