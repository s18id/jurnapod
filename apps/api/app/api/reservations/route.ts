// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ReservationCreateRequestSchema,
  ReservationListQuerySchema
} from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { createReservation, listReservations, ReservationValidationError } from "../../../src/lib/reservations";
import { errorResponse, successResponse } from "../../../src/lib/response";

function parseOutletIdForListGuard(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return ReservationListQuerySchema.shape.outlet_id.parse(outletIdRaw);
}

async function parseOutletIdForCreateGuard(request: Request): Promise<number> {
  try {
    const payload = await request.clone().json();
    const parsed = ReservationCreateRequestSchema.parse(payload);
    return parsed.outlet_id;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidJsonGuardError;
    }
    throw error;
  }
}

const invalidJsonGuardError = new ZodError([
  {
    code: z.ZodIssueCode.custom,
    message: "Invalid request",
    path: []
  }
]);

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const query = ReservationListQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        status: url.searchParams.get("status") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined
      });

      const rows = await listReservations(auth.companyId, query);
      return successResponse(rows);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/reservations failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Reservations request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "read",
      outletId: (request) => parseOutletIdForListGuard(request)
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ReservationCreateRequestSchema.parse(payload);
      const reservation = await createReservation(auth.companyId, input);
      return successResponse(reservation, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof ReservationValidationError) {
        return errorResponse("VALIDATION_ERROR", error.message, 400);
      }

      console.error("POST /api/reservations failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create reservation", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      module: "pos",
      permission: "create",
      outletId: (request) => parseOutletIdForCreateGuard(request)
    })
  ]
);
