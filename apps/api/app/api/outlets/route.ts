// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { listOutletsByCompany, listAllOutlets, createOutlet, OutletCodeExistsError } from "../../../src/lib/outlets";

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
    message: "Outlets request failed"
  }
};

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");
      
      // If company_id specified, use it; otherwise use auth.companyId
      const companyId = companyIdRaw 
        ? NumericIdSchema.parse(companyIdRaw)
        : auth.companyId;
      
      const outlets = await listOutletsByCompany(companyId);
      return Response.json({ success: true, data: outlets }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/outlets failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "outlets", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      const { company_id, code, name } = body;

      // Use provided company_id or default to auth.companyId
      const targetCompanyId = company_id ?? auth.companyId;

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return Response.json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Outlet code is required" }
        }, { status: 400 });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return Response.json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Outlet name is required" }
        }, { status: 400 });
      }

      const outlet = await createOutlet({
        company_id: targetCompanyId,
        code: code.trim().toUpperCase(),
        name: name.trim()
      });

      return Response.json({ success: true, data: outlet }, { status: 201 });
    } catch (error) {
      console.error("POST /api/outlets failed", error);
      if (error instanceof OutletCodeExistsError) {
        return Response.json({
          ok: false,
          error: { code: "DUPLICATE_OUTLET", message: error.message }
        }, { status: 409 });
      }
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "outlets", permission: "create" })]
);
