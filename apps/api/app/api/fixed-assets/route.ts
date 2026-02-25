import {
  FixedAssetCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import {
  createFixedAsset,
  DatabaseConflictError,
  DatabaseReferenceError,
  listFixedAssets
} from "../../../src/lib/master-data";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Fixed asset request failed"
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
      const outletIdRaw = url.searchParams.get("outlet_id");

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
        }
      }

      const outletId = outletIdRaw == null ? undefined : NumericIdSchema.parse(outletIdRaw);
      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const assets = await listFixedAssets(auth.companyId, { outletId, isActive });

      return Response.json({ ok: true, assets }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /fixed-assets failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = FixedAssetCreateRequestSchema.parse(payload);
      const asset = await createFixedAsset(auth.companyId, {
        outlet_id: input.outlet_id ?? null,
        asset_tag: input.asset_tag,
        name: input.name,
        serial_number: input.serial_number,
        purchase_date: input.purchase_date ?? null,
        purchase_cost: input.purchase_cost ?? null,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      return Response.json({ ok: true, asset }, { status: 201 });
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

      console.error("POST /fixed-assets failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
