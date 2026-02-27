import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import { listCompanies, createCompany, CompanyCodeExistsError } from "../../../src/lib/companies";

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Companies request failed"
  }
};

export const GET = withAuth(
  async (_request, _auth) => {
    try {
      const companies = await listCompanies();
      return Response.json({ success: true, data: companies }, { status: 200 });
    } catch (error) {
      console.error("GET /api/companies failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER"])]
);

export const POST = withAuth(
  async (request, _auth) => {
    try {
      const body = await request.json();
      const { code, name } = body;

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return Response.json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Company code is required" }
        }, { status: 400 });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return Response.json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Company name is required" }
        }, { status: 400 });
      }

      const company = await createCompany({
        code: code.trim().toUpperCase(),
        name: name.trim()
      });

      return Response.json({ success: true, data: company }, { status: 201 });
    } catch (error) {
      console.error("POST /api/companies failed", error);
      if (error instanceof CompanyCodeExistsError) {
        return Response.json({
          ok: false,
          error: { code: "DUPLICATE_COMPANY", message: error.message }
        }, { status: 409 });
      }
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER"])]
);
