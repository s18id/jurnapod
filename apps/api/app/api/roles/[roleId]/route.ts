// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  getRoleWithPermissions,
  updateRole,
  deleteRole,
  RoleNotFoundError,
  RoleLevelViolationError
} from "../../../../src/lib/users";

function parseRoleId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const roleIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(roleIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const roleId = parseRoleId(request);
      const role = await getRoleWithPermissions({ roleId, companyId: auth.companyId });
      return successResponse(role);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof RoleNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof RoleLevelViolationError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }
      console.error("GET /api/roles/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Role request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "roles", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const roleId = parseRoleId(request);
      const body = await request.json();
      const { name } = body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Role name is required", 400);
      }

      const role = await updateRole({
        companyId: auth.companyId,
        roleId,
        name: name.trim(),
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(role);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof RoleNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof RoleLevelViolationError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }
      console.error("PATCH /api/roles/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Role request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "roles", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const roleId = parseRoleId(request);
      await deleteRole({
        companyId: auth.companyId,
        roleId,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });
      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof RoleNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof Error && error.message.includes("Cannot delete role")) {
        return errorResponse("ROLE_IN_USE", error.message, 409);
      }
      console.error("DELETE /api/roles/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Role request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "roles", permission: "delete" })]
);
