import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, requireModulePermission, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import {
  reactivateCompany,
  CompanyNotFoundError,
  CompanyAlreadyActiveError
} from "../../../../../src/lib/companies";

const INVALID_REQUEST_RESPONSE = {
  success: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  success: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Company reactivation failed"
  }
};

function parseCompanyId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const companyIdRaw = pathname.split("/").filter(Boolean).at(-2);
  return NumericIdSchema.parse(companyIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const company = await reactivateCompany({
        companyId,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return Response.json({ success: true, data: company }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      if (error instanceof CompanyAlreadyActiveError) {
        return Response.json({
          success: false,
          error: { code: "COMPANY_ALREADY_ACTIVE", message: error.message }
        }, { status: 409 });
      }
      console.error("POST /api/companies/:id/reactivate failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["SUPER_ADMIN"]), requireModulePermission("companies", "update")]
);
