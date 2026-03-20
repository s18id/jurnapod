// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ReservationCreateRequestSchema,
  ReservationListQuerySchema,
  type ReservationListQuery
} from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { getCompany } from "../../../src/lib/companies";
import { toDateTimeRangeWithTimezone } from "../../../src/lib/date-helpers";
import { getOutlet } from "../../../src/lib/outlets";
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

export class MissingReservationTimezoneError extends Error {
  constructor() {
    super("Timezone is required for date-only reservation filtering");
    this.name = "MissingReservationTimezoneError";
  }
}

export function isValidTimeZone(timezone?: string | null): timezone is string {
  if (!timezone || !timezone.trim()) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone.trim() });
    return true;
  } catch {
    return false;
  }
}

export function pickReservationTimezone(
  outletTimezone?: string | null,
  companyTimezone?: string | null
): string | null {
  if (isValidTimeZone(outletTimezone)) {
    return outletTimezone.trim();
  }
  if (isValidTimeZone(companyTimezone)) {
    return companyTimezone.trim();
  }
  return null;
}

export function applyDateOnlyRange(
  query: ReservationListQuery,
  timezone: string | null
): ReservationListQuery {
  const hasDateOnlyRange = Boolean(query.date_from || query.date_to);
  if (!hasDateOnlyRange) {
    return query;
  }

  if (!timezone) {
    throw new MissingReservationTimezoneError();
  }

  const dateFrom = query.date_from ?? query.date_to;
  const dateTo = query.date_to ?? query.date_from;
  if (!dateFrom || !dateTo) {
    return query;
  }

  const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, timezone);
  return {
    ...query,
    from: range.fromStartUTC,
    to: range.toEndUTC
  };
}

async function resolveReservationTimezone(companyId: number, outletId: number): Promise<string | null> {
  let outletTimezone: string | null = null;
  let companyTimezone: string | null = null;

  try {
    const outlet = await getOutlet(companyId, outletId);
    outletTimezone = outlet.timezone ?? null;
  } catch {
    // fallback to company timezone below
  }

  try {
    const company = await getCompany(companyId);
    companyTimezone = company.timezone ?? null;
  } catch {
    // fall through
  }

  return pickReservationTimezone(outletTimezone, companyTimezone);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const query = ReservationListQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        status: url.searchParams.get("status") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined
      });

      const timezone = Boolean(query.date_from || query.date_to)
        ? await resolveReservationTimezone(auth.companyId, query.outlet_id)
        : null;
      const normalizedQuery = applyDateOnlyRange(query, timezone);

      const rows = await listReservations(auth.companyId, normalizedQuery);
      return successResponse(rows);
    } catch (error) {
      if (error instanceof MissingReservationTimezoneError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

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
