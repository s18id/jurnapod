// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../src/lib/auth";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";
import { listRoles, createRole } from "../../../src/lib/users";

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const access = await checkUserAccess({
        userId: _auth.userId,
        companyId: _auth.companyId,
        allowedRoles: ["SUPER_ADMIN"]
      });
      const isSuperAdmin = access?.isSuperAdmin ?? false;

      const url = new URL(request.url);
      const filterCompanyId = url.searchParams.get("company_id");
      const companyIdFilter = filterCompanyId ? Number(filterCompanyId) : undefined;

      const roles = await listRoles(_auth.companyId, isSuperAdmin, companyIdFilter);
      return successResponse(roles);
    } catch (error) {
      console.error("GET /api/roles failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Roles request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "roles", permission: "read" })]
);

export const POST = withAuth(
  async (request, _auth) => {
    try {
      const body = await request.json();
      const { code, name, role_level } = body;

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Role code is required", 400);
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Role name is required", 400);
      }

      const role = await createRole({
        companyId: _auth.companyId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        roleLevel: typeof role_level === "number" ? role_level : 0,
        actor: {
          userId: _auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(role, 201);
    } catch (error) {
      console.error("POST /api/roles failed", error);
      if (error instanceof Error && error.message.includes("already exists")) {
        return errorResponse("DUPLICATE_ROLE", error.message, 409);
      }
      if (error instanceof Error && error.message.includes("Insufficient role level")) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Roles request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "roles", permission: "create" })]
);
