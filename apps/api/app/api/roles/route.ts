import { requireRole, requireModulePermission, withAuth } from "../../../src/lib/auth-guard";
import { listRoles, createRole } from "../../../src/lib/users";

const INTERNAL_SERVER_ERROR_RESPONSE = {
  success: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Roles request failed"
  }
};

export const GET = withAuth(
  async (_request, _auth) => {
    try {
      const roles = await listRoles();
      return Response.json({ success: true, data: roles }, { status: 200 });
    } catch (error) {
      console.error("GET /api/roles failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["SUPER_ADMIN", "OWNER", "ADMIN"]), requireModulePermission("roles", "read")]
);

export const POST = withAuth(
  async (request, _auth) => {
    try {
      const body = await request.json();
      const { code, name } = body;

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return Response.json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Role code is required" }
        }, { status: 400 });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return Response.json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Role name is required" }
        }, { status: 400 });
      }

      const role = await createRole({
        code: code.trim().toUpperCase(),
        name: name.trim()
      });

      return Response.json({ success: true, data: role }, { status: 201 });
    } catch (error) {
      console.error("POST /api/roles failed", error);
      if (error instanceof Error && error.message.includes("already exists")) {
        return Response.json({
          success: false,
          error: { code: "DUPLICATE_ROLE", message: error.message }
        }, { status: 409 });
      }
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["SUPER_ADMIN", "OWNER"]), requireModulePermission("roles", "create")]
);
