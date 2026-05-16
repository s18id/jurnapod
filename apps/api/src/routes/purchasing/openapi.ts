// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing OpenAPI Route Registration
 *
 * Registers all purchasing lifecycle routes with the OpenAPIHono instance for
 * auto-generated OpenAPI spec production.  Handlers are no-op placeholders
 * because this instance is spec-generation only — runtime routes are in their
 * own Hono route files.
 *
 * Registered endpoints (server prefix /api removed — aggregator adds it):
 *   Suppliers:
 *     GET|POST   /purchasing/suppliers
 *     GET|PATCH|DELETE /purchasing/suppliers/{id}
 *     GET|POST   /purchasing/suppliers/{supplierId}/contacts
 *     GET|PATCH|DELETE /purchasing/suppliers/{supplierId}/contacts/{id}
 *   Orders:
 *     GET|POST   /purchasing/orders
 *     GET|PATCH  /purchasing/orders/{id}
 *     PATCH      /purchasing/orders/{id}/status
 *   Receipts:
 *     GET|POST   /purchasing/receipts
 *     GET        /purchasing/receipts/{id}
 *   Invoices:
 *     GET|POST   /purchasing/invoices
 *     GET        /purchasing/invoices/{id}
 *     POST       /purchasing/invoices/{id}/post
 *     POST       /purchasing/invoices/{id}/void
 *   Payments:
 *     GET|POST   /purchasing/payments
 *     GET        /purchasing/payments/{id}
 *     POST       /purchasing/payments/{id}/post
 *     POST       /purchasing/payments/{id}/void
 *   Credits:
 *     GET|POST   /purchasing/credits
 *     GET        /purchasing/credits/{id}
 *     POST       /purchasing/credits/{id}/apply
 *     POST       /purchasing/credits/{id}/void
 *   Exchange Rates:
 *     GET|POST   /purchasing/exchange-rates
 *     GET        /purchasing/exchange-rates/lookup  (registered before :id)
 *     GET|PATCH  /purchasing/exchange-rates/{id}
 *   Reports:
 *     GET        /purchasing/reports/ap-aging
 *     GET        /purchasing/reports/ap-aging/{supplierId}/detail
 *     GET|PUT    /purchasing/reports/ap-reconciliation/settings
 *     GET        /purchasing/reports/ap-reconciliation/summary
 *     GET        /purchasing/reports/ap-reconciliation/drilldown
 */

import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  SupplierCreateSchema,
  SupplierUpdateSchema,
  SupplierListQuerySchema,
  SupplierResponseSchema,
  SupplierContactCreateSchema,
  SupplierContactUpdateSchema,
  SupplierContactResponseSchema,
  PurchaseOrderCreateSchema,
  PurchaseOrderUpdateSchema,
  PurchaseOrderListQuerySchema,
  PurchaseOrderResponseSchema,
  POStatusTransitionSchema,
  GoodsReceiptCreateSchema,
  GoodsReceiptResponseSchema,
  PurchaseInvoiceCreateSchema,
  PurchaseInvoiceResponseSchema,
  ApPaymentCreateSchema,
  ApPaymentResponseSchema,
  PurchaseCreditCreateSchema,
  PurchaseCreditResponseSchema,
  ExchangeRateCreateSchema,
  ExchangeRateUpdateSchema,
  ExchangeRateResponseSchema,
  APReconciliationSettingsUpdateSchema,
  APReconciliationSummaryQuerySchema,
  APReconciliationDrilldownQuerySchema,
  APReconciliationDrilldownResponseSchema,
} from "@jurnapod/shared";

// ── Shared response schemas ──────────────────────────────────────────────────

const ErrorDetailSchema = zodOpenApi.object({
  code: zodOpenApi.string().openapi({ description: "Machine-readable error code" }),
  message: zodOpenApi.string().openapi({ description: "Human-readable error message" }),
});

const ErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: ErrorDetailSchema,
  })
  .openapi("PurchasingErrorResponse");

