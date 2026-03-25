// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Account Routes
 *
 * Routes for account management:
 * - GET /accounts - List accounts with filtering
 * - GET /accounts/:id - Get single account
 * - POST /accounts - Create new account
 *
 * Access control: Uses permission bitmask from module_roles
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  AccountCreateRequestSchema,
  AccountUpdateRequestSchema,
  AccountListQuerySchema,
  NumericIdSchema,
  FixedAssetCategoryCreateRequestSchema,
  FixedAssetCategoryUpdateRequestSchema,
  FixedAssetCreateRequestSchema,
  FixedAssetUpdateRequestSchema,
  DepreciationPlanCreateRequestSchema,
  DepreciationPlanUpdateRequestSchema,
  DepreciationRunCreateRequestSchema,
  AcquisitionRequestSchema,
  TransferRequestSchema,
  ImpairmentRequestSchema,
  DisposalRequestSchema,
  VoidEventRequestSchema
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { listUserOutletIds } from "../lib/auth.js";
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
import {
  listFiscalYears,
  createFiscalYear,
  FiscalYearNotFoundError,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearOverlapError,
  FiscalYearOpenConflictError,
  FiscalYearNotOpenError
} from "../lib/fiscal-years.js";
import {
  listFixedAssetCategories,
  createFixedAssetCategory,
  updateFixedAssetCategory,
  deleteFixedAssetCategory,
  findFixedAssetCategoryById,
  listFixedAssets,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
  findFixedAssetById
} from "../lib/master-data.js";
import {
  createDepreciationPlan,
  updateDepreciationPlan,
  runDepreciationPlan,
  getLatestDepreciationPlan,
  DepreciationPlanValidationError,
  DepreciationPlanStatusError,
  DatabaseReferenceError
} from "../lib/depreciation.js";
import {
  recordAcquisition,
  recordTransfer,
  recordImpairment,
  recordDisposal,
  voidEvent,
  getAssetLedger,
  getAssetBook
} from "../lib/fixed-assets-lifecycle.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

// Note: We use module permissions (bitmask) for access control
// Permission bitmask: create=1, read=2, update=4, delete=8

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

// =============================================================================
// Fixed Asset Categories Routes
// =============================================================================

