// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Account Routes
 *
 * Routes for account management:
 * - GET /accounts - List accounts with filtering
 * - GET /accounts/:id - Get single account
 * - POST /accounts - Create new account (stub)
 *
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  AccountCreateRequestSchema,
  AccountUpdateRequestSchema,
  AccountListQuerySchema,
  NumericIdSchema
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  createAccount,
  updateAccount,
  listAccounts,
  getAccountById,
  getAccountTree,
  AccountCodeExistsError,
  CircularReferenceError,
  ParentAccountCompanyMismatchError,
  AccountTypeCompanyMismatchError
} from "../lib/accounts.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const ACCOUNT_ROLES = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"] as const;

const accountListQuerySchema = z.object({
  company_id: NumericIdSchema,
  is_active: z.string().optional().transform((val) => {
    if (val === undefined || val === "") return undefined;
    return val === "true" || val === "1";
  }),
  is_payable: z.string().optional().transform((val) => {
    if (val === undefined || val === "") return undefined;
    return val === "true" || val === "1";
  }),
  report_group: z.enum(["NRC", "PL"]).optional(),
  parent_account_id: NumericIdSchema.optional().nullable(),
  search: z.string().trim().optional(),
  include_children: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === "") return false;
      return val === "true" || val === "1";
    })
    .default("false")
});

// =============================================================================
// Account Routes
// =============================================================================

const accountRoutes = new Hono();

// Auth middleware
accountRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /accounts - List accounts with optional filtering
accountRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ACCOUNT_ROLES],
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const query = accountListQuerySchema.parse({
      company_id: url.searchParams.get("company_id") || String(auth.companyId),
      is_active: url.searchParams.get("is_active") || undefined,
      is_payable: url.searchParams.get("is_payable") || undefined,
      report_group: url.searchParams.get("report_group") || undefined,
      parent_account_id: url.searchParams.get("parent_account_id") || undefined,
      search: url.searchParams.get("search") || undefined,
      include_children: url.searchParams.get("include_children") || undefined
    });

    // Verify company_id matches authenticated user
    if (query.company_id !== auth.companyId) {
      return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
    }

    const accounts = await listAccounts(query);

    return successResponse(accounts);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }

    console.error("GET /accounts failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/tree - Get hierarchical account tree
accountRoutes.get("/tree", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ACCOUNT_ROLES],
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const includeInactive = url.searchParams.get("include_inactive") !== "false";
    
    const tree = await getAccountTree(auth.companyId, includeInactive);
    return successResponse(tree);
  } catch (error) {
    console.error("GET /accounts/tree failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/:id - Get single account
accountRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ACCOUNT_ROLES],
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const accountIdParam = c.req.param("id");
    const accountId = NumericIdSchema.parse(accountIdParam);

    // Get account and verify company ownership
    const account = await getAccountById(accountId, auth.companyId);

    if (!account) {
      return errorResponse("NOT_FOUND", "Account not found", 404);
    }

    return successResponse(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid account ID", 400);
    }

    console.error("GET /accounts/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts - Create new account
accountRoutes.post("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ACCOUNT_ROLES],
    module: "accounts",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = AccountCreateRequestSchema.parse(payload);

    // Verify company_id matches authenticated user
    if (input.company_id !== auth.companyId) {
      return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
    }

    const account = await createAccount(input, auth.userId);

    return successResponse(account, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof AccountCodeExistsError) {
      return errorResponse("DUPLICATE_CODE", "Account code already exists", 409);
    }

    if (error instanceof ParentAccountCompanyMismatchError) {
      return errorResponse("INVALID_PARENT", "Parent account not found or belongs to different company", 400);
    }

    if (error instanceof AccountTypeCompanyMismatchError) {
      return errorResponse("INVALID_ACCOUNT_TYPE", "Account type not found or belongs to different company", 400);
    }

    if (error instanceof CircularReferenceError) {
      return errorResponse("CIRCULAR_REFERENCE", "Circular reference not allowed", 409);
    }

    console.error("POST /accounts failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// PUT /accounts/:id - Update account
accountRoutes.put("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ACCOUNT_ROLES],
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const accountId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = AccountUpdateRequestSchema.parse(payload);

    const account = await updateAccount(accountId, input, auth.companyId, auth.userId);

    return successResponse(account);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof AccountCodeExistsError) {
      return errorResponse("DUPLICATE_CODE", "Account code already exists", 409);
    }

    if (error instanceof ParentAccountCompanyMismatchError) {
      return errorResponse("INVALID_PARENT", "Parent account not found or belongs to different company", 400);
    }

    if (error instanceof AccountTypeCompanyMismatchError) {
      return errorResponse("INVALID_ACCOUNT_TYPE", "Account type not found or belongs to different company", 400);
    }

    if (error instanceof CircularReferenceError) {
      return errorResponse("CIRCULAR_REFERENCE", "Circular reference not allowed", 409);
    }

    console.error("PUT /accounts/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/types - Get account types
accountRoutes.get("/types", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ACCOUNT_ROLES],
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const { listAccountTypes } = await import("../lib/account-types.js");
    const types = await listAccountTypes({ company_id: auth.companyId });
    return successResponse(types);
  } catch (error) {
    console.error("GET /accounts/types failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

export { accountRoutes };
