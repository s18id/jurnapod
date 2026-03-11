// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireAccess, requireAccessForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { userHasOutletAccess } from "../../../../src/lib/auth";
import { getDbPool } from "../../../../src/lib/db";
import { errorResponse, successResponse } from "../../../../src/lib/response";

const mappingKeys = ["SALES_REVENUE", "SALES_TAX", "AR", "INVOICE_PAYMENT_BANK"] as const;
const mappingKeySchema = z.enum(mappingKeys);
const scopeSchema = z.enum(["company", "outlet"]);

const querySchema = z
  .object({
    scope: scopeSchema.optional().default("outlet"),
    outlet_id: z.coerce.number().int().positive().optional()
  })
  .refine(
    (data) => data.scope === "company" || (data.outlet_id !== undefined && data.outlet_id > 0),
    { message: "outlet_id is required when scope is outlet" }
  );

const companyBodySchema = z.object({
  scope: z.literal("company"),
  mappings: z.array(
    z.object({
      mapping_key: mappingKeySchema,
      account_id: z.number().int().positive()
    })
  )
});

const outletBodySchema = z.object({
  scope: z.literal("outlet"),
  outlet_id: z.number().int().positive(),
  mappings: z.array(
    z.object({
      mapping_key: mappingKeySchema,
      account_id: z.number().int().positive().or(z.literal(""))
    })
  )
});

const bodySchema = z.discriminatedUnion("scope", [companyBodySchema, outletBodySchema]);

const outletGuardSchema = outletBodySchema.pick({
  outlet_id: true
});

const invalidJsonGuardError = new ZodError([
  {
    code: z.ZodIssueCode.custom,
    message: "Invalid request",
    path: []
  }
]);

async function parseOutletIdForGuard(request: Request): Promise<number> {
  try {
    const payload = await request.clone().json();
    return outletGuardSchema.parse(payload).outlet_id;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidJsonGuardError;
    }

    throw error;
  }
}

