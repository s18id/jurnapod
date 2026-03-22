// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Check-Duplicate Routes
 *
 * POST /sync/check-duplicate - Check for duplicate transactions
 */

import { Hono } from "hono";
import { z } from "zod";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getDbPool } from "../../lib/db.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";

// Extend Hono context with auth
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const CheckDuplicateRequestSchema = z.object({
  client_tx_id: z.string().uuid(),
  company_id: z.number().int().positive()
});

type PosTransactionRow = { id: number; created_at: string };

async function checkDuplicateTransaction(clientTxId: string, companyId: number): Promise<{ id: number; created_at: string } | null> {
  const dbPool = getDbPool();
  const connection = await dbPool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT id, created_at FROM pos_transactions WHERE company_id = ? AND client_tx_id = ? LIMIT 1`,
      [companyId, clientTxId]
    );
    const row = (rows as PosTransactionRow[])[0];
    return row ? { id: row.id, created_at: row.created_at } : null;
  } finally {
    connection.release();
  }
}

const checkDuplicateRoutes = new Hono();

// Auth middleware
checkDuplicateRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

checkDuplicateRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const correlationId = getRequestCorrelationId(c.req.raw);

  try {
    const body = await c.req.json();
    const parsed = CheckDuplicateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Invalid request", 400);
    }

    const { client_tx_id, company_id } = parsed.data;

    if (company_id !== auth.companyId) {
      return errorResponse("FORBIDDEN", "Cannot check duplicates for other companies", 403);
    }

    const existing = await checkDuplicateTransaction(client_tx_id, company_id);

    if (existing) {
      return successResponse({ exists: true, transaction_id: existing.id, created_at: existing.created_at });
    }

    return successResponse({ exists: false });
  } catch (error) {
    console.error("POST /sync/check-duplicate failed", { correlation_id: correlationId, error });
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to check duplicate", 500);
  }
});

export { checkDuplicateRoutes };