// GET /accounts/fixed-asset-categories - List fixed asset categories
accountRoutes.get("/fixed-asset-categories", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const isActiveParam = url.searchParams.get("is_active");

    const categories = await listFixedAssetCategories(auth.companyId, {
      isActive: isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined
    });

    return successResponse(categories);
  } catch (error) {
    console.error("GET /accounts/fixed-asset-categories failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts/fixed-asset-categories - Create fixed asset category
accountRoutes.post("/fixed-asset-categories", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = FixedAssetCategoryCreateRequestSchema.parse(payload);

    const category = await createFixedAssetCategory(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(category, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /accounts/fixed-asset-categories failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/fixed-asset-categories/:id - Get single fixed asset category
accountRoutes.get("/fixed-asset-categories/:id", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const categoryId = NumericIdSchema.parse(c.req.param("id"));
    const category = await findFixedAssetCategoryById(auth.companyId, categoryId);

    if (!category) {
      return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
    }

    return successResponse(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid category ID", 400);
    }

    console.error("GET /accounts/fixed-asset-categories/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// PATCH /accounts/fixed-asset-categories/:id - Update fixed asset category
accountRoutes.patch("/fixed-asset-categories/:id", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const categoryId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = FixedAssetCategoryUpdateRequestSchema.parse(payload);

    const category = await updateFixedAssetCategory(auth.companyId, categoryId, input, {
      userId: auth.userId
    });

    if (!category) {
      return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
    }

    return successResponse(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PATCH /accounts/fixed-asset-categories/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// DELETE /accounts/fixed-asset-categories/:id - Delete fixed asset category
accountRoutes.delete("/fixed-asset-categories/:id", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "delete"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const categoryId = NumericIdSchema.parse(c.req.param("id"));
    const deleted = await deleteFixedAssetCategory(auth.companyId, categoryId, {
      userId: auth.userId
    });

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
    }

    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid category ID", 400);
    }

    console.error("DELETE /accounts/fixed-asset-categories/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// =============================================================================
// Fixed Assets Routes
// =============================================================================

// GET /accounts/fixed-assets - List fixed assets
accountRoutes.get("/fixed-assets", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    const isActiveParam = url.searchParams.get("is_active");

    // Get allowed outlet IDs from user's role assignments for outlet scoping
    const allowedOutletIds = await listUserOutletIds(auth.userId, auth.companyId);

    const assets = await listFixedAssets(auth.companyId, {
      outletId: outletIdParam ? NumericIdSchema.parse(outletIdParam) : undefined,
      isActive: isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined,
      allowedOutletIds
    });

    return successResponse(assets);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
    }

    console.error("GET /accounts/fixed-assets failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts/fixed-assets - Create fixed asset
accountRoutes.post("/fixed-assets", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = FixedAssetCreateRequestSchema.parse(payload);

    const asset = await createFixedAsset(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(asset, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /accounts/fixed-assets failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/fixed-assets/:id - Get single fixed asset
accountRoutes.get("/fixed-assets/:id", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const asset = await findFixedAssetById(auth.companyId, assetId);

    if (!asset) {
      return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
    }

    // Check outlet access - unassigned assets (outlet_id = NULL) are visible to all
    // but assigned assets must be in user's allowed outlets
    if (asset.outlet_id !== null) {
      const allowedOutletIds = await listUserOutletIds(auth.userId, auth.companyId);
      if (allowedOutletIds !== undefined && !allowedOutletIds.includes(asset.outlet_id)) {
        return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
      }
    }

    return successResponse(asset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    console.error("GET /accounts/fixed-assets/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// PATCH /accounts/fixed-assets/:id - Update fixed asset
accountRoutes.patch("/fixed-assets/:id", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = FixedAssetUpdateRequestSchema.parse(payload);

    const asset = await updateFixedAsset(auth.companyId, assetId, input, {
      userId: auth.userId
    });

    if (!asset) {
      return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
    }

    return successResponse(asset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PATCH /accounts/fixed-assets/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// DELETE /accounts/fixed-assets/:id - Delete fixed asset
accountRoutes.delete("/fixed-assets/:id", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "delete"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const deleted = await deleteFixedAsset(auth.companyId, assetId, {
      userId: auth.userId
    });

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
    }

    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    console.error("DELETE /accounts/fixed-assets/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts/fixed-assets/:id/depreciation-plan - Create depreciation plan for fixed asset
accountRoutes.post("/fixed-assets/:id/depreciation-plan", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = DepreciationPlanCreateRequestSchema.parse(payload);

    const plan = await createDepreciationPlan(
      auth.companyId,
      {
        asset_id: assetId,
        outlet_id: input.outlet_id,
        method: input.method,
        start_date: input.start_date,
        useful_life_months: input.useful_life_months,
        salvage_value: input.salvage_value,
        purchase_cost_snapshot: input.purchase_cost_snapshot,
        expense_account_id: input.expense_account_id,
        accum_depr_account_id: input.accum_depr_account_id,
        status: input.status
      },
      { userId: auth.userId }
    );

    return successResponse(plan, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("INVALID_REFERENCE", error.message, 400);
    }

    if (error instanceof DepreciationPlanValidationError) {
      return errorResponse("VALIDATION_ERROR", error.message, 400);
    }

    console.error("POST /accounts/fixed-assets/:id/depreciation-plan failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// PATCH /accounts/fixed-assets/:id/depreciation-plan - Update depreciation plan for fixed asset
accountRoutes.patch("/fixed-assets/:id/depreciation-plan", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = DepreciationPlanUpdateRequestSchema.parse(payload);

    // First, find the depreciation plan for this asset
    const existingPlan = await getLatestDepreciationPlan(auth.companyId, assetId);
    if (!existingPlan) {
      return errorResponse("NOT_FOUND", "Depreciation plan not found for this asset", 404);
    }

    // Update the plan
    const updatedPlan = await updateDepreciationPlan(auth.companyId, existingPlan.id, input, {
      userId: auth.userId
    });

    if (!updatedPlan) {
      return errorResponse("NOT_FOUND", "Depreciation plan not found", 404);
    }

    return successResponse(updatedPlan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("INVALID_REFERENCE", error.message, 400);
    }

    if (error instanceof DepreciationPlanStatusError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DepreciationPlanValidationError) {
      return errorResponse("VALIDATION_ERROR", error.message, 400);
    }

    console.error("PATCH /accounts/fixed-assets/:id/depreciation-plan failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts/depreciation/run - Run depreciation for a period
accountRoutes.post("/depreciation/run", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = DepreciationRunCreateRequestSchema.parse(payload);

    const result = await runDepreciationPlan(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse({
      duplicate: result.duplicate,
      run: result.run
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof DepreciationPlanValidationError) {
      return errorResponse("VALIDATION_ERROR", error.message, 400);
    }

    if (error instanceof DepreciationPlanStatusError) {
      return errorResponse("CONFLICT", "Depreciation run conflict", 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("INVALID_REFERENCE", "Invalid depreciation reference", 400);
    }

    if (error instanceof FiscalYearNotOpenError) {
      return errorResponse(
        "FISCAL_YEAR_CLOSED",
        "Depreciation run date is outside any open fiscal year",
        400
      );
    }

    console.error("POST /accounts/depreciation/run failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Depreciation run failed", 500);
  }
});

// GET /accounts/:id - Get single account
accountRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
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

// =============================================================================
// Fiscal Years Routes
// =============================================================================

// POST /accounts/fiscal-years - Create fiscal year
accountRoutes.post("/fiscal-years", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "accounts",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = z.object({
      company_id: NumericIdSchema,
      code: z.string().min(1).max(32),
      name: z.string().min(1).max(100),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      status: z.enum(["OPEN", "CLOSED"]).optional().default("OPEN")
    }).parse(payload);

    const fiscalYear = await createFiscalYear({
      company_id: input.company_id,
      code: input.code,
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status
    }, auth.userId);

    return successResponse(fiscalYear, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof FiscalYearOpenConflictError) {
      return errorResponse("OPEN_YEAR_CONFLICT", error.message, 409);
    }

    if (error instanceof FiscalYearOverlapError) {
      return errorResponse("OPEN_YEAR_OVERLAP", error.message, 409);
    }

    if (error instanceof FiscalYearDateRangeError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    if (error instanceof FiscalYearCodeExistsError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /accounts/fiscal-years failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create fiscal year", 500);
  }
});

// GET /accounts/fiscal-years - List fiscal years
accountRoutes.get("/fiscal-years", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "accounts",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const companyIdParam = url.searchParams.get("company_id");
    const statusParam = url.searchParams.get("status");
    const includeClosedParam = url.searchParams.get("include_closed");

    const companyId = companyIdParam ? NumericIdSchema.parse(companyIdParam) : auth.companyId;
    const status = statusParam as "OPEN" | "CLOSED" | undefined;
    const includeClosed = includeClosedParam === "true";

    const fiscalYears = await listFiscalYears({
      company_id: companyId,
      status: status,
      include_closed: includeClosed
    });

    return successResponse(fiscalYears);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
    }

    console.error("GET /accounts/fiscal-years failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list fiscal years", 500);
  }
});

// GET /accounts/types - Get account types
accountRoutes.get("/types", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
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

// ============================================================================
// Fixed Asset Lifecycle Routes
// ============================================================================

// POST /accounts/fixed-assets/:id/acquisition - Record asset acquisition
accountRoutes.post("/fixed-assets/:id/acquisition", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = AcquisitionRequestSchema.parse(payload);

    // Verify asset exists
    const asset = await findFixedAssetById(auth.companyId, assetId);
    if (!asset) {
      return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
    }

    const result = await recordAcquisition(auth.companyId, assetId, input, {
      userId: auth.userId
    });

    return successResponse({
      event_id: result.event_id,
      journal_batch_id: result.journal_batch_id,
      book: result.book,
      duplicate: result.duplicate
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Fixed asset not found", 404);
    }
    if (err.code === "ASSET_ALREADY_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset already disposed", 409);
    }
    if (err.code === "DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }
    if (err.code === "INVALID_REFERENCE") {
      return errorResponse("INVALID_REFERENCE", err.message || "Invalid reference", 400);
    }
    if (err.code === "FORBIDDEN") {
      return errorResponse("FORBIDDEN", err.message || "Forbidden", 403);
    }

    console.error("POST /accounts/fixed-assets/:id/acquisition failed", error);
    return errorResponse("INTERNAL_ERROR", "Acquisition failed", 500);
  }
});

// POST /accounts/fixed-assets/:id/transfer - Transfer asset to another outlet
accountRoutes.post("/fixed-assets/:id/transfer", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = TransferRequestSchema.parse(payload);

    const result = await recordTransfer(auth.companyId, assetId, input, {
      userId: auth.userId
    });

    return successResponse({
      event_id: result.event_id,
      journal_batch_id: result.journal_batch_id,
      to_outlet_id: result.to_outlet_id,
      duplicate: result.duplicate
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Asset not found", 404);
    }
    if (err.code === "ASSET_NOT_ACTIVE" || err.code === "ASSET_ALREADY_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset is not active", 409);
    }
    if (err.code === "DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }

    console.error("POST /accounts/fixed-assets/:id/transfer failed", error);
    return errorResponse("INTERNAL_ERROR", "Transfer failed", 500);
  }
});

// POST /accounts/fixed-assets/:id/impairment - Record asset impairment
accountRoutes.post("/fixed-assets/:id/impairment", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = ImpairmentRequestSchema.parse(payload);

    const result = await recordImpairment(auth.companyId, assetId, input, {
      userId: auth.userId
    });

    return successResponse({
      event_id: result.event_id,
      journal_batch_id: result.journal_batch_id,
      book: result.book,
      duplicate: result.duplicate
    }, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Asset not found", 404);
    }
    if (err.code === "ASSET_NOT_ACTIVE" || err.code === "ASSET_ALREADY_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset is not active", 409);
    }
    if (err.code === "DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }
    if (err.code === "INVALID_STATE") {
      return errorResponse("CONFLICT", err.message || "Invalid asset state", 409);
    }

    console.error("POST /accounts/fixed-assets/:id/impairment failed", error);
    return errorResponse("INTERNAL_ERROR", "Impairment failed", 500);
  }
});

// POST /accounts/fixed-assets/:id/disposal - Record asset disposal
accountRoutes.post("/fixed-assets/:id/disposal", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = DisposalRequestSchema.parse(payload);

    const result = await recordDisposal(auth.companyId, assetId, input, {
      userId: auth.userId
    });

    return successResponse({
      event_id: result.event_id,
      journal_batch_id: result.journal_batch_id,
      disposal: result.disposal,
      book: result.book,
      duplicate: result.duplicate
    }, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Asset not found", 404);
    }
    if (err.code === "ASSET_ALREADY_DISPOSED" || err.code === "ASSET_NOT_ACTIVE") {
      return errorResponse("CONFLICT", err.message || "Asset already disposed", 409);
    }
    if (err.code === "DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }
    if (err.code === "INVALID_STATE") {
      return errorResponse("CONFLICT", err.message || "Invalid asset state", 409);
    }
    if (err.code === "INVALID_REFERENCE") {
      return errorResponse("CONFLICT", err.message || "Invalid reference", 409);
    }

    console.error("POST /accounts/fixed-assets/:id/disposal failed", error);
    return errorResponse("INTERNAL_ERROR", "Disposal failed", 500);
  }
});

// GET /accounts/fixed-assets/:id/ledger - Get asset ledger
accountRoutes.get("/fixed-assets/:id/ledger", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));

    const ledger = await getAssetLedger(auth.companyId, assetId, { userId: auth.userId });

    return successResponse(ledger);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Asset not found", 404);
    }

    console.error("GET /accounts/fixed-assets/:id/ledger failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to get ledger", 500);
  }
});

// GET /accounts/fixed-assets/:id/book - Get asset book
accountRoutes.get("/fixed-assets/:id/book", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));

    const book = await getAssetBook(auth.companyId, assetId, { userId: auth.userId });

    return successResponse(book);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Asset not found", 404);
    }

    console.error("GET /accounts/fixed-assets/:id/book failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to get book", 500);
  }
});

// POST /accounts/fixed-assets/events/:id/void - Void an event
accountRoutes.post("/fixed-assets/events/:id/void", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "accounts",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const eventId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json().catch(() => ({}));
    const input = VoidEventRequestSchema.parse(payload);

    const result = await voidEvent(auth.companyId, eventId, {
      void_reason: input.void_reason,
      idempotency_key: input.idempotency_key
    }, { userId: auth.userId });

    return successResponse({
      void_event_id: result.void_event_id,
      original_event_id: result.original_event_id,
      journal_batch_id: result.journal_batch_id,
      duplicate: result.duplicate
    }, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND" || err.code === "EVENT_NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Event not found", 404);
    }
    if (err.code === "EVENT_ALREADY_VOIDED" || err.code === "EVENT_NOT_VOIDABLE") {
      return errorResponse("CONFLICT", err.message || "Cannot void this event", 409);
    }

    console.error("POST /accounts/fixed-assets/events/:id/void failed", error);
    return errorResponse("INTERNAL_ERROR", "Void failed", 500);
  }
});

export { accountRoutes };
