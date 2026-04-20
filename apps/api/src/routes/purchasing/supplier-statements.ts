// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplier Statements Routes (Epic 47 Story 47.3)
 *
 * Endpoints:
 * - POST /api/purchasing/supplier-statements - Create statement
 * - GET /api/purchasing/supplier-statements - List statements
 * - GET /api/purchasing/supplier-statements/:id/reconcile - Compute reconciliation
 * - PUT /api/purchasing/supplier-statements/:id/reconcile - Mark as reconciled
 *
 * ACL:
 * - Create (POST): purchasing.suppliers + CREATE
 * - List/Reconcile GET: purchasing.suppliers + ANALYZE
 * - Mark reconciled (PUT): purchasing.suppliers + UPDATE
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  SupplierStatementCreateSchema,
  SupplierStatementListQuerySchema,
  ReconcileQuerySchema,
} from "@jurnapod/shared";
import {
  requireAccess,
  authenticateRequest,
  type AuthContext
} from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  createSupplierStatement,
  listSupplierStatements,
  reconcileSupplierStatement,
  markSupplierStatementReconciled,
  SUPPLIER_STATEMENT_STATUS,
  SupplierStatementError,
} from "../../lib/purchasing/supplier-statements.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Route Handlers
// =============================================================================

const supplierStatementRoutes = new Hono();

// Auth middleware
supplierStatementRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// POST /api/purchasing/supplier-statements - Create statement
supplierStatementRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access: purchasing.suppliers + CREATE
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = SupplierStatementCreateSchema.parse(payload);

    const statement = await createSupplierStatement(auth.companyId, auth.userId, {
      supplierId: input.supplier_id,
      statementDate: input.statement_date,
      closingBalance: input.closing_balance,
      currencyCode: input.currency_code,
    });

    // Transform to snake_case API format with string status
    const response = {
      id: statement.id,
      company_id: statement.companyId,
      supplier_id: statement.supplierId,
      statement_date: statement.statementDate,
      closing_balance: statement.closingBalance,
      currency_code: statement.currencyCode,
      status: statement.status === SUPPLIER_STATEMENT_STATUS.RECONCILED ? "RECONCILED" : "PENDING",
      reconciled_at: statement.reconciledAt,
      reconciled_by_user_id: statement.reconciledByUserId,
      created_by_user_id: statement.createdByUserId,
      created_at: statement.createdAt,
      updated_at: statement.updatedAt,
    };

    return successResponse(response, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    // Handle known business errors
    if (error instanceof Error && error.name === "SupplierStatementError") {
      const err = error as SupplierStatementError;
      if (err.code === "SUPPLIER_STATEMENT_DUPLICATE") {
        return errorResponse(err.code, err.message, 409);
      }
      if (err.code === "SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED") {
        return errorResponse(err.code, err.message, 403);
      }
      if (err.code === "SUPPLIER_STATEMENT_SUPPLIER_NOT_ACTIVE") {
        return errorResponse(err.code, err.message, 400);
      }
      if (err.code === "SUPPLIER_STATEMENT_CURRENCY_MISMATCH") {
        return errorResponse(err.code, err.message, 400);
      }
      if (err.code === "SUPPLIER_STATEMENT_EXCHANGE_RATE_MISSING") {
        return errorResponse(err.code, err.message, 400);
      }
    }

    console.error("POST /purchasing/supplier-statements failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create supplier statement", 500);
  }
});

// GET /api/purchasing/supplier-statements - List statements
supplierStatementRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access: purchasing.suppliers + ANALYZE
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "analyze"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const queryParams = {
      supplier_id: url.searchParams.get("supplier_id") ? Number(url.searchParams.get("supplier_id")) : undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    };

    const parsed = SupplierStatementListQuerySchema.parse(queryParams);

    // Convert status string to number
    const statusNumber = parsed.status
      ? SUPPLIER_STATEMENT_STATUS[parsed.status.toUpperCase() as keyof typeof SUPPLIER_STATEMENT_STATUS]
      : undefined;

    const { statements, total } = await listSupplierStatements(auth.companyId, {
      supplierId: parsed.supplier_id,
      dateFrom: parsed.date_from,
      dateTo: parsed.date_to,
      status: statusNumber,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    // Transform to snake_case API format with string status
    const formattedStatements = statements.map(stmt => ({
      id: stmt.id,
      company_id: stmt.companyId,
      supplier_id: stmt.supplierId,
      statement_date: stmt.statementDate,
      closing_balance: stmt.closingBalance,
      currency_code: stmt.currencyCode,
      status: stmt.status === SUPPLIER_STATEMENT_STATUS.RECONCILED ? "RECONCILED" : "PENDING",
      reconciled_at: stmt.reconciledAt,
      reconciled_by_user_id: stmt.reconciledByUserId,
      created_by_user_id: stmt.createdByUserId,
      created_at: stmt.createdAt,
      updated_at: stmt.updatedAt,
    }));

    return successResponse({
      statements: formattedStatements,
      total,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
    }
    console.error("GET /purchasing/supplier-statements failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list supplier statements", 500);
  }
});

