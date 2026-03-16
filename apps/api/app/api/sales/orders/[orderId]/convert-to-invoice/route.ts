// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { DateOnlySchema, NumericIdSchema, SalesInvoiceDueTermSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  convertOrderToInvoice,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "../../../../../../src/lib/sales";
const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

const ConvertToInvoiceSchema = z.object({
  outlet_id: NumericIdSchema,
  invoice_date: DateOnlySchema,
  due_date: DateOnlySchema.optional(),
  due_term: SalesInvoiceDueTermSchema.optional(),
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
        if (error.message === "Numbering template not configured") {
          return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
        }
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
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
