import { ItemUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import {
  DatabaseConflictError,
  deleteItem,
  findItemById,
  updateItem
} from "../../../../src/lib/master-data";

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
    message: "Item not found"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Item conflict"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Items request failed"
  }
};

function parseItemId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const itemIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(itemIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);
      const item = await findItemById(auth.companyId, itemId);

      if (!item) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, item }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /items/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);
      const payload = await request.json();
      const input = ItemUpdateRequestSchema.parse(payload);

      const item = await updateItem(auth.companyId, itemId, {
        sku: input.sku,
        name: input.name,
        type: input.type,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      if (!item) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, item }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      console.error("PATCH /items/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);
      const removed = await deleteItem(auth.companyId, itemId, {
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

      console.error("DELETE /items/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
