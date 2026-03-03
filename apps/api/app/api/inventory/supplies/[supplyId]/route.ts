// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, SupplyUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  deleteSupply,
  findSupplyById,
  updateSupply
} from "../../../../../src/lib/master-data";

function parseSupplyId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const supplyIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(supplyIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const supplyId = parseSupplyId(request);
      const supply = await findSupplyById(auth.companyId, supplyId);

      if (!supply) {
        return errorResponse("NOT_FOUND", "Supply not found", 404);
      }

      return successResponse(supply);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/supplies/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Supplies request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const supplyId = parseSupplyId(request);
      const payload = await request.json();
      const input = SupplyUpdateRequestSchema.parse(payload);

      const supply = await updateSupply(auth.companyId, supplyId, {
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      if (!supply) {
        return errorResponse("NOT_FOUND", "Supply not found", 404);
      }

      return successResponse(supply);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Supply conflict", 409);
      }

      console.error("PATCH /api/inventory/supplies/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Supplies request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const supplyId = parseSupplyId(request);
      const removed = await deleteSupply(auth.companyId, supplyId, {
        userId: auth.userId
      });

      if (!removed) {
        return errorResponse("NOT_FOUND", "Supply not found", 404);
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("DELETE /api/inventory/supplies/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Supplies request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);
