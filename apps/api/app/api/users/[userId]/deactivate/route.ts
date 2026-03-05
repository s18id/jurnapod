// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import { setUserActiveState, UserNotFoundError } from "../../../../../src/lib/users";

function parseUserId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const userIdRaw = pathname.split("/").filter(Boolean).at(-2);
  return NumericIdSchema.parse(userIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const userId = parseUserId(request);
      const user = await setUserActiveState({
        companyId: auth.companyId,
        userId,
        isActive: false,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof UserNotFoundError) {
        return errorResponse("NOT_FOUND", "User not found", 404);
      }

      console.error("POST /api/users/:userId/deactivate failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "User deactivation failed", 500);
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
