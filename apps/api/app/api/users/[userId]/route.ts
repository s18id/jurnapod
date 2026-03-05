// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  findUserById,
  updateUserEmail,
  UserEmailExistsError,
  UserNotFoundError
} from "../../../../src/lib/users";

const updateUserSchema = z
  .object({
    email: z.string().trim().email().max(191)
  })
  .strict();

function parseUserId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const userIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(userIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const userId = parseUserId(request);
      const user = await findUserById(auth.companyId, userId);
      if (!user) {
        return errorResponse("NOT_FOUND", "User not found", 404);
      }

      return successResponse(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/users/:userId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "User request failed", 500);
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

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const userId = parseUserId(request);
      const payload = await request.json();
      const input = updateUserSchema.parse(payload);
      const user = await updateUserEmail({
        companyId: auth.companyId,
        userId,
        email: input.email,
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

      if (error instanceof UserEmailExistsError) {
        return errorResponse("DUPLICATE_EMAIL", "Email already exists", 409);
      }

      console.error("PATCH /api/users/:userId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "User request failed", 500);
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
