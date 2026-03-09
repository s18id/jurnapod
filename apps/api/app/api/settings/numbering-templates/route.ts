// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getDbPool } from "../../../../src/lib/db";

const NumberingTemplateSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  outlet_id: z.number().nullable(),
  doc_type: z.string(),
  pattern: z.string(),
  reset_period: z.string(),
  current_value: z.number(),
  last_reset: z.string().nullable(),
  is_active: z.boolean()
});

const sequencePatternRegex = /{{seq(\d+)?}}/;

function hasSequencePlaceholder(pattern: string): boolean {
  return sequencePatternRegex.test(pattern);
}

const NumberingTemplateCreateSchema = z.object({
  outlet_id: z.number().nullable().optional(),
  doc_type: z.enum(["SALES_INVOICE", "SALES_PAYMENT", "SALES_ORDER", "CREDIT_NOTE"]),
  pattern: z.string().min(1).max(128).refine(hasSequencePlaceholder, {
    message: "Pattern must include {{seq}} or {{seqN}}"
  }),
  reset_period: z.enum(["NEVER", "YEARLY", "MONTHLY"]),
  is_active: z.boolean().default(true)
});

const NumberingTemplateUpdateSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .max(128)
    .refine(hasSequencePlaceholder, {
      message: "Pattern must include {{seq}} or {{seqN}}"
    })
    .optional(),
  reset_period: z.enum(["NEVER", "YEARLY", "MONTHLY"]).optional(),
  is_active: z.boolean().optional(),
  current_value: z.number().int().min(0).optional()
});

type NumberingTemplate = z.infer<typeof NumberingTemplateSchema>;

async function listTemplates(companyId: number): Promise<NumberingTemplate[]> {
  const pool = getDbPool();
  const [rows] = await pool.execute(
    `SELECT id, company_id, outlet_id, doc_type, pattern, reset_period, 
            current_value, last_reset, is_active 
     FROM numbering_templates 
     WHERE company_id = ? 
     ORDER BY outlet_id, doc_type`,
    [companyId]
  );
  return (rows as any[]).map((row) => ({
    ...row,
    is_active: Boolean(row.is_active)
  }));
}

async function getTemplate(companyId: number, templateId: number): Promise<NumberingTemplate | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute(
    `SELECT id, company_id, outlet_id, doc_type, pattern, reset_period, 
            current_value, last_reset, is_active 
     FROM numbering_templates 
     WHERE company_id = ? AND id = ?`,
    [companyId, templateId]
  );
  if ((rows as any[]).length === 0) return null;
  const row = (rows as any[])[0];
  return {
    ...row,
    is_active: Boolean(row.is_active)
  };
}

async function createTemplate(companyId: number, input: z.infer<typeof NumberingTemplateCreateSchema>): Promise<NumberingTemplate> {
  const pool = getDbPool();
  const scopeKey = input.outlet_id ?? 0;
  const [result] = await pool.execute(
    `INSERT INTO numbering_templates (company_id, outlet_id, scope_key, doc_type, pattern, reset_period, current_value, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      companyId,
      input.outlet_id ?? null,
      scopeKey,
      input.doc_type,
      input.pattern,
      input.reset_period,
      input.is_active ? 1 : 0
    ]
  );
  return {
    id: (result as any).insertId,
    company_id: companyId,
    outlet_id: input.outlet_id ?? null,
    doc_type: input.doc_type,
    pattern: input.pattern,
    reset_period: input.reset_period,
    current_value: 0,
    last_reset: null,
    is_active: input.is_active
  };
}

async function updateTemplate(
  companyId: number,
  templateId: number,
  input: z.infer<typeof NumberingTemplateUpdateSchema>
): Promise<NumberingTemplate | null> {
  const pool = getDbPool();
  const updates: string[] = [];
  const values: any[] = [];

  if (input.pattern !== undefined) {
    updates.push("pattern = ?");
    values.push(input.pattern);
  }
  if (input.reset_period !== undefined) {
    updates.push("reset_period = ?");
    values.push(input.reset_period);
  }
  if (input.is_active !== undefined) {
    updates.push("is_active = ?");
    values.push(input.is_active ? 1 : 0);
  }
  if (input.current_value !== undefined) {
    updates.push("current_value = ?");
    values.push(input.current_value);
  }

  if (updates.length === 0) return getTemplate(companyId, templateId);

  values.push(companyId, templateId);
  await pool.execute(
    `UPDATE numbering_templates SET ${updates.join(", ")} WHERE company_id = ? AND id = ?`,
    values
  );

  return getTemplate(companyId, templateId);
}

async function deleteTemplate(companyId: number, templateId: number): Promise<boolean> {
  const pool = getDbPool();
  const [result] = await pool.execute(
    `DELETE FROM numbering_templates WHERE company_id = ? AND id = ?`,
    [companyId, templateId]
  );
  return (result as any).affectedRows > 0;
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const templates = await listTemplates(auth.companyId);
      return successResponse({ templates });
    } catch (error) {
      console.error("GET /settings/numbering-templates failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch templates", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "settings",
      permission: "read"
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = NumberingTemplateCreateSchema.parse(payload);

      if (typeof input.outlet_id === "number") {
        const pool = getDbPool();
        const [rows] = await pool.execute(
          `SELECT id FROM outlets WHERE id = ? AND company_id = ? LIMIT 1`,
          [input.outlet_id, auth.companyId]
        );
        if ((rows as any[]).length === 0) {
          return errorResponse("INVALID_REQUEST", "Invalid outlet", 400);
        }
      }

      const existing = await listTemplates(auth.companyId);
      const duplicate = existing.find(
        (t) => t.doc_type === input.doc_type && t.outlet_id === (input.outlet_id ?? null)
      );
      if (duplicate) {
        return errorResponse("CONFLICT", "Template already exists for this document type and scope", 409);
      }

      const template = await createTemplate(auth.companyId, input);
      return successResponse(template, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("POST /settings/numbering-templates failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create template", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "settings",
      permission: "create"
    })
  ]
);