// GET /api/purchasing/supplier-statements/:id/reconcile - Compute reconciliation
supplierStatementRoutes.get("/:id/reconcile", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access: purchasing.suppliers + ANALYZE
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "analyze"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const statementId = NumericIdSchema.parse(c.req.param("id"));

    const url = new URL(c.req.raw.url);
    const query = ReconcileQuerySchema.parse({
      tolerance: url.searchParams.get("tolerance") ?? undefined,
    });

    const result = await reconcileSupplierStatement(
      auth.companyId,
      statementId,
      query.tolerance
    );

    // Transform to snake_case for API response
    const response = {
      statement_id: result.statementId,
      supplier_id: result.supplierId,
      statement_date: result.statementDate,
      statement_balance: result.statementBalance,
      subledger_balance: result.subledgerBalance,
      variance: result.variance,
      variance_within_tolerance: result.varianceWithinTolerance,
      tolerance: result.tolerance,
      currency_code: result.currencyCode,
    };

    return successResponse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid statement ID or tolerance", 400);
    }
    if (error instanceof Error && error.name === "SupplierStatementError") {
      const err = error as SupplierStatementError;
      if (err.code === "SUPPLIER_STATEMENT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message, 404);
      }
      if (err.code === "SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED") {
        return errorResponse(err.code, err.message, 403);
      }
      if (err.code === "SUPPLIER_STATEMENT_CURRENCY_MISMATCH") {
        return errorResponse(err.code, err.message, 400);
      }
      if (err.code === "SUPPLIER_STATEMENT_EXCHANGE_RATE_MISSING") {
        return errorResponse(err.code, err.message, 400);
      }
      if (err.code === "SUPPLIER_STATEMENT_INVALID_TOLERANCE") {
        return errorResponse(err.code, err.message, 400);
      }
    }
    console.error("GET /purchasing/supplier-statements/:id/reconcile failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to reconcile supplier statement", 500);
  }
});

// PUT /api/purchasing/supplier-statements/:id/reconcile - Mark as reconciled
supplierStatementRoutes.put("/:id/reconcile", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access: purchasing.suppliers + UPDATE (mark reconciled requires UPDATE)
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "suppliers",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const statementId = NumericIdSchema.parse(c.req.param("id"));

    const statement = await markSupplierStatementReconciled(
      auth.companyId,
      statementId,
      auth.userId
    );

    // Transform to snake_case API format with string status
    const response = {
      id: statement.id,
      company_id: statement.companyId,
      supplier_id: statement.supplierId,
      statement_date: statement.statementDate,
      closing_balance: statement.closingBalance,
      currency_code: statement.currencyCode,
      status: statement.status === SUPPLIER_STATEMENT_STATUS.RECONCILED ? "RECONCILED" : "PENDING",
      reconciled_at: statement.reconciledAt,
      reconciled_by_user_id: statement.reconciledByUserId,
      created_by_user_id: statement.createdByUserId,
      created_at: statement.createdAt,
      updated_at: statement.updatedAt,
    };

    return successResponse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid statement ID", 400);
    }
    if (error instanceof Error && error.name === "SupplierStatementError") {
      const err = error as SupplierStatementError;
      if (err.code === "SUPPLIER_STATEMENT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message, 404);
      }
      if (err.code === "SUPPLIER_STATEMENT_ALREADY_RECONCILED") {
        return errorResponse(err.code, err.message, 409);
      }
      if (err.code === "SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED") {
        return errorResponse(err.code, err.message, 403);
      }
      if (err.code === "SUPPLIER_STATEMENT_SUPPLIER_NOT_ACTIVE") {
        return errorResponse(err.code, err.message, 400);
      }
    }
    console.error("PUT /purchasing/supplier-statements/:id/reconcile failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to mark supplier statement reconciled", 500);
  }
});

export { supplierStatementRoutes };
