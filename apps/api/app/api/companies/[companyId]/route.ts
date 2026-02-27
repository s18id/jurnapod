import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getCompany, updateCompany, deleteCompany, CompanyNotFoundError } from "../../../../src/lib/companies";

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
    message: "Company request failed"
  }
};

function parseCompanyId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const companyIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(companyIdRaw);
}

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const companyId = parseCompanyId(request);
      const company = await getCompany(companyId);
      return Response.json({ success: true, data: company }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          ok: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("GET /api/companies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER"])]
);

export const PATCH = withAuth(
  async (request, _auth) => {
    try {
      const companyId = parseCompanyId(request);
      const body = await request.json();
      const { name } = body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return Response.json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Company name is required" }
        }, { status: 400 });
      }

      const company = await updateCompany({
        companyId,
        name: name.trim()
      });

      return Response.json({ success: true, data: company }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          ok: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("PATCH /api/companies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER"])]
);

export const DELETE = withAuth(
  async (request, _auth) => {
    try {
      const companyId = parseCompanyId(request);
      await deleteCompany({ companyId });
      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          ok: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      if (error instanceof Error && error.message.includes("Cannot delete company")) {
        return Response.json({
          ok: false,
          error: { code: "COMPANY_IN_USE", message: error.message }
        }, { status: 409 });
      }
      console.error("DELETE /api/companies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER"])]
);
