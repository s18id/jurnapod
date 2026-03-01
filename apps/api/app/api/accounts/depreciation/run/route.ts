import { DepreciationRunCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import {
  DatabaseForbiddenError,
  DatabaseReferenceError,
  DepreciationPlanStatusError,
  DepreciationPlanValidationError,
  runDepreciationPlan
} from "../../../../../src/lib/depreciation";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const FORBIDDEN_RESPONSE = {
  ok: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const REFERENCE_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REFERENCE",
    message: "Invalid depreciation reference"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Depreciation run conflict"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Depreciation run failed"
  }
};

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = DepreciationRunCreateRequestSchema.parse(payload);
      const result = await runDepreciationPlan(auth.companyId, input, {
        userId: auth.userId
      });

      return Response.json(
        {
          ok: true,
          duplicate: result.duplicate,
          run: result.run
        },
        { status: 200 }
      );
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

      console.error("POST /api/accounts/depreciation/run failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);
