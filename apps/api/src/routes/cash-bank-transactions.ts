// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Cash Bank Transactions Routes
 *
 * Routes for cash and bank transaction management:
 * - GET /cash-bank-transactions - List transactions
 * - POST /cash-bank-transactions - Create transaction
 * - POST /cash-bank-transactions/:id/post - Post transaction
 * - POST /cash-bank-transactions/:id/void - Void transaction
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT for most operations
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { userHasOutletAccess } from "../lib/auth.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  listCashBankTransactions,
  createCashBankTransaction,
  postCashBankTransaction,
  voidCashBankTransaction,
  CashBankValidationError,
  CashBankNotFoundError,
  CashBankForbiddenError,
  CashBankStatusError
} from "../lib/cash-bank.js";
import { FiscalYearNotOpenError } from "../lib/fiscal-years.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const CreateCashBankTransactionSchema = z.object({
  transaction_type: z.enum(["MUTATION", "TOP_UP", "WITHDRAWAL", "FOREX"]),
  transaction_date: z.string().optional(),
  description: z.string().trim().min(1).max(500),
  source_account_id: z.number().int().positive(),
  destination_account_id: z.number().int().positive(),
  amount: z.number().positive(),
  reference: z.string().trim().max(191).optional(),
  outlet_id: z.number().int().positive().optional(),
  currency_code: z.string().trim().max(3).optional(),
  exchange_rate: z.number().positive().optional(),
  base_amount: z.number().positive().optional(),
  fx_account_id: z.number().int().positive().optional()
});

// =============================================================================
// Cash Bank Transactions Routes
// =============================================================================

const cashBankTransactionsRoutes = new Hono();

// Auth middleware
cashBankTransactionsRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /cash-bank-transactions - List transactions
cashBankTransactionsRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "cash_bank",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    
    let outletId: number | undefined;
    if (outletIdParam) {
      outletId = NumericIdSchema.parse(outletIdParam);
      
      // Validate outlet access if specific outlet requested
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    }

    const transactions = await listCashBankTransactions(auth.companyId, {
      outletId
    });
    
    return successResponse(transactions);
  } catch (error) {
    console.error("GET /cash-bank-transactions failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch transactions", 500);
  }
});

// POST /cash-bank-transactions - Create transaction
cashBankTransactionsRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "cash_bank",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = CreateCashBankTransactionSchema.parse(payload);

    // Validate outlet access if outlet_id is specified
    if (input.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    }

    const transaction = await createCashBankTransaction(auth.companyId, {
      outlet_id: input.outlet_id,
      transaction_type: input.transaction_type,
      transaction_date: input.transaction_date || new Date().toISOString().slice(0, 10),
      description: input.description,
      source_account_id: input.source_account_id,
      destination_account_id: input.destination_account_id,
      amount: input.amount,
      reference: input.reference,
      currency_code: input.currency_code,
      exchange_rate: input.exchange_rate,
      base_amount: input.base_amount,
      fx_account_id: input.fx_account_id
    }, {
      userId: auth.userId
    });

    return successResponse(transaction, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof CashBankValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    if (error instanceof CashBankForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    console.error("POST /cash-bank-transactions failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create transaction", 500);
  }
});

// POST /cash-bank-transactions/:id/post - Post transaction
cashBankTransactionsRoutes.post("/:id/post", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission - posting requires create permission (not update)
    const accessResult = await requireAccess({
      module: "cash_bank",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const transactionId = NumericIdSchema.parse(c.req.param("id"));

    const postedTransaction = await postCashBankTransaction(auth.companyId, transactionId, {
      userId: auth.userId
    });

    return successResponse(postedTransaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid transaction ID", 400);
    }

    if (error instanceof CashBankNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof CashBankForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof CashBankStatusError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof FiscalYearNotOpenError) {
      return errorResponse("FISCAL_YEAR_CLOSED", error.message, 400);
    }

    console.error("POST /cash-bank-transactions/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to post transaction", 500);
  }
});

// POST /cash-bank-transactions/:id/void - Void transaction
cashBankTransactionsRoutes.post("/:id/void", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission - voiding requires create permission (not delete)
    const accessResult = await requireAccess({
      module: "cash_bank",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const transactionId = NumericIdSchema.parse(c.req.param("id"));

    const voidedTransaction = await voidCashBankTransaction(auth.companyId, transactionId, {
      userId: auth.userId
    });

    return successResponse(voidedTransaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid transaction ID", 400);
    }

    if (error instanceof CashBankNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof CashBankForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof CashBankStatusError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /cash-bank-transactions/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to void transaction", 500);
  }
});

export { cashBankTransactionsRoutes };