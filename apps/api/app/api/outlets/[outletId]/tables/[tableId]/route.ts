// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, OutletTableUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../../../src/lib/auth";
import { readClientIp } from "../../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  getOutletTable,
  updateOutletTable,
  deleteOutletTable,
  OutletTableStatusConflictError,
  OutletTableCodeExistsError,
  OutletTableNotFoundError
} from "../../../../../../src/lib/outlet-tables";

const CODE_EDIT_ALLOWED_ROLES = ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN"] as const;

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/");
      const outletIdIndex = pathSegments.indexOf("outlets") + 1;
      const tableIdIndex = pathSegments.indexOf("tables") + 1;
      const outletIdRaw = pathSegments[outletIdIndex];
      const tableIdRaw = pathSegments[tableIdIndex];
      const outletId = NumericIdSchema.parse(outletIdRaw);
      const tableId = NumericIdSchema.parse(tableIdRaw);

      const table = await getOutletTable(auth.companyId, outletId, tableId);
      return successResponse(table);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof OutletTableNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("GET /api/outlets/:outletId/tables/:tableId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Table request failed", 500);
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

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/");
      const outletIdIndex = pathSegments.indexOf("outlets") + 1;
      const tableIdIndex = pathSegments.indexOf("tables") + 1;
      const outletIdRaw = pathSegments[outletIdIndex];
      const tableIdRaw = pathSegments[tableIdIndex];
      const outletId = NumericIdSchema.parse(outletIdRaw);
      const tableId = NumericIdSchema.parse(tableIdRaw);

      const body = await request.json();
      const input = OutletTableUpdateRequestSchema.parse(body);

      if (input.code !== undefined) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          allowedRoles: CODE_EDIT_ALLOWED_ROLES,
          outletId
        });

        if (!access || (!access.hasRole && !access.isSuperAdmin)) {
          return errorResponse(
            "FORBIDDEN",
            "Only SUPER_ADMIN, OWNER, or COMPANY_ADMIN can edit table code",
            403
          );
        }
      }

      const table = await updateOutletTable({
        companyId: auth.companyId,
        outletId: outletId,
        tableId: tableId,
        code: input.code,
        name: input.name,
        zone: input.zone,
        capacity: input.capacity,
        status: input.status,
        status_id: input.status_id,
        actor: {
          userId: auth.userId,
          outletId: outletId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(table);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof OutletTableNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof OutletTableCodeExistsError) {
        return errorResponse("DUPLICATE_TABLE", error.message, 409);
      }

      if (error instanceof OutletTableStatusConflictError) {
        return errorResponse("TABLE_STATUS_CONFLICT", error.message, 409);
      }

      console.error("PUT /api/outlets/:outletId/tables/:tableId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Table update failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "pos",
      permission: "update"
    })
  ]
);

async function deactivateTableHandler(request: Request, auth: { companyId: number; userId: number }) {
  try {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const outletIdIndex = pathSegments.indexOf("outlets") + 1;
    const tableIdIndex = pathSegments.indexOf("tables") + 1;
    const outletIdRaw = pathSegments[outletIdIndex];
    const tableIdRaw = pathSegments[tableIdIndex];
    const outletId = NumericIdSchema.parse(outletIdRaw);
    const tableId = NumericIdSchema.parse(tableIdRaw);

    await deleteOutletTable({
      companyId: auth.companyId,
      outletId: outletId,
      tableId: tableId,
      actor: {
        userId: auth.userId,
        outletId: outletId,
        ipAddress: readClientIp(request)
      }
    });

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof OutletTableNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof Error && error.message.includes("Cannot delete table")) {
      return errorResponse("TABLE_IN_USE", error.message, 400);
    }

    if (error instanceof OutletTableStatusConflictError) {
      return errorResponse("TABLE_STATUS_CONFLICT", error.message, 409);
    }

    console.error("PATCH /api/outlets/:outletId/tables/:tableId/deactivate failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Table deactivate failed", 500);
  }
}

export const PATCH = withAuth(
  async (request, auth) => deactivateTableHandler(request, auth),
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "pos",
      permission: "update"
    })
  ]
);

export const DELETE = withAuth(
  async (request, auth) => {
    return deactivateTableHandler(request, auth);
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "pos",
      permission: "delete"
    })
  ]
);
