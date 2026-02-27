import { CompanyCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import { userHasAnyRole } from "../../../src/lib/auth";
import { listCompanies, createCompany, CompanyCodeExistsError } from "../../../src/lib/companies";
import { readClientIp } from "../../../src/lib/request-meta";

const INTERNAL_SERVER_ERROR_RESPONSE = {
  success: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Companies request failed"
  }
};

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const url = new URL(_request.url);
      const includeDeletedParam = url.searchParams.get("include_deleted");
      const includeDeleted = includeDeletedParam === "1" || includeDeletedParam === "true";
      const isSuperAdmin = await userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
      const companies = await listCompanies(
        isSuperAdmin
          ? { includeDeleted }
          : { companyId: auth.companyId }
      );
      return Response.json({ success: true, data: companies }, { status: 200 });
    } catch (error) {
      console.error("GET /api/companies failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["SUPER_ADMIN", "OWNER"])]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      const input = CompanyCreateRequestSchema.parse({
        code: typeof body.code === "string" ? body.code.trim().toUpperCase() : "",
        name: typeof body.name === "string" ? body.name.trim() : ""
      });

      const company = await createCompany({
        code: input.code,
        name: input.name,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return Response.json({ success: true, data: company }, { status: 201 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid company payload" }
        }, { status: 400 });
      }
      console.error("POST /api/companies failed", error);
      if (error instanceof CompanyCodeExistsError) {
        return Response.json({
          success: false,
          error: { code: "DUPLICATE_COMPANY", message: error.message }
        }, { status: 409 });
      }
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["SUPER_ADMIN"])]
);
