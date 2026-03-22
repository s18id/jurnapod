// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { TableSuggestionQuerySchema } from "@jurnapod/shared";
import { withAuth, requireAccess } from "@/lib/auth-guard";
import { suggestTableCombinations } from "@/lib/reservation-groups";
import { errorResponse, successResponse } from "@/lib/response";
import { ZodError } from "zod";

/**
 * GET /api/reservation-groups/suggest-tables
 * 
 * Suggests optimal table combinations for a large party.
 * Uses Unix timestamps to find available tables during time range.
 * 
 * Query params:
 * - outlet_id: number (required)
 * - guest_count: number (2-100, required)
 * - reservation_at: ISO 8601 datetime string (required)
 * - duration_minutes: number (15-480, default 120)
 * 
 * Response:
 * - success: true
 * - data: { suggestions: [{ tables, total_capacity, excess_capacity, score }] }
 * 
 * @example
 * GET /api/reservation-groups/suggest-tables?outlet_id=1&guest_count=10&reservation_at=2026-01-15T19:00:00Z&duration_minutes=120
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const query = TableSuggestionQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        guest_count: url.searchParams.get("guest_count"),
        reservation_at: url.searchParams.get("reservation_at"),
        duration_minutes: url.searchParams.get("duration_minutes") ?? 120
      });

      // Convert to Unix timestamps
      const startTs = new Date(query.reservation_at).getTime();
      const durationMs = query.duration_minutes * 60 * 1000;
      const endTs = startTs + durationMs;

      const suggestions = await suggestTableCombinations({
        companyId: auth.companyId,
        outletId: query.outlet_id,
        guestCount: query.guest_count,
        startTs,
        endTs,
        maxSuggestions: 5
      });

      return successResponse({ suggestions });

    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request format", 400);
      }

      console.error("GET /api/reservation-groups/suggest-tables failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get table suggestions", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "read"
    })
  ]
);