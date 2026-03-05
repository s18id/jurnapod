// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  findUserById,
  RoleNotFoundError,
  RoleLevelViolationError,
  RoleScopeViolationError,
  setUserRoles,
  UserNotFoundError
} from "../../../../../src/lib/users";

const updateRolesSchema = z
  .object({
    roles: z.array(RoleSchema).optional(),
    role_codes: z.array(RoleSchema).optional(),
    outlet_id: NumericIdSchema.optional()
  })
  .transform((value) => ({
    roleCodes: value.roles ?? value.role_codes ?? [],
    outletId: value.outlet_id
  }));

function parseUserId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const userIdRaw = pathname.split("/").filter(Boolean).at(-2);
  return NumericIdSchema.parse(userIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const userId = parseUserId(request);
      const payload = await request.json();
      const input = updateRolesSchema.parse(payload);
      if (input.roleCodes.includes("SUPER_ADMIN")) {
        const existing = await findUserById(auth.companyId, userId);
        if (!existing) {
          return errorResponse("NOT_FOUND", "User not found", 404);
        }
        if (!existing.global_roles.includes("SUPER_ADMIN")) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }
      const user = await setUserRoles({
        companyId: auth.companyId,
        userId,
        roleCodes: input.roleCodes,
        outletId: input.outletId,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(user);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof UserNotFoundError) {
        return errorResponse("NOT_FOUND", "User not found", 404);
      }

      if (error instanceof RoleNotFoundError) {
        return errorResponse("ROLE_NOT_FOUND", "Role not found", 400);
      }

      if (error instanceof RoleLevelViolationError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof RoleScopeViolationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /api/users/:userId/roles failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "User roles update failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "users",
      permission: "update"
    })
  ]
);
