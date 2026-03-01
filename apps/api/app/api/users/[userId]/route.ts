import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../src/lib/request-meta";
import {
  findUserById,
  updateUserEmail,
  UserEmailExistsError,
  UserNotFoundError
} from "../../../../src/lib/users";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND",
    message: "User not found"
  }
};

const DUPLICATE_EMAIL_RESPONSE = {
  ok: false,
  error: {
    code: "DUPLICATE_EMAIL",
    message: "Email already exists"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "User request failed"
  }
};

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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, user }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("GET /api/users/:userId failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "users", permission: "read" })]
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

      return Response.json({ ok: true, user }, { status: 200 });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof UserNotFoundError) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      if (error instanceof UserEmailExistsError) {
        return Response.json(DUPLICATE_EMAIL_RESPONSE, { status: 409 });
      }

      console.error("PATCH /api/users/:userId failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "users", permission: "update" })]
);
