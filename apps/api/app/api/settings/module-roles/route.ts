import { ModuleSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { listModuleRoles } from "../../../../src/lib/users";

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
    message: "Module roles request failed"
  }
};

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const roleIdParam = url.searchParams.get("role_id");
      const moduleParam = url.searchParams.get("module");

      const roleId = roleIdParam ? NumericIdSchema.parse(roleIdParam) : undefined;
      const moduleName = moduleParam ? ModuleSchema.parse(moduleParam) : undefined;

      const moduleRoles = await listModuleRoles({
        companyId: auth.companyId,
        roleId,
        module: moduleName
      });
      return Response.json({ success: true, data: moduleRoles }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      console.error("GET /api/settings/module-roles failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "settings", permission: "read" })]
);
