// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../src/lib/db";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getRequestCorrelationId } from "../../../../src/lib/correlation-id";

const CheckDuplicateRequestSchema = z.object({
  client_tx_id: z.string().uuid(),
  company_id: z.number().int().positive()
});

const CheckDuplicateResponseSchema = z.object({
  exists: z.boolean(),
  transaction_id: z.number().int().optional(),
  created_at: z.string().datetime().optional()
});

type CheckDuplicateRequest = z.infer<typeof CheckDuplicateRequestSchema>;
type CheckDuplicateResponse = z.infer<typeof CheckDuplicateResponseSchema>;

type PosTransactionRow = {
  id: number;
  created_at: string;
};

async function checkDuplicateTransaction(
  clientTxId: string,
  companyId: number
): Promise<{ id: number; created_at: string } | null> {
  const dbPool = getDbPool();
  const connection = await dbPool.getConnection();
  
  try {
    const [rows] = await connection.execute(
      `SELECT id, created_at
       FROM pos_transactions
       WHERE company_id = ? AND client_tx_id = ?
       LIMIT 1`,
      [companyId, clientTxId]
    );
    
    const row = (rows as PosTransactionRow[])[0];
    if (!row) {
      return null;
    }
    
    return {
      id: row.id,
      created_at: row.created_at
    };
  } finally {
    connection.release();
  }
}

export const POST = withAuth(
  async (request, auth) => {
    const correlationId = getRequestCorrelationId(request);
    
    try {
      const body = await request.json();
      const parsed = CheckDuplicateRequestSchema.safeParse(body);
      
      if (!parsed.success) {
        const issues = parsed.error.issues;
        const firstError = issues[0];
        return errorResponse(
          "VALIDATION_ERROR",
          firstError?.message || "Invalid request",
          400
        );
      }
      
      const { client_tx_id, company_id } = parsed.data;
      
      // Tenant isolation: user can only check duplicates for their company
      if (company_id !== auth.companyId) {
        return errorResponse(
          "FORBIDDEN",
          "Cannot check duplicates for other companies",
          403
        );
      }
      
      const existing = await checkDuplicateTransaction(client_tx_id, company_id);
      
      if (existing) {
        const response: CheckDuplicateResponse = {
          exists: true,
          transaction_id: existing.id,
          created_at: existing.created_at
        };
        return successResponse(response);
      }
      
      const response: CheckDuplicateResponse = {
        exists: false
      };
      return successResponse(response);
      
    } catch (error) {
      console.error("POST /sync/check-duplicate failed", {
        correlation_id: correlationId,
        error
      });
      
      return errorResponse(
        "INTERNAL_SERVER_ERROR",
        "Failed to check duplicate",
        500
      );
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]
    })
  ]
);
