import {
  DepreciationPlanCreateRequestSchema,
  DepreciationPlanUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import {
  createDepreciationPlan,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  DepreciationPlanStatusError,
  DepreciationPlanValidationError,
  getDepreciationPlanForFixedAsset,
  updateDepreciationPlan
} from "../../../../../../src/lib/depreciation";

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
    message: "Depreciation plan not found"
  }
};

const FORBIDDEN_RESPONSE = {
  ok: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Depreciation plan conflict"
  }
};

const REFERENCE_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REFERENCE",
    message: "Invalid depreciation reference"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Depreciation plan request failed"
  }
};

function parseAssetId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const assetIdRaw = pathname.split("/").filter(Boolean).slice(-2)[0];
  return NumericIdSchema.parse(assetIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const plan = await getDepreciationPlanForFixedAsset(auth.companyId, assetId);

      return Response.json({ ok: true, plan }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/accounts/fixed-assets/:id/depreciation-plan failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = DepreciationPlanCreateRequestSchema.parse(payload);

      if (input.asset_id !== assetId) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      const plan = await createDepreciationPlan(auth.companyId, input, {
        userId: auth.userId
      });

      return Response.json({ ok: true, plan }, { status: 201 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DepreciationPlanValidationError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseReferenceError) {
        return Response.json(REFERENCE_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseForbiddenError) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      console.error("POST /api/accounts/fixed-assets/:id/depreciation-plan failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "create" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = DepreciationPlanUpdateRequestSchema.parse(payload);
      const current = await getDepreciationPlanForFixedAsset(auth.companyId, assetId);

      if (!current) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      const plan = await updateDepreciationPlan(auth.companyId, current.id, input, {
        userId: auth.userId
      });

      if (!plan) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, plan }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DepreciationPlanValidationError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DepreciationPlanStatusError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      if (error instanceof DatabaseReferenceError) {
        return Response.json(REFERENCE_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseForbiddenError) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      console.error("PATCH /api/accounts/fixed-assets/:id/depreciation-plan failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);
