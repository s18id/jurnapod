// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, ModuleSchema, ModuleRoleUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { listModuleRoles, setModuleRolePermission, ModuleRoleNotFoundError } from "../../../../../../src/lib/users";

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
    message: "Module role permission update failed"
  }
};

function parseParams(request: Request): { roleId: number; moduleName: string } {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const roleIdRaw = parts[parts.length - 2];
  const moduleRaw = parts[parts.length - 1];
  return {
    roleId: NumericIdSchema.parse(roleIdRaw),
    moduleName: ModuleSchema.parse(moduleRaw)
  };
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { roleId, moduleName } = parseParams(request);
      const moduleRoles = await listModuleRoles({
        companyId: auth.companyId,
        roleId,
        module: moduleName
      });
      if (moduleRoles.length === 0) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: "Module role not found" }
        }, { status: 404 });
      }
      return Response.json({ success: true, data: moduleRoles[0] }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof ModuleRoleNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("GET /api/settings/module-roles/:roleId/:module failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const { roleId, moduleName } = parseParams(request);
      const body = await request.json();
      const input = ModuleRoleUpdateRequestSchema.parse(body);

      const moduleRole = await setModuleRolePermission({
        companyId: auth.companyId,
        roleId,
        module: moduleName,
        permissionMask: input.permission_mask
      });

      return Response.json({ success: true, data: moduleRole }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      console.error("PUT /api/settings/module-roles/:roleId/:module failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })]
);
