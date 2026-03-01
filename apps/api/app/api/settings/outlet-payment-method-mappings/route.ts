import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { userHasOutletAccess } from "../../../../src/lib/auth";
import { getDbPool } from "../../../../src/lib/db";

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive()
});

const bodySchema = z.object({
  outlet_id: z.number().int().positive(),
  mappings: z.array(
    z.object({
      method_code: z.string().trim().min(1),
      account_id: z.number().int().positive(),
      label: z.string().trim().min(1).optional(),
      is_invoice_default: z.boolean().optional()
    })
  )
});

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
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id")
      });

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const paymentMethods = await readPaymentMethods(auth.companyId);
      const pool = getDbPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT method_code, account_id, label, is_invoice_default
         FROM outlet_payment_method_mappings
         WHERE company_id = ?
           AND outlet_id = ?`,
        [auth.companyId, parsed.outlet_id]
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

      return Response.json(
        {
          ok: true,
          outlet_id: parsed.outlet_id,
          payment_methods: mergedPaymentMethods,
          mappings
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/outlet-payment-method-mappings failed", error);
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

      // Validate: only one invoice_default per outlet
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
        const pool = getDbPool();
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id
           FROM accounts
           WHERE company_id = ?
             AND is_payable = 1
             AND id IN (${placeholders})`,
          [auth.companyId, ...accountIds]
        );
        const payableIds = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
        const invalidIds = accountIds.filter((id) => !payableIds.has(id));
        if (invalidIds.length > 0) {
          return errorResponse("INVALID_PAYMENT_ACCOUNT", "Account is not eligible for payments", 400);
        }
      }

      const pool = getDbPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.execute(
          `DELETE FROM outlet_payment_method_mappings
           WHERE company_id = ?
             AND outlet_id = ?`,
          [auth.companyId, parsed.outlet_id]
        );

        for (const mapping of parsed.mappings) {
          const methodCode = normalizeMethodCode(mapping.method_code);
          const label = mapping.label ? mapping.label.trim() : null;
          const isInvoiceDefault = mapping.is_invoice_default === true ? 1 : 0;
          await connection.execute(
            `INSERT INTO outlet_payment_method_mappings 
             (company_id, outlet_id, method_code, label, account_id, is_invoice_default)
             VALUES (?, ?, ?, ?, ?, ?)`,
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

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/settings/outlet-payment-method-mappings failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
