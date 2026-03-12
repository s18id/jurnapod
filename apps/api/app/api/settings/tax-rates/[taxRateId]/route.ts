// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { TaxRateUpdateRequestSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../../src/lib/db";
import { getAuditService } from "../../../../../src/lib/audit";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";

const idSchema = z.coerce.number().int().positive();

async function findTaxRate(companyId: number, taxRateId: number) {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, company_id, code, name, rate_percent, account_id, is_inclusive, is_active
     FROM tax_rates
     WHERE id = ? AND company_id = ?
     LIMIT 1`,
    [taxRateId, companyId]
  );

  return (rows as Array<{ id: number; company_id: number; code: string; name: string; rate_percent: number | string; account_id: number | null; is_inclusive: number; is_active: number }>)[0] ?? null;
}

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const taxRateId = idSchema.parse(url.pathname.split("/").pop());
      const payload = await request.json();
      const input = TaxRateUpdateRequestSchema.parse(payload);

      if (input.account_id !== undefined && input.account_id !== null) {
        const pool = getDbPool();
        const [accountRows] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM accounts WHERE company_id = ? AND id = ? LIMIT 1`,
          [auth.companyId, input.account_id]
        );
        if (accountRows.length === 0) {
          return errorResponse("INVALID_ACCOUNT", "Account not found for this company", 400);
        }
      }

      const current = await findTaxRate(auth.companyId, taxRateId);
      if (!current) {
        return errorResponse("NOT_FOUND", "Tax rate not found", 404);
      }

      const pool = getDbPool();
      
      const fields: string[] = [];
      const values: (string | number | null)[] = [];
      
      if (input.code !== undefined) {
        fields.push("code = ?");
        values.push(input.code);
      }
      if (input.name !== undefined) {
        fields.push("name = ?");
        values.push(input.name);
      }
      if (input.rate_percent !== undefined) {
        fields.push("rate_percent = ?");
        values.push(input.rate_percent);
      }
      if (input.account_id !== undefined) {
        fields.push("account_id = ?");
        values.push(input.account_id);
      }
      if (input.is_inclusive !== undefined) {
        fields.push("is_inclusive = ?");
        values.push(input.is_inclusive ? 1 : 0);
      }
      if (input.is_active !== undefined) {
        fields.push("is_active = ?");
        values.push(input.is_active ? 1 : 0);
      }
      
      if (fields.length === 0) {
        return successResponse(null);
      }
      
      fields.push("updated_by_user_id = ?");
      values.push(auth.userId);
      fields.push("updated_at = CURRENT_TIMESTAMP");
      
      values.push(taxRateId, auth.companyId);

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE tax_rates SET ${fields.join(", ")} WHERE id = ? AND company_id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return errorResponse("NOT_FOUND", "Tax rate not found", 404);
      }

      const auditService = getAuditService();
      await auditService.logUpdate(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "tax_rate",
        taxRateId,
        {
          code: current.code,
          name: current.name,
          rate_percent: Number(current.rate_percent),
          account_id: current.account_id ? Number(current.account_id) : null,
          is_inclusive: current.is_inclusive === 1,
          is_active: current.is_active === 1
        },
        {
          code: input.code ?? current.code,
          name: input.name ?? current.name,
          rate_percent: input.rate_percent ?? Number(current.rate_percent),
          account_id: input.account_id !== undefined ? input.account_id : (current.account_id ? Number(current.account_id) : null),
          is_inclusive: input.is_inclusive ?? (current.is_inclusive === 1),
          is_active: input.is_active ?? (current.is_active === 1)
        }
      );

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (typeof error === "object" && error && "errno" in error) {
        const errno = (error as { errno?: number }).errno;
        if (errno === 1062) {
          return errorResponse("CONFLICT", "Tax rate conflict", 409);
        }
      }

      console.error("PUT /settings/tax-rates/[taxRateId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Tax rate request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const taxRateId = idSchema.parse(url.pathname.split("/").pop());
      const current = await findTaxRate(auth.companyId, taxRateId);
      if (!current) {
        return errorResponse("NOT_FOUND", "Tax rate not found", 404);
      }

      const pool = getDbPool();
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE tax_rates
         SET is_active = 0,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND company_id = ?`,
        [auth.userId, taxRateId, auth.companyId]
      );

      if (result.affectedRows === 0) {
        return errorResponse("NOT_FOUND", "Tax rate not found", 404);
      }

      const auditService = getAuditService();
      await auditService.logDeactivate(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "tax_rate",
        taxRateId,
        {
          code: current.code,
          name: current.name
        }
      );

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("DELETE /settings/tax-rates/[taxRateId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Tax rate request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "delete" })]
);
