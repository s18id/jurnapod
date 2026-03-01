import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { userHasOutletAccess } from "../../../../src/lib/auth";
import { getDbPool } from "../../../../src/lib/db";

const mappingKeys = ["SALES_REVENUE", "SALES_TAX", "AR"] as const;
const mappingKeySchema = z.enum(mappingKeys);

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive()
});

const bodySchema = z.object({
  outlet_id: z.number().int().positive(),
  mappings: z.array(
    z.object({
      mapping_key: mappingKeySchema,
      account_id: z.number().int().positive()
    })
  )
});

function errorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message
      }
    },
    { status }
  );
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id")
      });

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const pool = getDbPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT mapping_key, account_id
         FROM outlet_account_mappings
         WHERE company_id = ?
           AND outlet_id = ?`,
        [auth.companyId, parsed.outlet_id]
      );

      return Response.json(
        {
          ok: true,
          outlet_id: parsed.outlet_id,
          mappings: rows as Array<{ mapping_key: string; account_id: number }>
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/outlet-account-mappings failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const parsed = bodySchema.parse(payload);

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const pool = getDbPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        for (const mapping of parsed.mappings) {
          await connection.execute(
            `INSERT INTO outlet_account_mappings (company_id, outlet_id, mapping_key, account_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE account_id = VALUES(account_id)`,
            [auth.companyId, parsed.outlet_id, mapping.mapping_key, mapping.account_id]
          );
        }

        await connection.commit();
      } catch (dbError) {
        await connection.rollback();
        throw dbError;
      } finally {
        connection.release();
      }

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/settings/outlet-account-mappings failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
