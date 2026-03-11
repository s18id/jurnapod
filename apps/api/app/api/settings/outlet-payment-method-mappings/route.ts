// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError, z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireAccess, requireAccessForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { userHasOutletAccess } from "../../../../src/lib/auth";
import { getDbPool } from "../../../../src/lib/db";
import { errorResponse, successResponse } from "../../../../src/lib/response";

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
      method_code: z.string().trim().min(1),
      account_id: z.number().int().positive(),
      label: z.string().trim().min(1).optional(),
      is_invoice_default: z.boolean().optional()
    })
  )
});

const outletBodySchema = z.object({
  scope: z.literal("outlet"),
  outlet_id: z.number().int().positive(),
  mappings: z.array(
    z.object({
      method_code: z.string().trim().min(1),
      account_id: z.number().int().positive().or(z.literal("")),
      label: z.string().trim().min(1).optional(),
      is_invoice_default: z.boolean().optional()
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

const paymentMethodConfigSchema = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  method: z.string().trim().min(1).optional()
});

const paymentMethodsSchema = z
  .array(z.string().trim().min(1))
  .or(z.array(paymentMethodConfigSchema))
  .or(
    z.object({
      methods: z
        .array(z.string().trim().min(1))
        .or(z.array(paymentMethodConfigSchema))
    })
  )
  .optional();

function normalizeMethodCode(method: string): string {
  return method.trim().toUpperCase();
}

type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;

async function readLegacyPaymentMethods(
  companyId: number
): Promise<Array<string | PaymentMethodConfig> | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT \`key\`, enabled, config_json
     FROM feature_flags
     WHERE company_id = ?
       AND \`key\` IN ('pos.payment_methods', 'pos.config')`,
    [companyId]
  );

  let resolved: Array<string | PaymentMethodConfig> | null = null;

  for (const row of rows as Array<{ key?: string; enabled?: number; config_json?: string }>) {
    if (row.enabled !== 1 || typeof row.key !== "string") {
      continue;
    }

    let parsed: unknown = null;
    try {
      parsed = typeof row.config_json === "string" ? JSON.parse(row.config_json) : null;
    } catch {
      parsed = null;
    }

    let candidate = parsed;
    if (row.key === "pos.config" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      candidate = (parsed as Record<string, unknown>).payment_methods ?? parsed;
    }

    const methodsConfig = paymentMethodsSchema.safeParse(candidate);
    if (methodsConfig.success) {
      resolved = Array.isArray(methodsConfig.data)
        ? methodsConfig.data
        : methodsConfig.data?.methods ?? resolved;
    }
  }

  return resolved;
}

async function readPaymentMethods(companyId: number): Promise<PaymentMethodConfig[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ?
       AND m.code = 'pos'
     LIMIT 1`,
    [companyId]
  );

  let paymentMethods: Array<string | PaymentMethodConfig> = ["CASH"];
  let resolvedFromModules = false;

  const posRow = (rows as Array<{ enabled?: number; config_json?: string }>)[0];
  if (posRow && posRow.enabled === 1) {
    let parsed: unknown = null;
    try {
      parsed = typeof posRow.config_json === "string" ? JSON.parse(posRow.config_json) : null;
    } catch {
      parsed = null;
    }

    const candidate =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).payment_methods ?? parsed
        : parsed;
    const methodsConfig = paymentMethodsSchema.safeParse(candidate);
    if (methodsConfig.success) {
      paymentMethods = Array.isArray(methodsConfig.data)
        ? methodsConfig.data
        : methodsConfig.data?.methods ?? paymentMethods;
      resolvedFromModules = true;
    }
  }

  if (!posRow || (posRow.enabled === 1 && !resolvedFromModules)) {
    const legacy = await readLegacyPaymentMethods(companyId);
    if (legacy && legacy.length > 0) {
      paymentMethods = legacy;
    }
  }

  return paymentMethods.map((method) => {
    if (typeof method === "string") {
      const code = normalizeMethodCode(method);
      return { code, label: code };
    }
    return {
      code: normalizeMethodCode(method.code),
      label: method.label.trim(),
      method: method.method ? method.method.trim() : undefined
    };
  });
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
        const paymentMethods = await readPaymentMethods(auth.companyId);
        
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT method_code, account_id, label, is_invoice_default
           FROM company_payment_method_mappings
           WHERE company_id = ?`,
          [auth.companyId]
        );

        const mappings = (rows as Array<{ 
          method_code?: string; 
          account_id?: number; 
          label?: string | null;
          is_invoice_default?: number;
        }>).map(
          (row) => ({
            method_code: normalizeMethodCode(String(row.method_code ?? "")),
            account_id: Number(row.account_id ?? 0),
            label: typeof row.label === "string" && row.label.trim().length > 0 ? row.label.trim() : undefined,
            is_invoice_default: row.is_invoice_default === 1
          })
        ).filter((row) => row.method_code.length > 0 && Number.isFinite(row.account_id) && row.account_id > 0);

        const methodCodes = new Set(paymentMethods.map((method) => method.code));
        const mergedPaymentMethods = paymentMethods.map((method) => ({ ...method }));
        const mappingLabels = new Map(
          mappings
            .filter((mapping) => typeof mapping.label === "string" && mapping.label.length > 0)
            .map((mapping) => [mapping.method_code, mapping.label as string])
        );

        mergedPaymentMethods.forEach((method) => {
          const overrideLabel = mappingLabels.get(method.code);
          if (overrideLabel) {
            method.label = overrideLabel;
          }
        });

        mappings.forEach((mapping) => {
          if (!methodCodes.has(mapping.method_code)) {
            methodCodes.add(mapping.method_code);
            mergedPaymentMethods.push({
              code: mapping.method_code,
              label: mapping.label ?? mapping.method_code
            });
          }
        });

        return successResponse({
          scope: "company",
          payment_methods: mergedPaymentMethods,
          mappings
        });
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id!);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const outletId = parsed.outlet_id as number;
      const paymentMethods = await readPaymentMethods(auth.companyId);
      
      const [outletRows] = await pool.execute<RowDataPacket[]>(
        `SELECT method_code, account_id, label, is_invoice_default
         FROM outlet_payment_method_mappings
         WHERE company_id = ?
           AND outlet_id = ?`,
        [auth.companyId, outletId]
      );

      const outletMappings = new Map<string, {
        method_code: string;
        account_id: number;
        label?: string;
        is_invoice_default: boolean;
      }>();

      for (const row of outletRows as Array<{ 
        method_code?: string; 
        account_id?: number; 
        label?: string | null;
        is_invoice_default?: number;
      }>) {
        const methodCode = normalizeMethodCode(String(row.method_code ?? ""));
        const accountId = row.account_id;
        if (methodCode.length > 0 && accountId !== undefined && Number.isFinite(accountId) && accountId > 0) {
          outletMappings.set(methodCode, {
            method_code: methodCode,
            account_id: Number(accountId),
            label: typeof row.label === "string" && row.label.trim().length > 0 ? row.label.trim() : undefined,
            is_invoice_default: row.is_invoice_default === 1
          });
        }
      }

      const [companyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT method_code, account_id, label, is_invoice_default
         FROM company_payment_method_mappings
         WHERE company_id = ?`,
        [auth.companyId]
      );

      const companyMappings = new Map<string, {
        method_code: string;
        account_id: number;
        label?: string;
        is_invoice_default: boolean;
      }>();

      for (const row of companyRows as Array<{ 
        method_code?: string; 
        account_id?: number; 
        label?: string | null;
        is_invoice_default?: number;
      }>) {
        const methodCode = normalizeMethodCode(String(row.method_code ?? ""));
        const accountId = row.account_id;
        if (methodCode.length > 0 && accountId !== undefined && Number.isFinite(accountId) && accountId > 0) {
          companyMappings.set(methodCode, {
            method_code: methodCode,
            account_id: Number(accountId),
            label: typeof row.label === "string" && row.label.trim().length > 0 ? row.label.trim() : undefined,
            is_invoice_default: row.is_invoice_default === 1
          });
        }
      }

      const allMethodCodes = new Set<string>();
      for (const method of paymentMethods) {
        allMethodCodes.add(method.code);
      }
      for (const code of outletMappings.keys()) {
        allMethodCodes.add(code);
      }
      for (const code of companyMappings.keys()) {
        allMethodCodes.add(code);
      }

      const effectivePaymentMethods: Array<{ code: string; label: string }> = [];
      for (const method of paymentMethods) {
        effectivePaymentMethods.push({ ...method });
      }

      for (const code of allMethodCodes) {
        if (!effectivePaymentMethods.some((pm) => pm.code === code)) {
          const outlet = outletMappings.get(code);
          const company = companyMappings.get(code);
          const label = outlet?.label ?? company?.label ?? code;
          effectivePaymentMethods.push({ code, label });
        }
      }

      const effectiveMappings: Array<{
        method_code: string;
        account_id: number;
        label?: string;
        is_invoice_default: boolean;
        source: "outlet" | "company";
        company_account_id: number | null;
      }> = [];

      for (const code of allMethodCodes) {
        const outlet = outletMappings.get(code);
        const company = companyMappings.get(code);

        if (outlet) {
          effectiveMappings.push({
            ...outlet,
            source: "outlet",
            company_account_id: company?.account_id ?? null
          });
        } else if (company) {
          effectiveMappings.push({
            ...company,
            source: "company",
            company_account_id: company.account_id
          });
        }
      }

      const methodLabels = new Map<string, string>();
      for (const m of effectiveMappings) {
        if (m.label) {
          methodLabels.set(m.method_code, m.label);
        }
      }

      for (const pm of effectivePaymentMethods) {
        const label = methodLabels.get(pm.code);
        if (label) {
          pm.label = label;
        }
      }

      return successResponse({
        scope: "outlet",
        outlet_id: parsed.outlet_id as number,
        payment_methods: effectivePaymentMethods,
        mappings: effectiveMappings
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/outlet-payment-method-mappings failed", error);
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
        const invoiceDefaults = parsed.mappings.filter((m) => m.is_invoice_default === true);
        
        if (invoiceDefaults.length > 1) {
          return errorResponse(
            "MULTIPLE_INVOICE_DEFAULTS", 
            "Only one payment method can be set as invoice default", 
            400
          );
        }

        const accountIds = Array.from(new Set(parsed.mappings.map((mapping) => mapping.account_id)));
        if (accountIds.length > 0) {
          const placeholders = accountIds.map(() => "?").join(", ");
          const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id
             FROM accounts
             WHERE company_id = ?
               AND is_payable = 1
               AND id IN (${placeholders})`,
            [auth.companyId, ...accountIds]
          );
          const payableIds = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
          const invalidIds = accountIds.filter((id) => !payableIds.has(Number(id)));
          if (invalidIds.length > 0) {
            return errorResponse("INVALID_PAYMENT_ACCOUNT", "Account is not eligible for payments", 400);
          }
        }

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          await connection.execute(
            `DELETE FROM company_payment_method_mappings
             WHERE company_id = ?`,
            [auth.companyId]
          );

          for (const mapping of parsed.mappings) {
            const methodCode = normalizeMethodCode(mapping.method_code);
            const label = mapping.label ? mapping.label.trim() : null;
            const isInvoiceDefault = mapping.is_invoice_default === true ? 1 : 0;
            await connection.execute(
              `INSERT INTO company_payment_method_mappings 
               (company_id, method_code, label, account_id, is_invoice_default)
               VALUES (?, ?, ?, ?, ?)`,
              [auth.companyId, methodCode, label, mapping.account_id, isInvoiceDefault]
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

      const invoiceDefaults = parsed.mappings.filter((m) => m.is_invoice_default === true);
      
      if (invoiceDefaults.length > 1) {
        return errorResponse(
          "MULTIPLE_INVOICE_DEFAULTS", 
          "Only one payment method can be set as invoice default", 
          400
        );
      }

      const mappingsToUpsert = parsed.mappings.filter((m) => m.account_id !== "");
      const methodCodesToDelete = parsed.mappings.filter((m) => m.account_id === "").map((m) => normalizeMethodCode(m.method_code));

      const accountIds = Array.from(new Set(mappingsToUpsert.map((m) => m.account_id)));
      if (accountIds.length > 0) {
        const placeholders = accountIds.map(() => "?").join(", ");
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id
           FROM accounts
           WHERE company_id = ?
             AND is_payable = 1
             AND id IN (${placeholders})`,
          [auth.companyId, ...accountIds]
        );
        const payableIds = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
        const invalidIds = accountIds.filter((id) => !payableIds.has(Number(id)));
        if (invalidIds.length > 0) {
          return errorResponse("INVALID_PAYMENT_ACCOUNT", "Account is not eligible for payments", 400);
        }
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        if (methodCodesToDelete.length > 0) {
          const deletePlaceholders = methodCodesToDelete.map(() => "?").join(", ");
          await connection.execute(
            `DELETE FROM outlet_payment_method_mappings
             WHERE company_id = ?
               AND outlet_id = ?
               AND method_code IN (${deletePlaceholders})`,
            [auth.companyId, parsed.outlet_id, ...methodCodesToDelete]
          );
        }

        for (const mapping of mappingsToUpsert) {
          const methodCode = normalizeMethodCode(mapping.method_code);
          const label = mapping.label ? mapping.label.trim() : null;
          const isInvoiceDefault = mapping.is_invoice_default === true ? 1 : 0;
          await connection.execute(
            `INSERT INTO outlet_payment_method_mappings 
             (company_id, outlet_id, method_code, label, account_id, is_invoice_default)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE label = VALUES(label), account_id = VALUES(account_id), is_invoice_default = VALUES(is_invoice_default)`,
            [auth.companyId, parsed.outlet_id, methodCode, label, mapping.account_id, isInvoiceDefault]
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

      console.error("PUT /api/settings/outlet-payment-method-mappings failed", error);
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
