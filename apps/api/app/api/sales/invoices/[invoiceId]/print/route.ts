import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../../src/lib/auth-guard";
import { getInvoice } from "../../../../../../src/lib/sales";
import { generateInvoiceHTML } from "../../../../../../src/lib/invoice-template";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND",
    message: "Invoice not found"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Invoice print request failed"
  }
};

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
        return new Response(JSON.stringify(NOT_FOUND_RESPONSE), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      const html = generateInvoiceHTML(invoice);

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8"
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return new Response(JSON.stringify(INVALID_REQUEST_RESPONSE), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      console.error("GET /sales/invoices/:id/print failed", error);
      return new Response(JSON.stringify(INTERNAL_SERVER_ERROR_RESPONSE), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
