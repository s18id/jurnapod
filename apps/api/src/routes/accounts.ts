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
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  AccountCreateRequestSchema,
  AccountUpdateRequestSchema,
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
  getFiscalYearById,
  initiateFiscalYearClose,
  approveFiscalYearClose,
  FiscalYearNotFoundError,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearOverlapError,
  FiscalYearOpenConflictError,
  getFiscalYearClosePreview,
  getFiscalYearStatus,
  FiscalYearAlreadyClosedError,
  FiscalYearClosePreconditionError,
  RetainedEarningsAccountNotFoundError,
  FISCAL_YEAR_CLOSE_STATUS,
} from "../lib/fiscal-years.js";
import {
  getComposedCategoryService,
  getComposedAssetService,
  getComposedDepreciationService,
  getComposedLifecycleService,
} from "../lib/modules-accounting/index.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

// Note: We use module permissions (bitmask) for access control
// Canonical permission bits: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32

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
      module: "accounting",
      resource: "accounts",
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
      module: "accounting",
      resource: "accounts",
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
      module: "accounting",
      resource: "accounts",
      permission: "read"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const isActiveParam = url.searchParams.get("is_active");

    const categoryService = getComposedCategoryService();
    const categories = await categoryService.list(auth.companyId, {
      is_active: isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined
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
      module: "accounting",
      resource: "accounts",
      permission: "create"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = FixedAssetCategoryCreateRequestSchema.parse(payload);

    const categoryService = getComposedCategoryService();
    const category = await categoryService.create(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(category, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_CATEGORY_CODE_EXISTS") {
      return errorResponse("CONFLICT", err.message || "Category code already exists", 409);
    }

    console.error("POST /accounts/fixed-asset-categories failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/fixed-asset-categories/:id - Get single fixed asset category
accountRoutes.get("/fixed-asset-categories/:id", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "read"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const categoryId = NumericIdSchema.parse(c.req.param("id"));
    const categoryService = getComposedCategoryService();
    const category = await categoryService.getById(auth.companyId, categoryId);

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
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const categoryId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = FixedAssetCategoryUpdateRequestSchema.parse(payload);

    const categoryService = getComposedCategoryService();
    const category = await categoryService.update(auth.companyId, categoryId, input, {
      userId: auth.userId
    });

    return successResponse(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_CATEGORY_NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
    }
    if (err.code === "FIXED_ASSET_CATEGORY_CODE_EXISTS") {
      return errorResponse("CONFLICT", err.message || "Category code already exists", 409);
    }

    console.error("PATCH /accounts/fixed-asset-categories/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// DELETE /accounts/fixed-asset-categories/:id - Delete fixed asset category
accountRoutes.delete("/fixed-asset-categories/:id", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "delete"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const categoryId = NumericIdSchema.parse(c.req.param("id"));
    const categoryService = getComposedCategoryService();
    await categoryService.delete(auth.companyId, categoryId, {
      userId: auth.userId
    });

    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid category ID", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_CATEGORY_NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
    }
    if (err.code === "FIXED_ASSET_CATEGORY_NOT_EMPTY") {
      return errorResponse("CONFLICT", "Cannot delete category that has associated assets", 409);
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
      module: "accounting",
      resource: "accounts",
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

    const assetService = getComposedAssetService();
    const assets = await assetService.list(auth.companyId, {
      outlet_id: outletIdParam ? NumericIdSchema.parse(outletIdParam) : undefined,
      is_active: isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined,
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
      module: "accounting",
      resource: "accounts",
      permission: "create"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = FixedAssetCreateRequestSchema.parse(payload);

    const assetService = getComposedAssetService();
    const asset = await assetService.create(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(asset, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_ACCESS_DENIED") {
      return errorResponse("FORBIDDEN", "Access denied to outlet", 403);
    }

    console.error("POST /accounts/fixed-assets failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// GET /accounts/fixed-assets/:id - Get single fixed asset
accountRoutes.get("/fixed-assets/:id", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "read"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const assetService = getComposedAssetService();
    const asset = await assetService.getById(auth.companyId, assetId);

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

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_ACCESS_DENIED") {
      return errorResponse("FORBIDDEN", "Access denied to asset", 403);
    }

    console.error("GET /accounts/fixed-assets/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// PATCH /accounts/fixed-assets/:id - Update fixed asset
accountRoutes.patch("/fixed-assets/:id", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = FixedAssetUpdateRequestSchema.parse(payload);

    const assetService = getComposedAssetService();
    const asset = await assetService.update(auth.companyId, assetId, input, {
      userId: auth.userId
    });

    return successResponse(asset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
    }
    if (err.code === "FIXED_ASSET_ACCESS_DENIED") {
      return errorResponse("FORBIDDEN", "Access denied to asset", 403);
    }

    console.error("PATCH /accounts/fixed-assets/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// DELETE /accounts/fixed-assets/:id - Delete fixed asset
accountRoutes.delete("/fixed-assets/:id", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "delete"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const assetService = getComposedAssetService();
    await assetService.delete(auth.companyId, assetId, {
      userId: auth.userId
    });

    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
    }
    if (err.code === "FIXED_ASSET_ACCESS_DENIED") {
      return errorResponse("FORBIDDEN", "Access denied to asset", 403);
    }
    if (err.code === "FIXED_ASSET_HAS_EVENTS") {
      return errorResponse("CONFLICT", "Cannot delete asset that has lifecycle events", 409);
    }

    console.error("DELETE /accounts/fixed-assets/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts/fixed-assets/:id/depreciation-plan - Create depreciation plan for fixed asset
accountRoutes.post("/fixed-assets/:id/depreciation-plan", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "create"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = DepreciationPlanCreateRequestSchema.parse(payload);

    const depreciationService = getComposedDepreciationService();
    const plan = await depreciationService.createDepreciationPlan(
      auth.companyId,
      assetId,
      {
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

    const err = error as { code?: string; message?: string };
    if (err.code === "DEPRECIATION_PLAN_VALIDATION_ERROR") {
      return errorResponse("VALIDATION_ERROR", err.message || "Invalid depreciation plan", 400);
    }

    console.error("POST /accounts/fixed-assets/:id/depreciation-plan failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// PATCH /accounts/fixed-assets/:id/depreciation-plan - Update depreciation plan for fixed asset
accountRoutes.patch("/fixed-assets/:id/depreciation-plan", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = DepreciationPlanUpdateRequestSchema.parse(payload);

    const depreciationService = getComposedDepreciationService();

    // First, find the depreciation plan for this asset
    const existingPlan = await depreciationService.getPlanByAssetId(assetId, auth.companyId);
    if (!existingPlan) {
      return errorResponse("NOT_FOUND", "Depreciation plan not found for this asset", 404);
    }

    // Update the plan - convert start_date string to Date if provided
    const updateInput = {
      outlet_id: input.outlet_id,
      method: input.method,
      start_date: input.start_date ? new Date(input.start_date) : undefined,
      useful_life_months: input.useful_life_months,
      salvage_value: input.salvage_value,
      expense_account_id: input.expense_account_id,
      accum_depr_account_id: input.accum_depr_account_id,
      status: input.status,
    };

    const updatedPlan = await depreciationService.updateDepreciationPlan(
      auth.companyId,
      existingPlan.id,
      updateInput,
      { userId: auth.userId }
    );

    if (!updatedPlan) {
      return errorResponse("NOT_FOUND", "Depreciation plan not found", 404);
    }

    return successResponse(updatedPlan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "DEPRECIATION_PLAN_STATUS_ERROR") {
      return errorResponse("CONFLICT", err.message || "Depreciation plan has posted runs", 409);
    }
    if (err.code === "DEPRECIATION_PLAN_VALIDATION_ERROR") {
      return errorResponse("VALIDATION_ERROR", err.message || "Invalid depreciation plan", 400);
    }

    console.error("PATCH /accounts/fixed-assets/:id/depreciation-plan failed", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});

// POST /accounts/depreciation/run - Run depreciation for a period
accountRoutes.post("/depreciation/run", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = DepreciationRunCreateRequestSchema.parse(payload);

    // Construct periodKey in YYYY-MM format from period_year and period_month
    const periodKey = `${String(input.period_year).padStart(4, '0')}-${String(input.period_month).padStart(2, '0')}`;

    const depreciationService = getComposedDepreciationService();
    const result = await depreciationService.executeDepreciationRun(
      auth.companyId,
      periodKey,
      { userId: auth.userId }
    );

    // Return the batch result - the module processes all active plans
    return successResponse({
      processedCount: result.processedCount,
      skippedCount: result.skippedCount,
      runs: result.runs
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "DEPRECIATION_PLAN_VALIDATION_ERROR") {
      return errorResponse("VALIDATION_ERROR", err.message || "Invalid depreciation plan", 400);
    }
    if (err.code === "DEPRECIATION_PLAN_STATUS_ERROR") {
      return errorResponse("CONFLICT", "Depreciation run conflict", 409);
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
      module: "accounting",
      resource: "accounts",
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
      module: "accounting",
      resource: "accounts",
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
      module: "accounting",
      resource: "accounts",
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
      module: "accounting",
      resource: "fiscal_years",
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

    // Tenant isolation: users can only create fiscal years for their own company
    if (input.company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot create fiscal year for another company", 403);
    }

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
      module: "accounting",
      resource: "fiscal_years",
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

// GET /accounts/fiscal-years/:id/status - Get fiscal year status including period information
accountRoutes.get("/fiscal-years/:id/status", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "fiscal_years",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const fiscalYearId = NumericIdSchema.parse(c.req.param("id"));

    // Verify company ownership (getFiscalYearStatus checks company_id internally)
    const status = await getFiscalYearStatus(auth.companyId, fiscalYearId);

    return successResponse(status);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid fiscal year ID", 400);
    }

    if (error instanceof FiscalYearNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("GET /accounts/fiscal-years/:id/status failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get fiscal year status", 500);
  }
});

// GET /accounts/fiscal-years/:id/close-preview - Preview closing entries before approval
accountRoutes.get("/fiscal-years/:id/close-preview", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "fiscal_years",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const fiscalYearId = NumericIdSchema.parse(c.req.param("id"));

    // Verify company ownership (getFiscalYearClosePreview checks company_id internally)
    const preview = await getFiscalYearClosePreview(auth.companyId, fiscalYearId);

    return successResponse(preview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid fiscal year ID", 400);
    }

    if (error instanceof FiscalYearNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof FiscalYearAlreadyClosedError) {
      return errorResponse("FISCAL_YEAR_ALREADY_CLOSED", error.message, 409);
    }

    if (error instanceof RetainedEarningsAccountNotFoundError) {
      return errorResponse("RETAINED_EARNINGS_NOT_FOUND", error.message, 400);
    }

    console.error("GET /accounts/fiscal-years/:id/close-preview failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to preview closing entries", 500);
  }
});

// POST /accounts/fiscal-years/:id/close - Initiate fiscal year close procedure
accountRoutes.post("/fiscal-years/:id/close", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "fiscal_years",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const fiscalYearId = NumericIdSchema.parse(c.req.param("id"));

    // Parse optional request body
    const payload = await c.req.json().catch(() => ({}));
    const closeRequestId = (payload as { close_request_id?: string }).close_request_id 
      ?? `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const reason = (payload as { reason?: string }).reason;

    // Get the fiscal year first to check status
    const fiscalYear = await getFiscalYearById(auth.companyId, fiscalYearId);
    if (!fiscalYear) {
      return errorResponse("NOT_FOUND", `Fiscal year ${fiscalYearId} not found`, 404);
    }

    if (fiscalYear.status === "CLOSED") {
      return errorResponse("FISCAL_YEAR_ALREADY_CLOSED", `Fiscal year ${fiscalYearId} is already closed`, 409);
    }

    // Get the close preview to validate preconditions
    // This will throw if preconditions aren't met (e.g., no retained earnings account)
    const preview = await getFiscalYearClosePreview(auth.companyId, fiscalYearId);

    // Initiate close - creates the idempotency record without actually closing
    const closeResult = await initiateFiscalYearClose(
      fiscalYearId,
      closeRequestId,
      {
        companyId: auth.companyId,
        requestedByUserId: auth.userId ?? 0,
        requestedAtEpochMs: Date.now(),
        reason: reason ?? "Fiscal year close initiated"
      }
    );

    // If the close request already existed and succeeded, return info about that
    if (closeResult.status === FISCAL_YEAR_CLOSE_STATUS.SUCCEEDED) {
      return successResponse({
        success: true,
        fiscalYearId: closeResult.fiscalYearId,
        closeRequestId: closeResult.closeRequestId,
        status: closeResult.status,
        message: "Fiscal year was already closed",
        previousStatus: closeResult.previousStatus,
        newStatus: closeResult.newStatus
      });
    }

    // Return the close request info for the next step (approve)
    return successResponse({
      success: false,
      fiscalYearId: closeResult.fiscalYearId,
      closeRequestId: closeResult.closeRequestId,
      status: closeResult.status,
      message: "Fiscal year close initiated. Proceed to approve to post closing entries.",
      canApprove: true,
      netIncome: preview.netIncome,
      totalIncome: preview.totalIncome,
      totalExpenses: preview.totalExpenses,
      closingEntriesCount: preview.closingEntries.length
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid fiscal year ID", 400);
    }

    if (error instanceof FiscalYearNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof FiscalYearAlreadyClosedError) {
      return errorResponse("FISCAL_YEAR_ALREADY_CLOSED", error.message, 409);
    }

    if (error instanceof RetainedEarningsAccountNotFoundError) {
      return errorResponse("RETAINED_EARNINGS_NOT_FOUND", error.message, 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FISCAL_YEAR_CLOSE_CONFLICT") {
      return errorResponse("CLOSE_CONFLICT", err.message || "Close operation conflict", 409);
    }

    console.error("POST /accounts/fiscal-years/:id/close failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to initiate fiscal year close", 500);
  }
});

// POST /accounts/fiscal-years/:id/close/approve - Approve and post closing entries
accountRoutes.post("/fiscal-years/:id/close/approve", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "fiscal_years",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const fiscalYearId = NumericIdSchema.parse(c.req.param("id"));

    // close_request_id is required to preserve idempotency between initiate and approve steps
    const payload = await c.req.json().catch(() => ({}));
    const approvePayload = z.object({
      close_request_id: z.string().min(1)
    }).parse(payload);
    const closeRequestId = approvePayload.close_request_id;

    // Delegate to library function - handles all DB orchestration internally
    const result = await approveFiscalYearClose(
      auth.companyId,
      fiscalYearId,
      closeRequestId,
      {
        companyId: auth.companyId,
        requestedByUserId: auth.userId ?? 0,
        requestedAtEpochMs: Date.now(),
        reason: "Fiscal year close approved"
      }
    );

    // Attach snapshot warning as top-level warnings in the success envelope if present.
    // The close/posting itself always succeeds (200) even if the auto-snapshot side effect
    // failed; the warning is non-blocking side information only.
    if (result.snapshotWarning) {
      return successResponse(result, 200, [result.snapshotWarning]);
    }
    return successResponse(result);
  } catch (error) {
    // Check for our custom "ENTRIES_NOT_BALANCED" error format
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.startsWith("ENTRIES_NOT_BALANCED:")) {
      const details = errorMessage.replace("ENTRIES_NOT_BALANCED:", "");
      return errorResponse("ENTRIES_NOT_BALANCED", details, 400);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid fiscal year ID", 400);
    }

    if (error instanceof FiscalYearNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof FiscalYearAlreadyClosedError) {
      return errorResponse("FISCAL_YEAR_ALREADY_CLOSED", error.message, 409);
    }

    if (error instanceof FiscalYearClosePreconditionError) {
      return errorResponse("CLOSE_PRECONDITION_FAILED", error.message, 400);
    }

    if (error instanceof RetainedEarningsAccountNotFoundError) {
      return errorResponse("RETAINED_EARNINGS_NOT_FOUND", error.message, 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FISCAL_YEAR_CLOSE_CONFLICT") {
      return errorResponse("CLOSE_CONFLICT", err.message || "Close operation conflict", 409);
    }

    if (err.code === "NOT_INITIATED") {
      return errorResponse("CLOSE_CONFLICT", err.message || "Fiscal year close was not initiated", 400);
    }

    if (err.code === "FISCAL_YEAR_CLOSED") {
      return errorResponse("FISCAL_YEAR_CLOSED", err.message || "Fiscal year is closed", 409);
    }

    console.error("POST /accounts/fiscal-years/:id/close/approve failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to approve fiscal year close", 500);
  }
});

// GET /accounts/types - Get account types
accountRoutes.get("/types", async (c) => {
  const auth = c.get("auth");

  // Check access permission
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
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
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = AcquisitionRequestSchema.parse(payload);

    const lifecycleService = getComposedLifecycleService();
    const result = await lifecycleService.recordAcquisition(auth.companyId, assetId, input, {
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
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Fixed asset not found", 404);
    }
    if (err.code === "LIFECYCLE_ASSET_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset already disposed", 409);
    }
    if (err.code === "LIFECYCLE_DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }
    if (err.code === "LIFECYCLE_INVALID_REFERENCE") {
      return errorResponse("INVALID_REFERENCE", err.message || "Invalid reference", 400);
    }

    console.error("POST /accounts/fixed-assets/:id/acquisition failed", error);
    return errorResponse("INTERNAL_ERROR", "Acquisition failed", 500);
  }
});

// POST /accounts/fixed-assets/:id/transfer - Transfer asset to another outlet
accountRoutes.post("/fixed-assets/:id/transfer", async (c) => {
  const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = TransferRequestSchema.parse(payload);

    const lifecycleService = getComposedLifecycleService();
    const result = await lifecycleService.recordTransfer(auth.companyId, assetId, input, {
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
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Asset not found", 404);
    }
    if (err.code === "LIFECYCLE_ASSET_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset is not active", 409);
    }
    if (err.code === "LIFECYCLE_DUPLICATE_EVENT") {
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
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = ImpairmentRequestSchema.parse(payload);

    const lifecycleService = getComposedLifecycleService();
    const result = await lifecycleService.recordImpairment(auth.companyId, assetId, input, {
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
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Asset not found", 404);
    }
    if (err.code === "LIFECYCLE_ASSET_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset is not active", 409);
    }
    if (err.code === "LIFECYCLE_DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }
    if (err.code === "LIFECYCLE_INVALID_STATE") {
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
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = DisposalRequestSchema.parse(payload);

    const lifecycleService = getComposedLifecycleService();
    const result = await lifecycleService.recordDisposal(auth.companyId, assetId, input, {
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
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Asset not found", 404);
    }
    if (err.code === "LIFECYCLE_ASSET_DISPOSED") {
      return errorResponse("CONFLICT", err.message || "Asset already disposed", 409);
    }
    if (err.code === "LIFECYCLE_DUPLICATE_EVENT") {
      return errorResponse("CONFLICT", "Duplicate event", 409);
    }
    if (err.code === "LIFECYCLE_INVALID_STATE") {
      return errorResponse("CONFLICT", err.message || "Invalid asset state", 409);
    }
    if (err.code === "LIFECYCLE_INVALID_REFERENCE") {
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
      module: "accounting",
      resource: "accounts",
      permission: "read"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));

    const lifecycleService = getComposedLifecycleService();
    const ledger = await lifecycleService.getLedger(auth.companyId, assetId, { userId: auth.userId });

    return successResponse(ledger);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
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
      module: "accounting",
      resource: "accounts",
      permission: "read"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const assetId = NumericIdSchema.parse(c.req.param("id"));

    const lifecycleService = getComposedLifecycleService();
    const book = await lifecycleService.getBook(auth.companyId, assetId, { userId: auth.userId });

    return successResponse(book);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid asset ID", 400);
    }

    const err = error as { code?: string; message?: string };
    if (err.code === "FIXED_ASSET_NOT_FOUND") {
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
      module: "accounting",
      resource: "accounts",
      permission: "update"
    })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const eventId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json().catch(() => ({}));
    const input = VoidEventRequestSchema.parse(payload);

    const lifecycleService = getComposedLifecycleService();
    const result = await lifecycleService.voidEvent(auth.companyId, eventId, {
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
    if (err.code === "LIFECYCLE_EVENT_NOT_FOUND") {
      return errorResponse("NOT_FOUND", err.message || "Event not found", 404);
    }
    if (err.code === "LIFECYCLE_EVENT_VOIDED" || err.code === "LIFECYCLE_EVENT_NOT_VOIDABLE") {
      return errorResponse("CONFLICT", err.message || "Cannot void this event", 409);
    }

    console.error("POST /accounts/fixed-assets/events/:id/void failed", error);
    return errorResponse("INTERNAL_ERROR", "Void failed", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Registers account routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the account endpoints.
 */
export function registerAccountRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /accounts - List accounts
  const listAccountsRoute = createRoute({
    path: "/accounts",
    method: "get",
    tags: ["Accounting"],
    summary: "List accounts",
    description: "List chart of accounts with optional filtering",
    security: [{ BearerAuth: [] }],
    request: {
      query: zodOpenApi.object({
        company_id: NumericIdSchema,
        is_active: zodOpenApi.string().optional(),
        is_payable: zodOpenApi.string().optional(),
        report_group: zodOpenApi.enum(["NRC", "PL"]).optional(),
        parent_account_id: NumericIdSchema.optional(),
        search: zodOpenApi.string().optional(),
        include_children: zodOpenApi.string().optional(),
      }),
    },
    responses: {
      200: { description: "List of accounts" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listAccountsRoute, (async (c: any) => {
    const auth = c.get("auth");
    const query = c.req.valid("query");
    
    if (query.company_id !== auth.companyId) {
      return c.json({ success: false, error: { code: "COMPANY_MISMATCH", message: "Company ID mismatch" } }, 400);
    }

    const accounts = await listAccounts({
      company_id: query.company_id,
      is_active: query.is_active === "true" || query.is_active === "1" ? true : query.is_active === "false" || query.is_active === "0" ? false : undefined,
      is_payable: query.is_payable === "true" || query.is_payable === "1" ? true : query.is_payable === "false" || query.is_payable === "0" ? false : undefined,
      report_group: query.report_group,
      parent_account_id: query.parent_account_id,
      search: query.search,
      include_children: query.include_children === "true" || query.include_children === "1",
    });

    return c.json({ success: true, data: accounts });
  }) as any);

  // GET /accounts/:id - Get single account
  const getAccountRoute = createRoute({
    path: "/accounts/{id}",
    method: "get",
    tags: ["Accounting"],
    summary: "Get account",
    description: "Get a single account by ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: NumericIdSchema,
      }),
    },
    responses: {
      200: { description: "Account details" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Account not found" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getAccountRoute, (async (c: any) => {
    const auth = c.get("auth");
    const { id } = c.req.valid("param");
    const accountId = NumericIdSchema.parse(id);

    const account = await getAccountById(accountId, auth.companyId);
    if (!account) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Account not found" } }, 404);
    }

    return c.json({ success: true, data: account });
  }) as any);

  // POST /accounts - Create account
  const createAccountRoute = createRoute({
    path: "/accounts",
    method: "post",
    tags: ["Accounting"],
    summary: "Create account",
    description: "Create a new chart of account entry",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: AccountCreateRequestSchema,
          },
        },
      },
    },
    responses: {
      201: { description: "Account created" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      409: { description: "Account code already exists" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createAccountRoute, (async (c: any) => {
    const auth = c.get("auth");
    const payload = await c.req.json();
    const input = AccountCreateRequestSchema.parse(payload);

    if (input.company_id !== auth.companyId) {
      return c.json({ success: false, error: { code: "COMPANY_MISMATCH", message: "Company ID mismatch" } }, 400);
    }

    const account = await createAccount(input, auth.userId);
    return c.json({ success: true, data: account }, 201);
  }) as any);

  // GET /accounts/types - Get account types
  const getAccountTypesRoute = createRoute({
    path: "/accounts/types",
    method: "get",
    tags: ["Accounting"],
    summary: "Get account types",
    description: "Get list of available account types",
    security: [{ BearerAuth: [] }],
    responses: {
      200: { description: "List of account types" },
      401: { description: "Unauthorized" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getAccountTypesRoute, (async (c: any) => {
    const auth = c.get("auth");
    const { listAccountTypes } = await import("../lib/account-types.js");
    const types = await listAccountTypes({ company_id: auth.companyId });
    return c.json({ success: true, data: types });
  }) as any);
}

export { accountRoutes };
