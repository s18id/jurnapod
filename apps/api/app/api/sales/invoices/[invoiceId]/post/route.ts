// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../../src/lib/auth-guard";
import { FiscalYearNotOpenError } from "../../../../../../src/lib/fiscal-years";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  DatabaseForbiddenError,
  InvoiceStatusError,
  postInvoice
} from "../../../../../../src/lib/sales";

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
      
      const invoice = await postInvoice(
        auth.companyId,
        invoiceId,
        { userId: auth.userId }
      );

      if (!invoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      return successResponse(invoice);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof InvoiceStatusError) {
        return errorResponse("INVALID_TRANSITION", "Invoice cannot be posted", 409);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof FiscalYearNotOpenError) {
        return errorResponse(
          "FISCAL_YEAR_CLOSED",
          "Invoice date is outside any open fiscal year",
          400
        );
      }

      console.error("POST /sales/invoices/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice post request failed", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
