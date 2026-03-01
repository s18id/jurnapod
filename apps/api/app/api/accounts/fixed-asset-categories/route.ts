// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  FixedAssetCategoryCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import {
  createFixedAssetCategory,
  DatabaseConflictError,
  listFixedAssetCategories
} from "../../../../src/lib/master-data";

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
    message: "Fixed asset category request failed"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Fixed asset category conflict"
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

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const categories = await listFixedAssetCategories(auth.companyId, { isActive });

      return Response.json({ ok: true, categories }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/accounts/fixed-asset-categories failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = FixedAssetCategoryCreateRequestSchema.parse(payload);
      const category = await createFixedAssetCategory(
        auth.companyId,
        {
          code: input.code,
          name: input.name,
          depreciation_method: input.depreciation_method,
          useful_life_months: input.useful_life_months,
          residual_value_pct: input.residual_value_pct,
          expense_account_id: input.expense_account_id ?? null,
          accum_depr_account_id: input.accum_depr_account_id ?? null,
          is_active: input.is_active
        },
        {
          userId: auth.userId
        }
      );

      return Response.json({ ok: true, category }, { status: 201 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof DatabaseConflictError) {
        return Response.json(CONFLICT_RESPONSE, { status: 409 });
      }

      console.error("POST /api/accounts/fixed-asset-categories failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "create" })]
);
