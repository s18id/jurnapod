// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import { setUserPassword, UserNotFoundError } from "../../../../../src/lib/users";

const updatePasswordSchema = z
  .object({
    password: z.string().min(8).max(255)
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
      const input = updatePasswordSchema.parse(payload);
      await setUserPassword({
        companyId: auth.companyId,
        userId,
        password: input.password,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(null);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof UserNotFoundError) {
        return errorResponse("NOT_FOUND", "User not found", 404);
      }

      console.error("POST /api/users/:userId/password failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Password reset failed", 500);
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
