// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, OutletTableBulkCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../../../src/lib/auth";
import { readClientIp } from "../../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { createOutletTablesBulk, OutletTableBulkConflictError } from "../../../../../../src/lib/outlet-tables";

const CODE_EDIT_ALLOWED_ROLES = ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN"] as const;

export const POST = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/");
      const outletIdIndex = pathSegments.indexOf("outlets") + 1;
      const outletIdRaw = pathSegments[outletIdIndex];
      const outletId = NumericIdSchema.parse(outletIdRaw);

      const body = await request.json();
      const input = OutletTableBulkCreateRequestSchema.parse(body);

      if (input.outlet_id !== outletId) {
        return errorResponse("OUTLET_MISMATCH", "Outlet ID mismatch", 400);
      }

      const access = await checkUserAccess({
        userId: auth.userId,
        companyId: auth.companyId,
        allowedRoles: CODE_EDIT_ALLOWED_ROLES,
        outletId
      });

      if (!access || (!access.hasRole && !access.isSuperAdmin)) {
        return errorResponse(
          "FORBIDDEN",
          "Only SUPER_ADMIN, OWNER, or COMPANY_ADMIN can bulk-create table codes",
          403
        );
      }

      const tables = await createOutletTablesBulk({
        company_id: auth.companyId,
        outlet_id: outletId,
        code_template: input.code_template,
        name_template: input.name_template,
        start_seq: input.start_seq,
        count: input.count,
        zone: input.zone ?? null,
        capacity: input.capacity ?? null,
        status: input.status ?? "AVAILABLE",
        actor: {
          userId: auth.userId,
          outletId: outletId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse({ created_count: tables.length, tables }, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof OutletTableBulkConflictError) {
        return errorResponse("DUPLICATE_TABLE", error.message, 409);
      }

      if (error instanceof Error && error.message.startsWith("Generated table")) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /api/outlets/:outletId/tables/bulk failed", error);
      return errorResponse(
        "INTERNAL_SERVER_ERROR",
        error instanceof Error ? error.message : "Bulk table create failed",
        500
      );
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
