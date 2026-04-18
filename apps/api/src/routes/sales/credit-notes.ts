// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Credit Note Routes
 *
 * Routes for sales credit note operations.
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  NumericIdSchema,
  SalesCreditNoteCreateRequestSchema,
  SalesCreditNoteUpdateRequestSchema,
  SalesCreditNoteResponseSchema
} from "@jurnapod/shared";
import {
  createCreditNote,
  getCreditNote,
  listCreditNotes,
  updateCreditNote,
  postCreditNote,
  voidCreditNote,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@/lib/credit-notes";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/response";
import { requireAccess } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { ApiCustomerRepository } from "@/lib/modules-platform/platform-db";
import type { AuthContext } from "@/lib/auth-guard";
import type { KyselySchema } from "@jurnapod/db";

const creditNoteRoutes = new Hono();

// ============================================================================
// GET /sales/credit-notes - List credit notes
// ============================================================================

creditNoteRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    const status = url.searchParams.get("status") || undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : undefined;

    let outletIds: number[];
    if (outletIdParam) {
      const outletId = NumericIdSchema.parse(outletIdParam);
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [outletId];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const creditNotes = await listCreditNotes(auth.companyId, {
      outletIds,
      status: status as "DRAFT" | "POSTED" | "VOID" | undefined,
      limit,
      offset
    });

    return successResponse(creditNotes);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("GET /sales/credit-notes failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit notes request failed", 500);
  }
});

// ============================================================================
// GET /sales/credit-notes/:id - Get credit note by ID
// ============================================================================

creditNoteRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));
    const creditNote = await getCreditNote(auth.companyId, creditNoteId);

    if (!creditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, creditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return successResponse(creditNote);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
    }

    console.error("GET /sales/credit-notes/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note request failed", 500);
  }
});

// ============================================================================
// POST /sales/credit-notes - Create credit note
// ============================================================================

creditNoteRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesCreditNoteCreateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Validate customer_id if provided - ACL check for platform.customers.READ + same-company
    if (input.customer_id != null) {
      const customerAccessResult = await requireAccess({
        module: "platform",
        resource: "customers",
        permission: "read"
      })(c.req.raw, auth);
      if (customerAccessResult !== null) {
        return customerAccessResult;
      }

      const db = getDb() as KyselySchema;
      const customerRepo = new ApiCustomerRepository(db);
      const customer = await customerRepo.findById(auth.companyId, input.customer_id);
      if (!customer) {
        return errorResponse("NOT_FOUND", "Customer not found", 404);
      }
    }

    const creditNote = await createCreditNote(auth.companyId, {
      outlet_id: input.outlet_id,
      invoice_id: input.invoice_id,
      credit_note_date: input.credit_note_date,
      client_ref: input.client_ref,
      reason: input.reason,
      notes: input.notes,
      amount: input.amount,
      customer_id: input.customer_id,
      lines: input.lines
    }, { userId: auth.userId });

    return successResponse(creditNote, 201);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("POST /sales/credit-notes failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note creation failed", 500);
  }
});

// ============================================================================
// PATCH /sales/credit-notes/:id - Update credit note
// ============================================================================

creditNoteRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesCreditNoteUpdateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Check credit note exists and user has outlet access
    const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
    if (!existingCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Guard any customer_id mutation (assign, clear) with platform.customers.READ.
    // If customer_id is explicitly null (clearing), skip the existence check — only enforce permission.
    if (input.customer_id !== undefined) {
      const customerAccessResult = await requireAccess({
        module: "platform",
        resource: "customers",
        permission: "read"
      })(c.req.raw, auth);
      if (customerAccessResult !== null) {
        return customerAccessResult;
      }

      if (input.customer_id !== null) {
        const db = getDb() as KyselySchema;
        const customerRepo = new ApiCustomerRepository(db);
        const customer = await customerRepo.findById(auth.companyId, input.customer_id);
        if (!customer) {
          return errorResponse("NOT_FOUND", "Customer not found", 404);
        }
      }
    }

    const updatedCreditNote = await updateCreditNote(auth.companyId, creditNoteId, {
      credit_note_date: input.credit_note_date,
      reason: input.reason,
      notes: input.notes,
      amount: input.amount,
      customer_id: input.customer_id,
      lines: input.lines
    }, { userId: auth.userId });

    if (!updatedCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    return successResponse(updatedCreditNote);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("PATCH /sales/credit-notes/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note update failed", 500);
  }
});

// ============================================================================
// POST /sales/credit-notes/:id/post - Post credit note
// ============================================================================

creditNoteRoutes.post("/:id/post", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

    // Check credit note exists and user has outlet access
    const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
    if (!existingCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const postedCreditNote = await postCreditNote(auth.companyId, creditNoteId, {
      userId: auth.userId
    });

    if (!postedCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    return successResponse(postedCreditNote);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
    }

    console.error("POST /sales/credit-notes/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note posting failed", 500);
  }
});

