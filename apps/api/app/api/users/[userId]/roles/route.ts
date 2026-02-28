import { NumericIdSchema, RoleSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireRole, requireModulePermission, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { RoleNotFoundError, setUserRoles, UserNotFoundError } from "../../../../../src/lib/users";

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

const ROLE_NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "ROLE_NOT_FOUND",
    message: "Role not found"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "User roles update failed"
  }
};

const updateRolesSchema = z
  .object({
    roles: z.array(RoleSchema).optional(),
    role_codes: z.array(RoleSchema).optional()
  })
  .transform((value) => ({
    roleCodes: value.roles ?? value.role_codes ?? []
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
      const user = await setUserRoles({
        companyId: auth.companyId,
        userId,
        roleCodes: input.roleCodes,
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

      if (error instanceof RoleNotFoundError) {
        return Response.json(ROLE_NOT_FOUND_RESPONSE, { status: 400 });
      }

      console.error("POST /api/users/:userId/roles failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "SUPER_ADMIN"]), requireModulePermission("users", "update")]
);
