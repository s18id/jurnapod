// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  NumericIdSchema,
  SalesInvoiceUpdateRequestSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  getInvoice,
  InvoiceStatusError,
  updateInvoice
} from "../../../../../src/lib/sales";

function parseInvoiceId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const invoiceIdRaw = parts[parts.indexOf("invoices") + 1];
  return NumericIdSchema.parse(invoiceIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const invoiceId = parseInvoiceId(request);
      const invoice = await getInvoice(auth.companyId, invoiceId);

      if (!invoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      return successResponse(invoice);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/invoices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "read"
    })
  ]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const invoiceId = parseInvoiceId(request);
      const payload = await request.json();
      const input = SalesInvoiceUpdateRequestSchema.parse(payload);

      const invoice = await updateInvoice(
        auth.companyId,
        invoiceId,
        input,
        { userId: auth.userId }
      );

      if (!invoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      return successResponse(invoice);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof InvoiceStatusError) {
        return errorResponse("INVALID_TRANSITION", "Invoice is not editable", 409);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Invoice conflict", 409);
      }

      console.error("PATCH /sales/invoices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "update"
    })
  ]
);