// ============================================================================
// POST /sales/credit-notes/:id/void - Void credit note
// ============================================================================

creditNoteRoutes.post("/:id/void", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

    // Check credit note exists and user has outlet access
    const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
    if (!existingCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const voidedCreditNote = await voidCreditNote(auth.companyId, creditNoteId, {
      userId: auth.userId
    });

    if (!voidedCreditNote) {
      return errorResponse("NOT_FOUND", "Credit note not found", 404);
    }

    return successResponse(voidedCreditNote);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
    }

    console.error("POST /sales/credit-notes/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Credit note void failed", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Credit note list response schema
 */
const CreditNoteListDataSchema = zodOpenApi.object({
  total: zodOpenApi.number().openapi({ description: "Total number of credit notes" }),
  creditNotes: zodOpenApi.array(SalesCreditNoteResponseSchema).openapi({ description: "List of credit notes" }),
});

const CreditNoteListResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: CreditNoteListDataSchema,
  })
  .openapi("CreditNoteListResponse");

/**
 * Credit note error response schema
 */
const CreditNoteErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Human-readable error message" }),
      })
      .openapi("CreditNoteErrorDetail"),
  })
  .openapi("CreditNoteErrorResponse");

/**
 * Registers sales credit note routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the credit note endpoints.
 */