// Generic success wrapper — used when the data shape is already described by a
// standalone schema (e.g. SupplierResponseSchema, PurchaseOrderResponseSchema).
// We embed data inside the standard { success, data } envelope.
function dataResponseSchema(name: string, dataSchema: zodOpenApi.ZodTypeAny) {
  return zodOpenApi
    .object({
      success: zodOpenApi.literal(true).openapi({ example: true }),
      data: dataSchema,
    })
    .openapi(name);
}

/**
 * Collection-key list response envelope.
 * Runtime list endpoints return { success, data: { <keyName>: items[], total, limit, offset } }.
 */
function collectionResponseSchema(
  keyName: string,
  name: string,
  itemSchema: zodOpenApi.ZodTypeAny,
) {
  const dataShape: Record<string, zodOpenApi.ZodTypeAny> = {
    total: zodOpenApi.number().openapi({ description: "Total count of matching records" }),
    limit: zodOpenApi.number().openapi({ description: "Page size" }),
    offset: zodOpenApi.number().openapi({ description: "Page offset" }),
  };
  dataShape[keyName] = zodOpenApi
    .array(itemSchema)
    .openapi({ description: `List of ${keyName}` });
  return zodOpenApi
    .object({
      success: zodOpenApi.literal(true).openapi({ example: true }),
      data: zodOpenApi.object(dataShape),
    })
    .openapi(name);
}

// ── Aging report shared sub-schemas (used by summary & detail) ───────────────

const AgingBucketsSchema = zodOpenApi.object({
  current: zodOpenApi.string().openapi({ description: "Not yet due" }),
  due_1_30: zodOpenApi.string().openapi({ description: "1-30 days overdue" }),
  due_31_60: zodOpenApi.string().openapi({ description: "31-60 days overdue" }),
  due_61_90: zodOpenApi.string().openapi({ description: "61-90 days overdue" }),
  due_over_90: zodOpenApi.string().openapi({ description: "Over 90 days overdue" }),
});

const AgingCurrencyTotalSchema = zodOpenApi.object({
  currency: zodOpenApi.string().openapi({ description: "Currency code" }),
  total_open_amount: zodOpenApi.string().openapi({ description: "Total open amount for this currency" }),
});

const AgingSupplierRowSchema = zodOpenApi.object({
  supplier_id: zodOpenApi.number().int().openapi({ description: "Supplier ID" }),
  supplier_name: zodOpenApi.string().openapi({ description: "Supplier name" }),
  currency: zodOpenApi.string().openapi({ description: "Supplier currency code" }),
  total_open_amount: zodOpenApi.string().openapi({ description: "Total open in supplier currency" }),
  base_open_amount: zodOpenApi.string().openapi({ description: "Total open in base currency" }),
  exchange_rate_note: zodOpenApi.string().openapi({ description: "Exchange rate applied" }),
  buckets: AgingBucketsSchema,
});

const AgingDetailRowSchema = zodOpenApi.object({
  purchase_invoice_id: zodOpenApi.number().int().openapi({ description: "Invoice ID" }),
  pi_number: zodOpenApi.string().openapi({ description: "Invoice number" }),
  pi_date: zodOpenApi.string().openapi({ description: "Invoice date (YYYY-MM-DD)" }),
  due_date: zodOpenApi.string().openapi({ description: "Due date (YYYY-MM-DD)" }),
  payment_terms_days: zodOpenApi.number().int().openapi({ description: "Payment terms in days" }),
  currency: zodOpenApi.string().openapi({ description: "Invoice currency code" }),
  exchange_rate: zodOpenApi.string().openapi({ description: "Exchange rate applied" }),
  original_amount: zodOpenApi.string().openapi({ description: "Original invoice amount" }),
  balance: zodOpenApi.string().openapi({ description: "Remaining balance in invoice currency" }),
  base_balance: zodOpenApi.string().openapi({ description: "Remaining balance in base currency" }),
  bucket: zodOpenApi.string().openapi({ description: "Aging bucket name" }),
});

// ── Param / query helpers ────────────────────────────────────────────────────

const IdParam = zodOpenApi.object({
  id: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Record ID", example: "1" }),
});

