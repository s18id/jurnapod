import { ZodError } from "zod";
import type { RowDataPacket } from "mysql2";
import { TaxDefaultsUpdateSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../src/lib/db";
import { getAuditService } from "../../../../src/lib/audit";
import { readClientIp } from "../../../../src/lib/request-meta";

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

const INVALID_CONFIG_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_TAX_DEFAULTS",
    message: "Default tax rates must share the same inclusive setting"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Tax defaults request failed"
  }
};

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const pool = getDbPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT tax_rate_id
         FROM company_tax_defaults
         WHERE company_id = ?
         ORDER BY tax_rate_id ASC`,
        [auth.companyId]
      );

      const taxRateIds = (rows as Array<{ tax_rate_id?: number }>).map((row) => Number(row.tax_rate_id));
      return Response.json({ ok: true, tax_rate_ids: taxRateIds }, { status: 200 });
    } catch (error) {
      console.error("GET /settings/tax-defaults failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = TaxDefaultsUpdateSchema.parse(payload);

      const uniqueIds = Array.from(new Set(input.tax_rate_ids));
      if (uniqueIds.length === 0) {
        const pool = getDbPool();
        await pool.execute(
          `DELETE FROM company_tax_defaults WHERE company_id = ?`,
          [auth.companyId]
        );
        return Response.json({ ok: true }, { status: 200 });
      }

      const pool = getDbPool();
      const placeholders = uniqueIds.map(() => "?").join(", ");
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, is_inclusive
         FROM tax_rates
         WHERE company_id = ?
           AND is_active = 1
           AND id IN (${placeholders})`,
        [auth.companyId, ...uniqueIds]
      );

      const matchedIds = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
      if (matchedIds.size !== uniqueIds.length) {
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      const inclusiveValues = new Set(
        (rows as Array<{ is_inclusive?: number }>).map((row) => row.is_inclusive === 1)
      );
      if (inclusiveValues.size > 1) {
        return Response.json(INVALID_CONFIG_RESPONSE, { status: 400 });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(
          `DELETE FROM company_tax_defaults WHERE company_id = ?`,
          [auth.companyId]
        );

        const placeholdersInsert = uniqueIds.map(() => "(?, ?, ?, ?)").join(", ");
        const values = uniqueIds.flatMap((taxRateId) => [
          auth.companyId,
          taxRateId,
          auth.userId,
          auth.userId
        ]);

        await connection.execute(
          `INSERT INTO company_tax_defaults (company_id, tax_rate_id, created_by_user_id, updated_by_user_id)
           VALUES ${placeholdersInsert}`,
          values
        );

        await connection.commit();
      } catch (dbError) {
        await connection.rollback();
        throw dbError;
      } finally {
        connection.release();
      }

      const auditService = getAuditService();
      await auditService.logAction(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "tax_rate",
        "defaults",
        "UPDATE",
        {
          tax_rate_ids: uniqueIds
        }
      );

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("PUT /settings/tax-defaults failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
