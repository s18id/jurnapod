import {
  ItemPriceUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  deleteItemPrice,
  findItemPriceById,
  updateItemPrice
} from "../../../../src/lib/master-data";
import { userHasOutletAccess } from "../../../../src/lib/auth";

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
    message: "Item price not found"
  }
};

const REFERENCE_NOT_FOUND_RESPONSE = {
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

function parsePriceId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const priceIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(priceIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const priceId = parsePriceId(request);
      const itemPrice = await findItemPriceById(auth.companyId, priceId);

      if (!itemPrice) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      const hasOutletAccess = await userHasOutletAccess(
        auth.userId,
        auth.companyId,
        itemPrice.outlet_id
      );
      if (!hasOutletAccess) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      return Response.json({ ok: true, item_price: itemPrice }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /item-prices/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const priceId = parsePriceId(request);
      const payload = await request.json();
      const input = ItemPriceUpdateRequestSchema.parse(payload);

      const existingItemPrice = await findItemPriceById(auth.companyId, priceId);
      if (!existingItemPrice) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      const hasCurrentOutletAccess = await userHasOutletAccess(
        auth.userId,
        auth.companyId,
        existingItemPrice.outlet_id
      );
      if (!hasCurrentOutletAccess) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      if (typeof input.outlet_id === "number") {
        const hasTargetOutletAccess = await userHasOutletAccess(
          auth.userId,
          auth.companyId,
          input.outlet_id
        );
        if (!hasTargetOutletAccess) {
          return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
        }
      }

      const itemPrice = await updateItemPrice(auth.companyId, priceId, input, {
        userId: auth.userId
      });

      if (!itemPrice) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, item_price: itemPrice }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseForbiddenError) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      if (error instanceof DatabaseReferenceError) {
        return Response.json(REFERENCE_NOT_FOUND_RESPONSE, { status: 404 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      console.error("PATCH /item-prices/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const priceId = parsePriceId(request);

      const existingItemPrice = await findItemPriceById(auth.companyId, priceId);
      if (!existingItemPrice) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      const hasOutletAccess = await userHasOutletAccess(
        auth.userId,
        auth.companyId,
        existingItemPrice.outlet_id
      );
      if (!hasOutletAccess) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      const removed = await deleteItemPrice(auth.companyId, priceId, {
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

      if (error instanceof DatabaseForbiddenError) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      console.error("DELETE /item-prices/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
