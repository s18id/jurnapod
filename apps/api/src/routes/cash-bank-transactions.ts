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
import { errorResponse, successResponse } from "../lib/response.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const CreateCashBankTransactionSchema = z.object({
  transaction_type: z.enum(["MUTATION", "CASH_IN", "CASH_OUT", "BANK_IN", "BANK_OUT"]),
  transaction_date: z.string().optional(),
  description: z.string().trim().min(1).max(500),
  source_account_id: z.number().int().positive(),
  destination_account_id: z.number().int().positive(),
  amount: z.number().positive(),
  reference: z.string().trim().max(191).optional()
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
    const outletId = url.searchParams.get("outlet_id");
    
    // For now, return empty array as placeholder
    // TODO: Implement actual cash bank transaction listing
    return successResponse([]);
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

    // For now, return success as placeholder
    // TODO: Implement actual cash bank transaction creation
    return successResponse({
      id: Math.floor(Math.random() * 1000000),
      transaction_type: input.transaction_type,
      transaction_date: input.transaction_date || new Date().toISOString().slice(0, 10),
      description: input.description,
      source_account_id: input.source_account_id,
      destination_account_id: input.destination_account_id,
      amount: input.amount,
      reference: input.reference,
      status: "DRAFT",
      created_at: new Date().toISOString()
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /cash-bank-transactions failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create transaction", 500);
  }
});

// POST /cash-bank-transactions/:id/post - Post transaction
cashBankTransactionsRoutes.post("/:id/post", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "cash_bank",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const transactionId = NumericIdSchema.parse(c.req.param("id"));

    // For now, return success as placeholder
    // TODO: Implement actual transaction posting
    return successResponse({
      id: transactionId,
      status: "POSTED"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid transaction ID", 400);
    }

    console.error("POST /cash-bank-transactions/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to post transaction", 500);
  }
});

// POST /cash-bank-transactions/:id/void - Void transaction
cashBankTransactionsRoutes.post("/:id/void", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "cash_bank",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const transactionId = NumericIdSchema.parse(c.req.param("id"));

    // For now, return success as placeholder
    // TODO: Implement actual transaction voiding
    return successResponse({
      id: transactionId,
      status: "VOIDED"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid transaction ID", 400);
    }

    console.error("POST /cash-bank-transactions/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to void transaction", 500);
  }
});

export { cashBankTransactionsRoutes };