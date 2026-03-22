// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tax Rates Routes
 *
 * Routes for tax rate management:
 * - GET /tax-rates - List tax rates for company
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT, or CASHIER (read operations)
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { listCompanyTaxRates, listCompanyDefaultTaxRates } from "../lib/taxes.js";
import { getDbPool } from "../lib/db.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const TAX_RATES_ROLES = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"] as const;

// =============================================================================
// Tax Rates Routes
// =============================================================================

const taxRatesRoutes = new Hono();

// Auth middleware
taxRatesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /tax-rates - List tax rates for company
taxRatesRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...TAX_RATES_ROLES],
    module: "tax_rates",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const dbPool = getDbPool();
    const taxRates = await listCompanyTaxRates(dbPool, auth.companyId);

    return successResponse(taxRates);
  } catch (error) {
    console.error("GET /tax-rates failed", error);
    return errorResponse("INTERNAL_ERROR", "Tax rates request failed", 500);
  }
});

// GET /tax-rates/default - List default tax rates for company
taxRatesRoutes.get("/default", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...TAX_RATES_ROLES],
    module: "tax_rates",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const dbPool = getDbPool();
    const defaultTaxRates = await listCompanyDefaultTaxRates(dbPool, auth.companyId);

    return successResponse(defaultTaxRates);
  } catch (error) {
    console.error("GET /tax-rates/default failed", error);
    return errorResponse("INTERNAL_ERROR", "Default tax rates request failed", 500);
  }
});

export { taxRatesRoutes };
