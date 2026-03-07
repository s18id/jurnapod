// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, ReservationUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import {
  readReservationOutletId,
  ReservationNotFoundError,
  ReservationValidationError,
  updateReservation
} from "../../../../src/lib/reservations";
import { errorResponse, successResponse } from "../../../../src/lib/response";

function parseReservationId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const reservationIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(reservationIdRaw);
}

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const reservationId = parseReservationId(request);
      const payload = await request.json();
      const patch = ReservationUpdateRequestSchema.parse(payload);
      const reservation = await updateReservation(auth.companyId, reservationId, patch);
      return successResponse(reservation);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof ReservationNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof ReservationValidationError) {
        return errorResponse("VALIDATION_ERROR", error.message, 400);
      }

      console.error("PATCH /api/reservations/:reservationId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update reservation", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: async (request, auth) => {
        const reservationId = parseReservationId(request);
        return await readReservationOutletId(auth.companyId, reservationId);
      }
    })
  ]
);
