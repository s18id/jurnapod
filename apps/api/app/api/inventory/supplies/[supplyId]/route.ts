// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, SupplyUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import {
  DatabaseConflictError,
  deleteSupply,
  findSupplyById,
  updateSupply
} from "../../../../../src/lib/master-data";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND",
    message: "Supply not found"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Supply conflict"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Supplies request failed"
  }
};

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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, supply }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/inventory/supplies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, supply }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      console.error("PATCH /api/inventory/supplies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("DELETE /api/inventory/supplies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);
