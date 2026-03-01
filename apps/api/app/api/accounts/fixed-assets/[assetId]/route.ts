import { FixedAssetUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  deleteFixedAsset,
  findFixedAssetById,
  updateFixedAsset
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
    message: "Fixed asset not found"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Fixed asset conflict"
  }
};

const REFERENCE_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REFERENCE",
    message: "Invalid fixed asset reference"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Fixed asset request failed"
  }
};

function parseAssetId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const assetIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(assetIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const asset = await findFixedAssetById(auth.companyId, assetId);

      if (!asset) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, asset }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/accounts/fixed-assets/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = FixedAssetUpdateRequestSchema.parse(payload);

      const asset = await updateFixedAsset(auth.companyId, assetId, {
        outlet_id: input.outlet_id ?? null,
        category_id: input.category_id ?? null,
        asset_tag: input.asset_tag,
        name: input.name,
        serial_number: input.serial_number,
        purchase_date: input.purchase_date ?? null,
        purchase_cost: input.purchase_cost ?? null,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      if (!asset) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, asset }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      if (error instanceof DatabaseReferenceError) {
        return Response.json(REFERENCE_RESPONSE, { status: 400 });
      }

      console.error("PATCH /api/accounts/fixed-assets/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const removed = await deleteFixedAsset(auth.companyId, assetId, {
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

      console.error("DELETE /api/accounts/fixed-assets/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "delete" })]
);
