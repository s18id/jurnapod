// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../src/lib/response";
import { listRoles, createRole } from "../../../src/lib/users";

export const GET = withAuth(
  async (_request, _auth) => {
    try {
      const roles = await listRoles();
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
      const { code, name } = body;

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Role code is required", 400);
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Role name is required", 400);
      }

      const role = await createRole({
        code: code.trim().toUpperCase(),
        name: name.trim()
      });

      return successResponse(role, 201);
    } catch (error) {
      console.error("POST /api/roles failed", error);
      if (error instanceof Error && error.message.includes("already exists")) {
        return errorResponse("DUPLICATE_ROLE", error.message, 409);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Roles request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "roles", permission: "create" })]
);
