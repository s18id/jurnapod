// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  TaxRateCreateRequestSchema,
  TaxRateListResponseSchema
} from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../src/lib/db";
import { getAuditService } from "../../../../src/lib/audit";
import { readClientIp } from "../../../../src/lib/request-meta";

const MYSQL_DUPLICATE_ERROR_CODE = 1062;

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Tax rate already exists"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Tax rates request failed"
  }
};

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const pool = getDbPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, company_id, code, name, rate_percent, is_inclusive, is_active, created_at, updated_at
         FROM tax_rates
         WHERE company_id = ?
         ORDER BY name ASC, id ASC`,
        [auth.companyId]
      );

      const taxRates = (rows as Array<{ id: number; company_id: number; code: string; name: string; rate_percent: number | string; is_inclusive: number; is_active: number; created_at: string; updated_at: string }>).map(
        (row) => ({
          id: Number(row.id),
          company_id: Number(row.company_id),
          code: String(row.code),
          name: String(row.name),
          rate_percent: Number(row.rate_percent),
          is_inclusive: row.is_inclusive === 1,
          is_active: row.is_active === 1,
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString()
        })
      );

      const response = TaxRateListResponseSchema.parse({
        ok: true,
        tax_rates: taxRates
      });

      return Response.json(response, { status: 200 });
    } catch (error) {
      console.error("GET /settings/tax-rates failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = TaxRateCreateRequestSchema.parse(payload);

      const pool = getDbPool();
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO tax_rates (
           company_id,
           code,
           name,
           rate_percent,
           is_inclusive,
           is_active,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auth.companyId,
          input.code,
          input.name,
          input.rate_percent,
          input.is_inclusive ? 1 : 0,
          input.is_active === false ? 0 : 1,
          auth.userId,
          auth.userId
        ]
      );

      const taxRateId = Number(result.insertId);
      const auditService = getAuditService();
      await auditService.logCreate(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "tax_rate",
        taxRateId,
        {
          code: input.code,
          name: input.name,
          rate_percent: input.rate_percent,
          is_inclusive: input.is_inclusive,
          is_active: input.is_active !== false
        }
      );

      return Response.json({ ok: true, id: taxRateId }, { status: 201 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (typeof error === "object" && error && "errno" in error) {
        const errno = (error as { errno?: number }).errno;
        if (errno === MYSQL_DUPLICATE_ERROR_CODE) {
          return Response.json(CONFLICT_RESPONSE, { status: 409 });
        }
      }

      console.error("POST /settings/tax-rates failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "create" })]
);
