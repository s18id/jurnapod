// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../src/lib/db";

const querySchema = z.object({
  keys: z.string().optional()
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

function parseKeys(rawKeys: string | undefined): string[] {
  if (!rawKeys) {
    return [];
  }

  return rawKeys
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        keys: url.searchParams.get("keys") ?? undefined
      });
      const keys = parseKeys(parsed.keys);

      const pool = getDbPool();
      let rows: RowDataPacket[] = [];
      if (keys.length > 0) {
        const placeholders = keys.map(() => "?").join(", ");
        const [result] = await pool.execute<RowDataPacket[]>(
          `SELECT \`key\`, enabled, config_json
           FROM feature_flags
           WHERE company_id = ?
             AND \`key\` IN (${placeholders})`,
          [auth.companyId, ...keys]
        );
        rows = result;
      } else {
        const [result] = await pool.execute<RowDataPacket[]>(
          `SELECT \`key\`, enabled, config_json
           FROM feature_flags
           WHERE company_id = ?
           ORDER BY \`key\` ASC`,
          [auth.companyId]
        );
        rows = result;
      }

      const flags = (rows as Array<{ key?: string; enabled?: number; config_json?: string }>).map(
        (row) => ({
          key: String(row.key ?? ""),
          enabled: row.enabled === 1,
          config_json: typeof row.config_json === "string" ? row.config_json : "{}"
        })
      );

      return Response.json({ ok: true, flags }, { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/feature-flags failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    void request;
    void auth;
    return errorResponse(
      "READ_ONLY",
      "Feature flags are read-only. Use /api/settings/modules instead.",
      410
    );
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
