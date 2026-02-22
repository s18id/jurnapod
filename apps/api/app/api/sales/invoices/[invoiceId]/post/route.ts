import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../../src/lib/auth-guard";
import {
  DatabaseForbiddenError,
  InvoiceStatusError,
  postInvoice
} from "../../../../../../src/lib/sales";

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

const FORBIDDEN_RESPONSE = {
  ok: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const INVALID_TRANSITION_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_TRANSITION",
    message: "Invoice cannot be posted"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Invoice post request failed"
  }
};

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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, invoice }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof InvoiceStatusError) {
        return Response.json(INVALID_TRANSITION_RESPONSE, { status: 409 });
      }

      if (error instanceof DatabaseForbiddenError) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      console.error("POST /sales/invoices/:id/post failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
