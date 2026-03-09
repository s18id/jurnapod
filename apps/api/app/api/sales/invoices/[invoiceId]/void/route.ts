// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import { InvoiceStatusError, voidInvoice } from "../../../../../../src/lib/sales";

function parseInvoiceId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const invoiceIdRaw = parts[parts.indexOf("invoices") + 1];
  return NumericIdSchema.parse(invoiceIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const invoiceId = parseInvoiceId(request);
      const invoice = await voidInvoice(auth.companyId, invoiceId, {
        userId: auth.userId
      });

      if (!invoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      return successResponse(invoice);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof InvoiceStatusError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /sales/invoices/:id/void failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Void invoice failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "delete"
    })
  ]
);
