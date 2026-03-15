// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../src/lib/auth";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";
import {
  createUser,
  listUsers,
  OutletNotFoundError,
  RoleNotFoundError,
  RoleLevelViolationError,
  RoleScopeViolationError,
  UserEmailExistsError
} from "../../../src/lib/users";

const createUserSchema = z
  .object({
    company_id: NumericIdSchema.optional(),
    name: z.string().trim().min(1).max(191).optional(),
    email: z.string().trim().email().max(191),
    password: z.string().min(8).max(255).optional(),
    role_codes: z.array(RoleSchema).optional(),
    outlet_ids: z.array(NumericIdSchema).optional(),
    outlet_role_assignments: z
      .array(
        z.object({
          outlet_id: NumericIdSchema,
          role_codes: z.array(RoleSchema)
        })
      )
      .optional(),
    is_active: z.boolean().optional()
  })
  .strict();

function parseOptionalIsActive(value: string | null): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new ZodError([]);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");
      let targetCompanyId = auth.companyId;

      if (companyIdRaw != null) {
        const requestedCompanyId = NumericIdSchema.parse(companyIdRaw);
        if (requestedCompanyId !== auth.companyId) {
          const access = await checkUserAccess({
            userId: auth.userId,
            companyId: auth.companyId,
            allowedRoles: ["SUPER_ADMIN"]
          });
          const isSuperAdmin = access?.isSuperAdmin ?? false;
          if (!isSuperAdmin) {
            return errorResponse("FORBIDDEN", "Cannot list users for another company", 403);
          }
          targetCompanyId = requestedCompanyId;
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const search = url.searchParams.get("search")?.trim() || undefined;
      const users = await listUsers(targetCompanyId, { isActive, search });

      return successResponse(users);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/users failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Users request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "users",
      permission: "read"
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = createUserSchema.parse(payload);
      const companyId = input.company_id ?? auth.companyId;

      if (companyId !== auth.companyId) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          allowedRoles: ["SUPER_ADMIN"]
        });
        const isSuperAdmin = access?.isSuperAdmin ?? false;
        if (!isSuperAdmin) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      if (input.role_codes?.includes("SUPER_ADMIN")) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const user = await createUser({
        companyId,
        name: input.name,
        email: input.email,
        password: input.password,
        roleCodes: input.role_codes,
        outletIds: input.outlet_ids,
        outletRoleAssignments: input.outlet_role_assignments?.map((assignment) => ({
          outletId: assignment.outlet_id,
          roleCodes: assignment.role_codes
        })),
        isActive: input.is_active ?? false,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(user, 201);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof UserEmailExistsError) {
        return errorResponse("DUPLICATE_EMAIL", "Email already exists", 409);
      }

      if (error instanceof RoleNotFoundError) {
        return errorResponse("ROLE_NOT_FOUND", "Role not found", 400);
      }

      if (error instanceof OutletNotFoundError) {
        return errorResponse("OUTLET_NOT_FOUND", "Outlet not found", 400);
      }

      if (error instanceof RoleLevelViolationError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof RoleScopeViolationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /api/users failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Users request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "users",
      permission: "create"
    })
  ]
);
