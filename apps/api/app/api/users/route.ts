// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { userHasAnyRole } from "../../../src/lib/auth";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";
import {
  createUser,
  listUsers,
  OutletNotFoundError,
  RoleNotFoundError,
  UserEmailExistsError
} from "../../../src/lib/users";

const createUserSchema = z
  .object({
    company_id: NumericIdSchema.optional(),
    email: z.string().trim().email().max(191),
    password: z.string().min(8).max(255),
    role_codes: z.array(RoleSchema).optional(),
    outlet_ids: z.array(NumericIdSchema).optional(),
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
      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const search = url.searchParams.get("search")?.trim() || undefined;
      const users = await listUsers(auth.companyId, { isActive, search });

      return successResponse(users);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/users failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Users request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "users", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = createUserSchema.parse(payload);
      const companyId = input.company_id ?? auth.companyId;

      if (companyId !== auth.companyId) {
        const isSuperAdmin = await userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
        if (!isSuperAdmin) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      if (input.role_codes?.includes("SUPER_ADMIN")) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const user = await createUser({
        companyId,
        email: input.email,
        password: input.password,
        roleCodes: input.role_codes,
        outletIds: input.outlet_ids,
        isActive: input.is_active,
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

      console.error("POST /api/users failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Users request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "users", permission: "create" })]
);
