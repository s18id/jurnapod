// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import type { RowDataPacket } from "mysql2";
import { TaxDefaultsUpdateSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../src/lib/db";
import { getAuditService } from "../../../../src/lib/audit";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";

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
      return successResponse(taxRateIds);
    } catch (error) {
      console.error("GET /settings/tax-defaults failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Tax defaults request failed", 500);
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
        return successResponse(null);
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
        return errorResponse("NOT_FOUND", "Tax rate not found", 404);
      }

      const inclusiveValues = new Set(
        (rows as Array<{ is_inclusive?: number }>).map((row) => row.is_inclusive === 1)
      );
      if (inclusiveValues.size > 1) {
        return errorResponse(
          "INVALID_TAX_DEFAULTS",
          "Default tax rates must share the same inclusive setting",
          400
        );
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

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /settings/tax-defaults failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Tax defaults request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