export function registerSalesCreditNoteRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /sales/credit-notes - List credit notes
  const listCreditNotesRoute = createRoute({
    path: "/sales/credit-notes",
    method: "get",
    tags: ["Sales"],
    summary: "List credit notes",
    description: "List credit notes with optional filtering by outlet and status",
    security: [{ BearerAuth: [] }],
    request: {
      query: zodOpenApi.object({
        outlet_id: zodOpenApi.string().optional().openapi({ description: "Filter by outlet ID" }),
        status: zodOpenApi.string().optional().openapi({ description: "Filter by status (DRAFT, POSTED, VOID)" }),
        limit: zodOpenApi.string().optional().openapi({ description: "Limit results" }),
        offset: zodOpenApi.string().optional().openapi({ description: "Offset for pagination" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: CreditNoteListResponseSchema } },
        description: "Credit notes retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Forbidden",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listCreditNotesRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const url = new URL(c.req.raw.url);
      const outletIdParam = url.searchParams.get("outlet_id");
      const status = url.searchParams.get("status") || undefined;
      const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined;
      const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : undefined;

      let outletIds: number[];
      if (outletIdParam) {
        const outletId = NumericIdSchema.parse(outletIdParam);
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
        if (!hasAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
        outletIds = [outletId];
      } else {
        outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      }

      const creditNotes = await listCreditNotes(auth.companyId, {
        outletIds,
        status: status as "DRAFT" | "POSTED" | "VOID" | undefined,
        limit,
        offset
      });

      return successResponse(creditNotes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/credit-notes failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit notes request failed", 500);
    }
  }) as any);

  // GET /sales/credit-notes/:id - Get credit note by ID
  const getCreditNoteRoute = createRoute({
    path: "/sales/credit-notes/{id}",
    method: "get",
    tags: ["Sales"],
    summary: "Get credit note by ID",
    description: "Get a single credit note by its ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Credit note ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesCreditNoteResponseSchema } },
        description: "Credit note retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Invalid credit note ID",
      },
      401: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Credit note not found",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getCreditNoteRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const creditNoteId = NumericIdSchema.parse(c.req.param("id"));
      const creditNote = await getCreditNote(auth.companyId, creditNoteId);

      if (!creditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, creditNote.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      return successResponse(creditNote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
      }

      console.error("GET /sales/credit-notes/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note request failed", 500);
    }
  }) as any);

  // POST /sales/credit-notes - Create credit note
  const createCreditNoteRoute = createRoute({
    path: "/sales/credit-notes",
    method: "post",
    tags: ["Sales"],
    summary: "Create credit note",
    description: "Create a new sales credit note",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SalesCreditNoteCreateRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: SalesCreditNoteResponseSchema } },
        description: "Credit note created successfully",
      },
      400: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Resource not found",
      },
      409: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Conflict",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createCreditNoteRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      let input;
      try {
        input = SalesCreditNoteCreateRequestSchema.parse(payload);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
        }
        throw error;
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      // Validate customer_id if provided - ACL check for platform.customers.READ + same-company
      if (input.customer_id != null) {
        const customerAccessResult = await requireAccess({
          module: "platform",
          resource: "customers",
          permission: "read"
        })(c.req.raw, auth);
        if (customerAccessResult !== null) {
          return customerAccessResult;
        }

        const db = getDb() as KyselySchema;
        const customerRepo = new ApiCustomerRepository(db);
        const customer = await customerRepo.findById(auth.companyId, input.customer_id);
        if (!customer) {
          return errorResponse("NOT_FOUND", "Customer not found", 404);
        }
      }

      const creditNote = await createCreditNote(auth.companyId, {
        outlet_id: input.outlet_id,
        invoice_id: input.invoice_id,
        credit_note_date: input.credit_note_date,
        client_ref: input.client_ref,
        reason: input.reason,
        notes: input.notes,
        amount: input.amount,
        customer_id: input.customer_id,
        lines: input.lines
      }, { userId: auth.userId });

      return successResponse(creditNote, 201);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("POST /sales/credit-notes failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note creation failed", 500);
    }
  }) as any);

  // PATCH /sales/credit-notes/:id - Update credit note
  const updateCreditNoteRoute = createRoute({
    path: "/sales/credit-notes/{id}",
    method: "patch",
    tags: ["Sales"],
    summary: "Update credit note",
    description: "Update an existing sales credit note",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Credit note ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: SalesCreditNoteUpdateRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesCreditNoteResponseSchema } },
        description: "Credit note updated successfully",
      },
      400: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Credit note not found",
      },
      409: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Conflict",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(updateCreditNoteRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      let input;
      try {
        input = SalesCreditNoteUpdateRequestSchema.parse(payload);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
        }
        throw error;
      }

      const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
      if (!existingCreditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      // Guard any customer_id mutation (assign, clear) with platform.customers.READ.
      // If customer_id is explicitly null (clearing), skip the existence check — only enforce permission.
      if (input.customer_id !== undefined) {
        const customerAccessResult = await requireAccess({
          module: "platform",
          resource: "customers",
          permission: "read"
        })(c.req.raw, auth);
        if (customerAccessResult !== null) {
          return customerAccessResult;
        }

        if (input.customer_id !== null) {
          const db = getDb() as KyselySchema;
          const customerRepo = new ApiCustomerRepository(db);
          const customer = await customerRepo.findById(auth.companyId, input.customer_id);
          if (!customer) {
            return errorResponse("NOT_FOUND", "Customer not found", 404);
          }
        }
      }

      const updatedCreditNote = await updateCreditNote(auth.companyId, creditNoteId, {
        credit_note_date: input.credit_note_date,
        reason: input.reason,
        notes: input.notes,
        amount: input.amount,
        customer_id: input.customer_id,
        lines: input.lines
      }, { userId: auth.userId });

      if (!updatedCreditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      return successResponse(updatedCreditNote);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PATCH /sales/credit-notes/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note update failed", 500);
    }
  }) as any);


  // POST /sales/credit-notes/:id/post - Post credit note
  const postCreditNoteRoute = createRoute({
    path: "/sales/credit-notes/{id}/post",
    method: "post",
    tags: ["Sales"],
    summary: "Post credit note",
    description: "Post a draft credit note to the general ledger",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Credit note ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesCreditNoteResponseSchema } },
        description: "Credit note posted successfully",
      },
      400: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Invalid credit note ID",
      },
      401: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Credit note not found",
      },
      409: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Conflict",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(postCreditNoteRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

      const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
      if (!existingCreditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const postedCreditNote = await postCreditNote(auth.companyId, creditNoteId, {
        userId: auth.userId
      });

      if (!postedCreditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      return successResponse(postedCreditNote);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
      }

      console.error("POST /sales/credit-notes/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note posting failed", 500);
    }
  }) as any);

  // POST /sales/credit-notes/:id/void - Void credit note
  const voidCreditNoteRoute = createRoute({
    path: "/sales/credit-notes/{id}/void",
    method: "post",
    tags: ["Sales"],
    summary: "Void credit note",
    description: "Void a posted credit note",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Credit note ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesCreditNoteResponseSchema } },
        description: "Credit note voided successfully",
      },
      400: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Invalid credit note ID",
      },
      401: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Credit note not found",
      },
      409: {
        content: { "application/json": { schema: CreditNoteErrorResponseSchema } },
        description: "Conflict",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(voidCreditNoteRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const creditNoteId = NumericIdSchema.parse(c.req.param("id"));

      const existingCreditNote = await getCreditNote(auth.companyId, creditNoteId);
      if (!existingCreditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingCreditNote.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const voidedCreditNote = await voidCreditNote(auth.companyId, creditNoteId, {
        userId: auth.userId
      });

      if (!voidedCreditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      return successResponse(voidedCreditNote);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
      }

      console.error("POST /sales/credit-notes/:id/void failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note void failed", 500);
    }
  }) as any);
}

export { creditNoteRoutes };
