import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import {
  CompanyModulesUpdateSchema,
  ModuleConfigSchemaMap,
  type ModuleCode
} from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getDbPool } from "../../../../src/lib/db";
import { getAuditService } from "../../../../src/lib/audit";
import { readClientIp } from "../../../../src/lib/request-meta";

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

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, sortJsonValue(val)] as const);
    return Object.fromEntries(entries);
  }

  return value;
}

function parseConfigJson(configJson: string): unknown {
  const trimmed = configJson.trim();
  if (trimmed.length === 0) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function normalizeConfigJson(moduleCode: ModuleCode, configJson: string) {
  const parsed = parseConfigJson(configJson);
  const schema = ModuleConfigSchemaMap[moduleCode];
  const validated = schema.parse(parsed);
  return {
    parsed: validated,
    normalized: JSON.stringify(sortJsonValue(validated))
  };
}

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const pool = getDbPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT m.code, m.name, m.description, cm.enabled, cm.config_json
         FROM modules m
         LEFT JOIN company_modules cm
           ON cm.module_id = m.id
          AND cm.company_id = ?
         ORDER BY m.code ASC`,
        [auth.companyId]
      );

      const modules = (rows as Array<{
        code?: string;
        name?: string;
        description?: string | null;
        enabled?: number | null;
        config_json?: string | null;
      }>).map((row) => ({
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        description: typeof row.description === "string" ? row.description : null,
        enabled: row.enabled === 1,
        config_json: typeof row.config_json === "string" ? row.config_json : "{}"
      }));

      return Response.json({ ok: true, modules }, { status: 200 });
    } catch (error) {
      console.error("GET /api/settings/modules failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const parsed = CompanyModulesUpdateSchema.parse(payload);

      const normalizedModules = parsed.modules.map((moduleEntry) => {
        const normalized = normalizeConfigJson(moduleEntry.code, moduleEntry.config_json);
        return {
          code: moduleEntry.code,
          enabled: moduleEntry.enabled,
          config_json: normalized.normalized,
          parsed_config: normalized.parsed
        };
      });

      const moduleCodes = normalizedModules.map((moduleEntry) => moduleEntry.code);
      const placeholders = moduleCodes.map(() => "?").join(", ");

      const pool = getDbPool();
      const [moduleRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, code
         FROM modules
         WHERE code IN (${placeholders})`,
        moduleCodes
      );

      const moduleIdByCode = new Map(
        (moduleRows as Array<{ id?: number; code?: string }>).map((row) => [
          String(row.code ?? ""),
          Number(row.id ?? 0)
        ])
      );

      for (const moduleEntry of normalizedModules) {
        const moduleId = moduleIdByCode.get(moduleEntry.code);
        if (!moduleId) {
          return errorResponse("INVALID_REQUEST", `Unknown module: ${moduleEntry.code}`, 400);
        }
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const moduleEntry of normalizedModules) {
          const moduleId = moduleIdByCode.get(moduleEntry.code) ?? 0;
          await connection.execute(
            `INSERT INTO company_modules (
               company_id,
               module_id,
               enabled,
               config_json,
               created_by_user_id,
               updated_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               enabled = VALUES(enabled),
               config_json = VALUES(config_json),
               updated_by_user_id = VALUES(updated_by_user_id),
               updated_at = CURRENT_TIMESTAMP`,
            [
              auth.companyId,
              moduleId,
              moduleEntry.enabled ? 1 : 0,
              moduleEntry.config_json,
              auth.userId,
              auth.userId
            ]
          );
        }
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
        "setting",
        "modules",
        "UPDATE",
        {
          modules: normalizedModules.map((moduleEntry) => ({
            code: moduleEntry.code,
            enabled: moduleEntry.enabled,
            config: moduleEntry.parsed_config
          }))
        }
      );

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError || (error instanceof Error && error.message === "INVALID_JSON")) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/settings/modules failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
