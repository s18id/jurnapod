// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../src/lib/response";

const MODULES = [
  { code: "companies", name: "Companies" },
  { code: "users", name: "Users" },
  { code: "roles", name: "Roles" },
  { code: "outlets", name: "Outlets" },
  { code: "accounts", name: "Accounts" },
  { code: "journals", name: "Journals" },
  { code: "cash_bank", name: "Cash & Bank" },
  { code: "sales", name: "Sales" },
  { code: "inventory", name: "Inventory" },
  { code: "purchasing", name: "Purchasing" },
  { code: "reports", name: "Reports" },
  { code: "settings", name: "Settings" },
  { code: "pos", name: "POS" }
];

const PERMISSIONS = [
  { code: "read", name: "Read", bitmask: 1 },
  { code: "write", name: "Write", bitmask: 2 },
  { code: "delete", name: "Delete", bitmask: 4 },
  { code: "admin", name: "Admin", bitmask: 8 }
];

export const GET = withAuth(
  async (_request, _auth) => {
    try {
      const modules = MODULES.map((mod) => ({
        code: mod.code,
        name: mod.name,
        permissions: PERMISSIONS.map((perm) => ({
          code: perm.code,
          name: perm.name,
          bitmask: perm.bitmask
        }))
      }));

      return successResponse({ modules });
    } catch (error) {
      console.error("GET /api/permissions failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Permissions request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"], module: "roles", permission: "read" })]
);