const SupplierIdParam = zodOpenApi.object({
  supplierId: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Supplier ID", example: "1" }),
});

const SupplierIdAndContactIdParam = zodOpenApi.object({
  supplierId: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Supplier ID", example: "1" }),
  id: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Contact ID", example: "1" }),
});

const SupplierDetailIdParam = zodOpenApi.object({
  supplierId: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Supplier ID", example: "1" }),
});

type JsonResponseSpec = {
  description: string;
  content: { "application/json": { schema: zodOpenApi.ZodTypeAny } };
};

const standardResponses = (extra?: Record<number, JsonResponseSpec>): Record<number, JsonResponseSpec> => {
  const base: Record<number, JsonResponseSpec> = {
    400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
    401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
    403: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Forbidden" },
  };
  if (extra) Object.assign(base, extra);
  return base;
};

const _noop = (async (): Promise<Response> => {
  // No-op placeholder — spec-generation only, never invoked at runtime.
  return new Response(null, { status: 200 });
}) as never;

// ──────────────────────────────────────────────────────────────────────────────

export function registerPurchasingOpenApiRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {

  // ==========================================================================
  //  SUPPLIERS
  // ==========================================================================
  {
    // GET /purchasing/suppliers
    const route = createRoute({
      path: "/purchasing/suppliers",
      method: "get",
      tags: ["Purchasing"],
      summary: "List suppliers",
      security: [{ BearerAuth: [] }],
      request: { query: SupplierListQuerySchema.omit({ company_id: true }) },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("suppliers", "SupplierListResponse", SupplierResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/suppliers
    const route = createRoute({
      path: "/purchasing/suppliers",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create supplier",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: SupplierCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("SupplierDataResponse", SupplierResponseSchema) } }, description: "Created" },
        ...standardResponses({ 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/suppliers/{id}
    const route = createRoute({
      path: "/purchasing/suppliers/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get supplier by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("SupplierDataResponse", SupplierResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // PATCH /purchasing/suppliers/{id}
    const route = createRoute({
      path: "/purchasing/suppliers/{id}",
      method: "patch",
      tags: ["Purchasing"],
      summary: "Update supplier",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam, body: { content: { "application/json": { schema: SupplierUpdateSchema } } } },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("SupplierDataResponse", SupplierResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // DELETE /purchasing/suppliers/{id}
    const route = createRoute({
      path: "/purchasing/suppliers/{id}",
      method: "delete",
      tags: ["Purchasing"],
      summary: "Deactivate supplier",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true).openapi({ example: true }), data: zodOpenApi.object({ success: zodOpenApi.literal(true).openapi({ example: true }) }) }).openapi("SupplierDeleteResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  SUPPLIER CONTACTS
  // ==========================================================================
  {
    // GET /purchasing/suppliers/{supplierId}/contacts
    const route = createRoute({
      path: "/purchasing/suppliers/{supplierId}/contacts",
      method: "get",
      tags: ["Purchasing"],
      summary: "List supplier contacts",
      security: [{ BearerAuth: [] }],
      request: { params: SupplierIdParam },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: zodOpenApi.object({ contacts: zodOpenApi.array(SupplierContactResponseSchema) }) }).openapi("SupplierContactListResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/suppliers/{supplierId}/contacts
    const route = createRoute({
      path: "/purchasing/suppliers/{supplierId}/contacts",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create supplier contact",
      security: [{ BearerAuth: [] }],
      request: { params: SupplierIdParam, body: { content: { "application/json": { schema: SupplierContactCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: SupplierContactResponseSchema }).openapi("SupplierContactDataResponse") } }, description: "Created" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/suppliers/{supplierId}/contacts/{id}
    const route = createRoute({
      path: "/purchasing/suppliers/{supplierId}/contacts/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get supplier contact by ID",
      security: [{ BearerAuth: [] }],
      request: { params: SupplierIdAndContactIdParam },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: SupplierContactResponseSchema }).openapi("SupplierContactDataResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // PATCH /purchasing/suppliers/{supplierId}/contacts/{id}
    const route = createRoute({
      path: "/purchasing/suppliers/{supplierId}/contacts/{id}",
      method: "patch",
      tags: ["Purchasing"],
      summary: "Update supplier contact",
      security: [{ BearerAuth: [] }],
      request: { params: SupplierIdAndContactIdParam, body: { content: { "application/json": { schema: SupplierContactUpdateSchema } } } },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: SupplierContactResponseSchema }).openapi("SupplierContactDataResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // DELETE /purchasing/suppliers/{supplierId}/contacts/{id}
    const route = createRoute({
      path: "/purchasing/suppliers/{supplierId}/contacts/{id}",
      method: "delete",
      tags: ["Purchasing"],
      summary: "Delete supplier contact",
      security: [{ BearerAuth: [] }],
      request: { params: SupplierIdAndContactIdParam },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true).openapi({ example: true }), data: zodOpenApi.object({ success: zodOpenApi.literal(true).openapi({ example: true }) }) }).openapi("SupplierContactDeleteResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  PURCHASE ORDERS
  // ==========================================================================
  {
    // GET /purchasing/orders
    const route = createRoute({
      path: "/purchasing/orders",
      method: "get",
      tags: ["Purchasing"],
      summary: "List purchase orders",
      security: [{ BearerAuth: [] }],
      request: { query: PurchaseOrderListQuerySchema },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("orders", "PurchaseOrderListResponse", PurchaseOrderResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/orders
    const route = createRoute({
      path: "/purchasing/orders",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create purchase order",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: PurchaseOrderCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("PurchaseOrderDataResponse", PurchaseOrderResponseSchema) } }, description: "Created" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier/Item not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/orders/{id}
    const route = createRoute({
      path: "/purchasing/orders/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get purchase order by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseOrderDataResponse", PurchaseOrderResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // PATCH /purchasing/orders/{id}
    const route = createRoute({
      path: "/purchasing/orders/{id}",
      method: "patch",
      tags: ["Purchasing"],
      summary: "Update purchase order",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam, body: { content: { "application/json": { schema: PurchaseOrderUpdateSchema } } } },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseOrderDataResponse", PurchaseOrderResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // PATCH /purchasing/orders/{id}/status
    const route = createRoute({
      path: "/purchasing/orders/{id}/status",
      method: "patch",
      tags: ["Purchasing"],
      summary: "Transition purchase order status",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam, body: { content: { "application/json": { schema: POStatusTransitionSchema } } } },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseOrderDataResponse", PurchaseOrderResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  GOODS RECEIPTS
  // ==========================================================================
  {
    // GET /purchasing/receipts
    const route = createRoute({
      path: "/purchasing/receipts",
      method: "get",
      tags: ["Purchasing"],
      summary: "List goods receipts",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          supplier_id: zodOpenApi.string().optional().openapi({ description: "Filter by supplier ID" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from (YYYY-MM-DD)" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to (YYYY-MM-DD)" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Page size (max 100)" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset for pagination" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("receipts", "GoodsReceiptListResponse", GoodsReceiptResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/receipts
    const route = createRoute({
      path: "/purchasing/receipts",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create goods receipt",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: GoodsReceiptCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("GoodsReceiptDataResponse", GoodsReceiptResponseSchema) } }, description: "Created" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier/PO not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/receipts/{id}
    const route = createRoute({
      path: "/purchasing/receipts/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get goods receipt by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("GoodsReceiptDataResponse", GoodsReceiptResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  PURCHASE INVOICES
  // ==========================================================================
  {
    // GET /purchasing/invoices
    const route = createRoute({
      path: "/purchasing/invoices",
      method: "get",
      tags: ["Purchasing"],
      summary: "List purchase invoices",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          supplier_id: zodOpenApi.string().optional().openapi({ description: "Filter by supplier ID" }),
          status: zodOpenApi.string().optional().openapi({ description: "Filter by status" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from (YYYY-MM-DD)" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to (YYYY-MM-DD)" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Page size (max 100)" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset for pagination" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("invoices", "PurchaseInvoiceListResponse", PurchaseInvoiceResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/invoices
    const route = createRoute({
      path: "/purchasing/invoices",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create purchase invoice",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: PurchaseInvoiceCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("PurchaseInvoiceDataResponse", PurchaseInvoiceResponseSchema) } }, description: "Created" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed / Conflict" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/invoices/{id}
    const route = createRoute({
      path: "/purchasing/invoices/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get purchase invoice by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseInvoiceDataResponse", PurchaseInvoiceResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/invoices/{id}/post
    const route = createRoute({
      path: "/purchasing/invoices/{id}/post",
      method: "post",
      tags: ["Purchasing"],
      summary: "Post purchase invoice to GL",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseInvoiceDataResponse", PurchaseInvoiceResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Already posted / Period closed" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/invoices/{id}/void
    const route = createRoute({
      path: "/purchasing/invoices/{id}/void",
      method: "post",
      tags: ["Purchasing"],
      summary: "Void purchase invoice",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseInvoiceDataResponse", PurchaseInvoiceResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Already voided / Period closed" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  AP PAYMENTS
  // ==========================================================================
  {
    // GET /purchasing/payments
    const route = createRoute({
      path: "/purchasing/payments",
      method: "get",
      tags: ["Purchasing"],
      summary: "List AP payments",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          supplier_id: zodOpenApi.string().optional().openapi({ description: "Filter by supplier ID" }),
          status: zodOpenApi.string().optional().openapi({ description: "Filter by status" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from (YYYY-MM-DD)" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to (YYYY-MM-DD)" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Page size (max 100)" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset for pagination" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("payments", "ApPaymentListResponse", ApPaymentResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/payments
    const route = createRoute({
      path: "/purchasing/payments",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create AP payment",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: ApPaymentCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("ApPaymentDataResponse", ApPaymentResponseSchema) } }, description: "Created" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier/Invoice not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed / Overpayment" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/payments/{id}
    const route = createRoute({
      path: "/purchasing/payments/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get AP payment by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("ApPaymentDataResponse", ApPaymentResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/payments/{id}/post
    const route = createRoute({
      path: "/purchasing/payments/{id}/post",
      method: "post",
      tags: ["Purchasing"],
      summary: "Post AP payment to GL",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("ApPaymentDataResponse", ApPaymentResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed / Already posted" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/payments/{id}/void
    const route = createRoute({
      path: "/purchasing/payments/{id}/void",
      method: "post",
      tags: ["Purchasing"],
      summary: "Void AP payment",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("ApPaymentDataResponse", ApPaymentResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed / Already voided" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  PURCHASE CREDITS
  // ==========================================================================
  {
    // GET /purchasing/credits
    const route = createRoute({
      path: "/purchasing/credits",
      method: "get",
      tags: ["Purchasing"],
      summary: "List purchase credits",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          supplier_id: zodOpenApi.string().optional().openapi({ description: "Filter by supplier ID" }),
          status: zodOpenApi.string().optional().openapi({ description: "Filter by status" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from (YYYY-MM-DD)" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to (YYYY-MM-DD)" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Page size (max 100)" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset for pagination" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("credits", "PurchaseCreditListResponse", PurchaseCreditResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/credits
    const route = createRoute({
      path: "/purchasing/credits",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create purchase credit",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: PurchaseCreditCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("PurchaseCreditDataResponse", PurchaseCreditResponseSchema) } }, description: "Created" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier/Invoice not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/credits/{id}
    const route = createRoute({
      path: "/purchasing/credits/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get purchase credit by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseCreditDataResponse", PurchaseCreditResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/credits/{id}/apply
    const route = createRoute({
      path: "/purchasing/credits/{id}/apply",
      method: "post",
      tags: ["Purchasing"],
      summary: "Apply purchase credit",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseCreditDataResponse", PurchaseCreditResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed / Already applied" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/credits/{id}/void
    const route = createRoute({
      path: "/purchasing/credits/{id}/void",
      method: "post",
      tags: ["Purchasing"],
      summary: "Void purchase credit",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("PurchaseCreditDataResponse", PurchaseCreditResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }, 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Period closed / Already voided" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  EXCHANGE RATES  (lookup registered before :id)
  // ==========================================================================
  {
    // GET /purchasing/exchange-rates
    const route = createRoute({
      path: "/purchasing/exchange-rates",
      method: "get",
      tags: ["Purchasing"],
      summary: "List exchange rates",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          currency_code: zodOpenApi.string().optional().openapi({ description: "Filter by ISO 4217 currency code" }),
          is_active: zodOpenApi.string().optional().openapi({ description: "Filter active rates only (true/false)" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Page size (max 100)" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset for pagination" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: collectionResponseSchema("exchange_rates", "ExchangeRateListResponse", ExchangeRateResponseSchema) } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/exchange-rates/lookup  (registered BEFORE :id to avoid route collision)
    const route = createRoute({
      path: "/purchasing/exchange-rates/lookup",
      method: "get",
      tags: ["Purchasing"],
      summary: "Lookup exchange rate by currency and date",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          currency_code: zodOpenApi.string().openapi({ description: "ISO 4217 currency code", example: "USD" }),
          date: zodOpenApi.string().regex(/^\d{4}-\d{2}-\d{2}$/).openapi({ description: "Date in YYYY-MM-DD format", example: "2025-01-15" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: zodOpenApi.object({ currency_code: zodOpenApi.string(), rate: zodOpenApi.string(), effective_date: zodOpenApi.string(), source: zodOpenApi.string() }) }).openapi("ExchangeRateLookupResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Rate not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/exchange-rates/{id}
    const route = createRoute({
      path: "/purchasing/exchange-rates/{id}",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get exchange rate by ID",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("ExchangeRateDataResponse", ExchangeRateResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // POST /purchasing/exchange-rates
    const route = createRoute({
      path: "/purchasing/exchange-rates",
      method: "post",
      tags: ["Purchasing"],
      summary: "Create exchange rate",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: ExchangeRateCreateSchema } } } },
      responses: {
        201: { content: { "application/json": { schema: dataResponseSchema("ExchangeRateDataResponse", ExchangeRateResponseSchema) } }, description: "Created" },
        ...standardResponses({ 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Duplicate rate" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // PATCH /purchasing/exchange-rates/{id}
    const route = createRoute({
      path: "/purchasing/exchange-rates/{id}",
      method: "patch",
      tags: ["Purchasing"],
      summary: "Update exchange rate",
      security: [{ BearerAuth: [] }],
      request: { params: IdParam, body: { content: { "application/json": { schema: ExchangeRateUpdateSchema } } } },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("ExchangeRateDataResponse", ExchangeRateResponseSchema) } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" } }),
      },
    });
    app.openapi(route, _noop);
  }

  // ==========================================================================
  //  REPORTS
  // ==========================================================================
  {
    // GET /purchasing/reports/ap-aging
    const route = createRoute({
      path: "/purchasing/reports/ap-aging",
      method: "get",
      tags: ["Purchasing"],
      summary: "AP aging summary report",
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          as_of_date: zodOpenApi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ description: "Report date (YYYY-MM-DD), defaults to today" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true).openapi({ example: true }), data: zodOpenApi.object({ as_of_date: zodOpenApi.string().openapi({ description: "Report date (YYYY-MM-DD)" }), suppliers: zodOpenApi.array(AgingSupplierRowSchema).openapi({ description: "Supplier summaries with aging buckets" }), grand_totals: zodOpenApi.object({ base_open_amount: zodOpenApi.string().openapi({ description: "Grand total open in base currency" }), buckets: AgingBucketsSchema, currency_totals: zodOpenApi.array(AgingCurrencyTotalSchema).openapi({ description: "Totals per currency" }), }) }) }).openapi("APAgingSummaryResponse") } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/reports/ap-aging/{supplierId}/detail
    const route = createRoute({
      path: "/purchasing/reports/ap-aging/{supplierId}/detail",
      method: "get",
      tags: ["Purchasing"],
      summary: "AP aging supplier detail report",
      security: [{ BearerAuth: [] }],
      request: {
        params: SupplierDetailIdParam,
        query: zodOpenApi.object({
          as_of_date: zodOpenApi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ description: "Report date (YYYY-MM-DD)" }),
        }),
      },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true).openapi({ example: true }), data: zodOpenApi.object({ as_of_date: zodOpenApi.string().openapi({ description: "Report date (YYYY-MM-DD)" }), supplier_id: zodOpenApi.number().int().openapi({ description: "Supplier ID" }), supplier_name: zodOpenApi.string().openapi({ description: "Supplier name" }), currency: zodOpenApi.string().openapi({ description: "Supplier currency code" }), invoices: zodOpenApi.array(AgingDetailRowSchema).openapi({ description: "Open invoice details" }), totals: zodOpenApi.object({ total_open_amount: zodOpenApi.string().openapi({ description: "Total open in supplier currency" }), base_open_amount: zodOpenApi.string().openapi({ description: "Total open in base currency" }), buckets: AgingBucketsSchema, }) }) }).openapi("APAgingDetailResponse") } }, description: "OK" },
        ...standardResponses({ 404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Supplier not found" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/reports/ap-reconciliation/settings
    const route = createRoute({
      path: "/purchasing/reports/ap-reconciliation/settings",
      method: "get",
      tags: ["Purchasing"],
      summary: "Get AP reconciliation account settings",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: zodOpenApi.object({ account_ids: zodOpenApi.array(zodOpenApi.number()), source: zodOpenApi.string() }) }).openapi("APReconciliationSettingsGetResponse") } }, description: "OK" },
        ...standardResponses(),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // PUT /purchasing/reports/ap-reconciliation/settings
    const route = createRoute({
      path: "/purchasing/reports/ap-reconciliation/settings",
      method: "put",
      tags: ["Purchasing"],
      summary: "Save AP reconciliation account settings",
      security: [{ BearerAuth: [] }],
      request: { body: { content: { "application/json": { schema: APReconciliationSettingsUpdateSchema } } } },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: zodOpenApi.object({ account_ids: zodOpenApi.array(zodOpenApi.number()), source: zodOpenApi.string() }) }).openapi("APReconciliationSettingsPutResponse") } }, description: "OK" },
        ...standardResponses({ 403: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Cross-tenant account" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/reports/ap-reconciliation/summary
    const route = createRoute({
      path: "/purchasing/reports/ap-reconciliation/summary",
      method: "get",
      tags: ["Purchasing"],
      summary: "AP vs GL reconciliation summary",
      security: [{ BearerAuth: [] }],
      request: {
        query: APReconciliationSummaryQuerySchema,
      },
      responses: {
        200: { content: { "application/json": { schema: zodOpenApi.object({ success: zodOpenApi.literal(true), data: zodOpenApi.object({ as_of_date: zodOpenApi.string(), ap_subledger_balance: zodOpenApi.string(), gl_control_balance: zodOpenApi.string(), variance: zodOpenApi.string(), configured_account_ids: zodOpenApi.array(zodOpenApi.number()), account_source: zodOpenApi.string(), currency: zodOpenApi.string() }) }).openapi("APReconciliationSummaryResponse") } }, description: "OK" },
        ...standardResponses({ 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Settings not configured" } }),
      },
    });
    app.openapi(route, _noop);
  }
  {
    // GET /purchasing/reports/ap-reconciliation/drilldown
    const route = createRoute({
      path: "/purchasing/reports/ap-reconciliation/drilldown",
      method: "get",
      tags: ["Purchasing"],
      summary: "AP reconciliation drilldown",
      security: [{ BearerAuth: [] }],
      request: {
        query: APReconciliationDrilldownQuerySchema,
      },
      responses: {
        200: { content: { "application/json": { schema: dataResponseSchema("APReconciliationDrilldownResponse", APReconciliationDrilldownResponseSchema) } }, description: "OK" },
        ...standardResponses({ 409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Settings not configured" } }),
      },
    });
    app.openapi(route, _noop);
  }
}
