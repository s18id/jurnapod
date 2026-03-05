// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../../src/lib/auth-guard";
import { getInvoice } from "../../../../../../src/lib/sales";
import { generateInvoiceHTML } from "../../../../../../src/lib/invoice-template";
import { generatePdfFromHtml } from "../../../../../../src/lib/pdf-generator";
import { errorResponse } from "../../../../../../src/lib/response";

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

      const html = generateInvoiceHTML(invoice);
      const pdfBuffer = await generatePdfFromHtml(html, {
        format: "A4",
        printBackground: true
      });

      return new Response(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="invoice-${invoice.invoice_no}.pdf"`,
          "Content-Length": pdfBuffer.length.toString()
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/invoices/:id/pdf failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice PDF request failed", 500);
    }
  },
  [requireRole(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);
