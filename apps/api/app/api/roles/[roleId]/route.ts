import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getRole, updateRole, deleteRole, RoleNotFoundError } from "../../../../src/lib/users";

const INVALID_REQUEST_RESPONSE = {
  success: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  success: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Role request failed"
  }
};

function parseRoleId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const roleIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(roleIdRaw);
}

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const roleId = parseRoleId(request);
      const role = await getRole(roleId);
      return Response.json({ success: true, data: role }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof RoleNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("GET /api/roles/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "roles", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, _auth) => {
    try {
      const roleId = parseRoleId(request);
      const body = await request.json();
      const { name } = body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return Response.json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Role name is required" }
        }, { status: 400 });
      }

      const role = await updateRole({
        roleId,
        name: name.trim()
      });

      return Response.json({ success: true, data: role }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof RoleNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("PATCH /api/roles/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "roles", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, _auth) => {
    try {
      const roleId = parseRoleId(request);
      await deleteRole({ roleId });
      return Response.json({ success: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof RoleNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      if (error instanceof Error && error.message.includes("Cannot delete role")) {
        return Response.json({
          success: false,
          error: { code: "ROLE_IN_USE", message: error.message }
        }, { status: 409 });
      }
      console.error("DELETE /api/roles/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "roles", permission: "delete" })]
);
