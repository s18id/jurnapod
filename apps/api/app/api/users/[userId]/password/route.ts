import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireRole, requireModulePermission, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { setUserPassword, UserNotFoundError } from "../../../../../src/lib/users";

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

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Password reset failed"
  }
};

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

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof UserNotFoundError) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      console.error("POST /api/users/:userId/password failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "SUPER_ADMIN"]), requireModulePermission("users", "update")]
);