async function parseScopeForGuard(request: Request): Promise<"company" | "outlet"> {
  try {
    const payload = await request.clone().json();
    const parsed = scopeSchema.parse(payload.scope);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidJsonGuardError;
    }

    throw error;
  }
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const scopeParam = url.searchParams.get("scope");
      const outletIdParam = url.searchParams.get("outlet_id");
      
      const parsed = querySchema.parse({
        scope: scopeParam || undefined,
        outlet_id: outletIdParam ? Number(outletIdParam) : undefined
      });

      const pool = getDbPool();

      if (parsed.scope === "company") {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT mapping_key, account_id
           FROM company_account_mappings
           WHERE company_id = ?`,
          [auth.companyId]
        );

        return successResponse({
          scope: "company",
          mappings: rows as Array<{ mapping_key: string; account_id: number }>
        });
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id!);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const outletId = parsed.outlet_id as number;
      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT mapping_key, account_id
         FROM outlet_account_mappings
         WHERE company_id = ?
           AND outlet_id = ?`,
        [auth.companyId, outletId]
      );

      const outletMap = new Map<string, number>();
      for (const row of outletRows as Array<{ mapping_key: string; account_id: number }>) {
        outletMap.set(row.mapping_key, row.account_id);
      }

      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT mapping_key, account_id
         FROM company_account_mappings
         WHERE company_id = ?`,
        [auth.companyId]
      );

      const companyMap = new Map<string, number>();
      for (const row of companyRows as Array<{ mapping_key: string; account_id: number }>) {
        companyMap.set(row.mapping_key, row.account_id);
      }

      const effectiveMappings: Array<{ mapping_key: string; account_id: number | null; source: "outlet" | "company" | null; company_account_id: number | null }> = mappingKeys.map((key) => {
        const outletAccountId = outletMap.get(key);
        const companyAccountId = companyMap.get(key);
        
        if (outletAccountId !== undefined) {
          return { mapping_key: key, account_id: outletAccountId, source: "outlet" as const, company_account_id: companyAccountId ?? null };
        }
        if (companyAccountId !== undefined) {
          return { mapping_key: key, account_id: companyAccountId, source: "company" as const, company_account_id: companyAccountId };
        }
        return { mapping_key: key, account_id: null, source: null, company_account_id: null };
      });

      return successResponse({
        scope: "outlet",
        outlet_id: parsed.outlet_id as number,
        mappings: effectiveMappings
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/outlet-account-mappings failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "settings",
      permission: "read"
    })
  ]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const parsed = bodySchema.parse(payload);

      const pool = getDbPool();

      if (parsed.scope === "company") {
        const requiredKeys: readonly ("AR" | "SALES_REVENUE" | "SALES_TAX")[] = ["AR", "SALES_REVENUE", "SALES_TAX"];
        const providedKeys = new Set(parsed.mappings.map((m) => m.mapping_key));
        const missingKeys = requiredKeys.filter((key) => !providedKeys.has(key));
        
        if (missingKeys.length > 0) {
          return errorResponse(
            "INCOMPLETE_COMPANY_MAPPING",
            `Missing required sales mappings: ${missingKeys.join(", ")}`,
            400
          );
        }

        const accountIds = Array.from(new Set(parsed.mappings.map((m) => m.account_id)));
        if (accountIds.length > 0) {
          const placeholders = accountIds.map(() => "?").join(", ");
          const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM accounts WHERE company_id = ? AND id IN (${placeholders})`,
            [auth.companyId, ...accountIds]
          );
          const validIds = new Set((rows as Array<{ id: number }>).map((r) => r.id));
          const invalidIds = accountIds.filter((id) => !validIds.has(id));
          if (invalidIds.length > 0) {
            return errorResponse("INVALID_ACCOUNT_MAPPING", "One or more accounts are invalid for this company", 400);
          }
        }

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          for (const mapping of parsed.mappings) {
            await connection.execute(
              `INSERT INTO company_account_mappings (company_id, mapping_key, account_id)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)`,
              [auth.companyId, mapping.mapping_key, mapping.account_id]
            );
          }

          await connection.commit();
        } catch (dbError) {
          await connection.rollback();
          throw dbError;
        } finally {
          connection.release();
        }

        return successResponse(null);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const mappingsToUpsert = parsed.mappings.filter((m): m is { mapping_key: typeof mappingKeys[number]; account_id: number } => m.account_id !== "");
      const mappingsToDelete = parsed.mappings.filter((m) => m.account_id === "").map((m) => m.mapping_key);

      const accountIds = Array.from(new Set(mappingsToUpsert.map((m) => m.account_id)));
      if (accountIds.length > 0) {
        const placeholders = accountIds.map(() => "?").join(", ");
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM accounts WHERE company_id = ? AND id IN (${placeholders})`,
          [auth.companyId, ...accountIds]
        );
        const validIds = new Set((rows as Array<{ id: number }>).map((r) => r.id));
        const invalidIds = accountIds.filter((id) => !validIds.has(Number(id)));
        if (invalidIds.length > 0) {
          return errorResponse("INVALID_ACCOUNT_MAPPING", "One or more accounts are invalid for this company", 400);
        }
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        for (const mapping of mappingsToUpsert) {
          await connection.execute(
            `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)`,
            [auth.companyId, parsed.outlet_id, mapping.mapping_key, mapping.account_id]
          );
        }

        if (mappingsToDelete.length > 0) {
          const deletePlaceholders = mappingsToDelete.map(() => "?").join(", ");
          await connection.execute(
            `DELETE FROM outlet_account_mappings
             WHERE company_id = ?
               AND outlet_id = ?
               AND mapping_key IN (${deletePlaceholders})`,
            [auth.companyId, parsed.outlet_id, ...mappingsToDelete]
          );
        }

        await connection.commit();
      } catch (dbError) {
        await connection.rollback();
        throw dbError;
      } finally {
        connection.release();
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/settings/outlet-account-mappings failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "settings",
      permission: "update",
      outletId: async (request) => {
        const scope = await parseScopeForGuard(request);
        if (scope === "company") {
          return null;
        }
        return parseOutletIdForGuard(request);
      }
    })
  ]
);
