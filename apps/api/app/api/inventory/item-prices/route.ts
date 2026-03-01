// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ItemPriceCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import {
  createItemPrice,
  DatabaseConflictError,
  DatabaseReferenceError,
  listItemPrices
} from "../../../../src/lib/master-data";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";

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
    message: "Item or outlet not found"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Item price conflict"
  }
};

const FORBIDDEN_RESPONSE = {
  ok: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Item prices request failed"
  }
};

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

function parseOptionalOutletId(value: string | null): number | undefined {
  if (value == null) {
    return undefined;
  }

  return NumericIdSchema.parse(value);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
        }
      }

      const outletId = parseOptionalOutletId(url.searchParams.get("outlet_id"));
      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));

      if (typeof outletId === "number") {
        const hasOutletAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
        if (!hasOutletAccess) {
          return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
        }

        const prices = await listItemPrices(auth.companyId, {
          outletId,
          isActive
        });

        return Response.json({ ok: true, prices }, { status: 200 });
      }

      const outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      const prices = await listItemPrices(auth.companyId, {
        outletIds,
        isActive
      });

      return Response.json({ ok: true, prices }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/inventory/item-prices failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ItemPriceCreateRequestSchema.parse(payload);
      const hasOutletAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasOutletAccess) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      const itemPrice = await createItemPrice(auth.companyId, input, {
        userId: auth.userId
      });

      return Response.json({ ok: true, item_price: itemPrice }, { status: 201 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseReferenceError) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      console.error("POST /api/inventory/item-prices failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);
