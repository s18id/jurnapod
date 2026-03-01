import { ZodError, z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { TaxRateUpdateRequestSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../../src/lib/db";
import { getAuditService } from "../../../../../src/lib/audit";
import { readClientIp } from "../../../../../src/lib/request-meta";

const idSchema = z.coerce.number().int().positive();

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND",
    message: "Tax rate not found"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Tax rate request failed"
  }
};

const CONFLICT_RESPONSE = {
  ok: false,
  error: {
    code: "CONFLICT",
    message: "Tax rate conflict"
  }
};

async function findTaxRate(companyId: number, taxRateId: number) {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, company_id, code, name, rate_percent, is_inclusive, is_active
     FROM tax_rates
     WHERE id = ? AND company_id = ?
     LIMIT 1`,
    [taxRateId, companyId]
  );

  return (rows as Array<{ id: number; company_id: number; code: string; name: string; rate_percent: number | string; is_inclusive: number; is_active: number }>)[0] ?? null;
}

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const taxRateId = idSchema.parse(url.pathname.split("/").pop());
      const payload = await request.json();
      const input = TaxRateUpdateRequestSchema.parse(payload);

      const current = await findTaxRate(auth.companyId, taxRateId);
      if (!current) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      const pool = getDbPool();
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE tax_rates
         SET code = COALESCE(?, code),
             name = COALESCE(?, name),
             rate_percent = COALESCE(?, rate_percent),
             is_inclusive = COALESCE(?, is_inclusive),
             is_active = COALESCE(?, is_active),
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND company_id = ?`,
        [
          input.code ?? null,
          input.name ?? null,
          input.rate_percent ?? null,
          input.is_inclusive === undefined ? null : input.is_inclusive ? 1 : 0,
          input.is_active === undefined ? null : input.is_active ? 1 : 0,
          auth.userId,
          taxRateId,
          auth.companyId
        ]
      );

      if (result.affectedRows === 0) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
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
          is_inclusive: current.is_inclusive === 1,
          is_active: current.is_active === 1
        },
        {
          code: input.code ?? current.code,
          name: input.name ?? current.name,
          rate_percent: input.rate_percent ?? Number(current.rate_percent),
          is_inclusive: input.is_inclusive ?? (current.is_inclusive === 1),
          is_active: input.is_active ?? (current.is_active === 1)
        }
      );

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (typeof error === "object" && error && "errno" in error) {
        const errno = (error as { errno?: number }).errno;
        if (errno === 1062) {
          return Response.json(CONFLICT_RESPONSE, { status: 409 });
        }
      }

      console.error("PUT /settings/tax-rates/[taxRateId] failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const taxRateId = idSchema.parse(url.pathname.split("/").pop());
      const current = await findTaxRate(auth.companyId, taxRateId);
      if (!current) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
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

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("DELETE /settings/tax-rates/[taxRateId] failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "delete" })]
);
