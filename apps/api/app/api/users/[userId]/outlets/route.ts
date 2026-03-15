// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  OutletNotFoundError,
  setUserOutlets,
  SuperAdminProtectionError,
  UserNotFoundError
} from "../../../../../src/lib/users";

const updateOutletsSchema = z
  .object({
    outlet_ids: z.array(NumericIdSchema)
  })
  .strict();

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
      const input = updateOutletsSchema.parse(payload);
      const user = await setUserOutlets({
        companyId: auth.companyId,
        userId,
        outletIds: input.outlet_ids,
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

      if (error instanceof OutletNotFoundError) {
        return errorResponse("OUTLET_NOT_FOUND", "Outlet not found", 400);
      }

      if (error instanceof SuperAdminProtectionError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      console.error("POST /api/users/:userId/outlets failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "User outlets update failed", 500);
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
