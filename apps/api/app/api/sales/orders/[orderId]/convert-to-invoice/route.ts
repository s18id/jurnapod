// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { convertOrderToInvoice, DatabaseConflictError, DatabaseReferenceError } from "../../../../../../src/lib/sales";
import { NumberingConflictError, NumberingTemplateNotFoundError } from "../../../../../../src/lib/numbering";

const ConvertToInvoiceSchema = z.object({
  outlet_id: NumericIdSchema,
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoice_no: z.string().trim().min(1).max(64).optional(),
  tax_amount: z.number().finite().nonnegative().optional(),
  taxes: z.array(z.object({
    tax_rate_id: NumericIdSchema,
    amount: z.number().finite().nonnegative()
  })).optional()
});

function parseOrderId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const orderIdIndex = parts.indexOf("orders") + 1;
  return parseInt(parts[orderIdIndex], 10);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const orderId = parseOrderId(request);
      const payload = await request.json();
      const input = ConvertToInvoiceSchema.parse(payload);

      const invoice = await convertOrderToInvoice(auth.companyId, orderId, input, {
        userId: auth.userId
      });

      return successResponse(invoice, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof NumberingConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof NumberingTemplateNotFoundError) {
        return errorResponse("CONFLICT", "No numbering template configured. Please configure document numbering in settings.", 409);
      }

      console.error("POST /sales/orders/:id/convert-to-invoice failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Convert to invoice failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "create"
    })
  ]
);
