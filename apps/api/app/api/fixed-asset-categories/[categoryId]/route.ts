import {
  FixedAssetCategoryUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import {
  DatabaseConflictError,
  deleteFixedAssetCategory,
  findFixedAssetCategoryById,
  updateFixedAssetCategory
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
    message: "Fixed asset category not found"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Fixed asset category conflict"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Fixed asset category request failed"
  }
};

function parseCategoryId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const categoryIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(categoryIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const categoryId = parseCategoryId(request);
      const category = await findFixedAssetCategoryById(auth.companyId, categoryId);

      if (!category) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, category }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /fixed-asset-categories/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const categoryId = parseCategoryId(request);
      const payload = await request.json();
      const input = FixedAssetCategoryUpdateRequestSchema.parse(payload);

      const category = await updateFixedAssetCategory(
        auth.companyId,
        categoryId,
        {
          code: input.code,
          name: input.name,
          depreciation_method: input.depreciation_method,
          useful_life_months: input.useful_life_months,
          residual_value_pct: input.residual_value_pct,
          expense_account_id: input.expense_account_id,
          accum_depr_account_id: input.accum_depr_account_id,
          is_active: input.is_active
        },
        {
          userId: auth.userId
        }
      );

      if (!category) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, category }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      console.error("PATCH /fixed-asset-categories/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const categoryId = parseCategoryId(request);
      const removed = await deleteFixedAssetCategory(auth.companyId, categoryId, {
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

      console.error("DELETE /fixed-asset-categories/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
