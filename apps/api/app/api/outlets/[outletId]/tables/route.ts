// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, OutletTableCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  listOutletTablesByOutlet,
  createOutletTable,
  OutletTableCodeExistsError,
  OutletTableStatusConflictError
} from "../../../../../src/lib/outlet-tables";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/");
      const outletIdIndex = pathSegments.indexOf("outlets") + 1;
      const outletIdRaw = pathSegments[outletIdIndex];
      const outletId = NumericIdSchema.parse(outletIdRaw);

      const tables = await listOutletTablesByOutlet(auth.companyId, outletId);
      return successResponse(tables);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/outlets/:outletId/tables failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Tables request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "pos",
      permission: "read"
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/");
      const outletIdIndex = pathSegments.indexOf("outlets") + 1;
      const outletIdRaw = pathSegments[outletIdIndex];
      const outletId = NumericIdSchema.parse(outletIdRaw);

      const body = await request.json();
      const input = OutletTableCreateRequestSchema.parse(body);

      // Ensure outlet_id in body matches URL parameter
      if (input.outlet_id !== outletId) {
        return errorResponse("OUTLET_MISMATCH", "Outlet ID mismatch", 400);
      }

      const table = await createOutletTable({
        company_id: auth.companyId,
        outlet_id: outletId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        zone: input.zone ?? null,
        capacity: input.capacity ?? null,
        status: input.status ?? "AVAILABLE",
        status_id: input.status_id,
        actor: {
          userId: auth.userId,
          outletId: outletId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(table, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof OutletTableCodeExistsError) {
        return errorResponse("DUPLICATE_TABLE", error.message, 409);
      }

      if (error instanceof OutletTableStatusConflictError) {
        return errorResponse("TABLE_STATUS_CONFLICT", error.message, 409);
      }

      console.error("POST /api/outlets/:outletId/tables failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Tables request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "pos",
      permission: "create"
    })
  ]
);
