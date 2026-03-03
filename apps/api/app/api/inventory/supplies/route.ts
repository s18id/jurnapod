// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  NumericIdSchema,
  SupplyCreateRequestSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { createSupply, DatabaseConflictError, listSupplies } from "../../../../src/lib/master-data";
import { errorResponse, successResponse } from "../../../../src/lib/response";

function parseOptionalIsActive(value: string | null): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new ZodError([]);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const supplies = await listSupplies(auth.companyId, { isActive });

      return successResponse(supplies);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/supplies failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Supplies request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = SupplyCreateRequestSchema.parse(payload);
      const supply = await createSupply(auth.companyId, {
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      return successResponse(supply, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Supply conflict", 409);
      }

      console.error("POST /api/inventory/supplies failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Supplies request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);
