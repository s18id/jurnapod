// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import { getDbPool } from "../../../../../src/lib/db";

const sequencePatternRegex = /{{seq(\d+)?}}/;

function hasSequencePlaceholder(pattern: string): boolean {
  return sequencePatternRegex.test(pattern);
}

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

function parseTemplateId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const idRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(idRaw);
}

async function getTemplate(companyId: number, templateId: number): Promise<any | null> {
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
      const templateId = parseTemplateId(request);
      const template = await getTemplate(auth.companyId, templateId);
      if (!template) {
        return errorResponse("NOT_FOUND", "Template not found", 404);
      }
      return successResponse(template);
    } catch (error) {
      console.error("GET /settings/numbering-templates/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch template", 500);
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

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const templateId = parseTemplateId(request);
      const payload = await request.json();
      const input = NumberingTemplateUpdateSchema.parse(payload);

      const existing = await getTemplate(auth.companyId, templateId);
      if (!existing) {
        return errorResponse("NOT_FOUND", "Template not found", 404);
      }

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

      if (updates.length === 0) {
        return errorResponse("INVALID_REQUEST", "No fields to update", 400);
      }

      const pool = getDbPool();
      values.push(auth.companyId, templateId);
      await pool.execute(
        `UPDATE numbering_templates SET ${updates.join(", ")} WHERE company_id = ? AND id = ?`,
        values
      );

      const updated = await getTemplate(auth.companyId, templateId);
      return successResponse(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("PATCH /settings/numbering-templates/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update template", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "settings",
      permission: "update"
    })
  ]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const templateId = parseTemplateId(request);
      const deleted = await deleteTemplate(auth.companyId, templateId);
      if (!deleted) {
        return errorResponse("NOT_FOUND", "Template not found", 404);
      }
      return successResponse({ deleted: true });
    } catch (error) {
      console.error("DELETE /settings/numbering-templates/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete template", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "settings",
      permission: "delete"
    })
  ]
);
