// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal Routes
 *
 * Routes for journal management:
 * GET /journals - List journal entries
 * POST /journals - Create manual journal entry
 * GET /journals/:id - Get single journal batch
 */

import { Hono } from "hono";
import { z } from "zod";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { authenticateRequest, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  createManualJournalEntry,
  listJournalBatches,
  getJournalBatch,
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError
} from "@/lib/journals";
import { ManualJournalEntryCreateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import type { AuthContext } from "@/lib/auth-guard";

const journalRoutes = new Hono();

// Auth middleware
journalRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    return errorResponse("UNAUTHORIZED", "Missing or invalid access token", 401);
  }
  c.set("auth", authResult.auth);
  await next();
});

// Query schema for list endpoint
const listQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doc_type: z.string().optional(),
  account_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// OpenAPI Schemas
// ============================================================================

/**
 * Journal line schema for OpenAPI documentation
 */
const JournalLineSchema = zodOpenApi.object({
  account_id: zodOpenApi.number().int().positive().openapi({ description: "Account ID" }),
  debit: zodOpenApi.number().nonnegative().default(0).openapi({ description: "Debit amount" }),
  credit: zodOpenApi.number().nonnegative().default(0).openapi({ description: "Credit amount" }),
  description: zodOpenApi.string().max(255).openapi({ description: "Line description" }),
}).openapi("JournalLine");

/**
 * Journal batch response schema
 */
const JournalBatchResponseSchema = zodOpenApi.object({
  id: zodOpenApi.number().int().positive().openapi({ description: "Batch ID" }),
  company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  outlet_id: zodOpenApi.number().int().positive().nullable().openapi({ description: "Outlet ID" }),
  doc_type: zodOpenApi.string().openapi({ description: "Document type" }),
  doc_id: zodOpenApi.number().int().positive().openapi({ description: "Document ID" }),
  posted_at: zodOpenApi.string().openapi({ description: "Posted timestamp" }),
  created_at: zodOpenApi.string().openapi({ description: "Created timestamp" }),
  lines: zodOpenApi.array(JournalLineSchema).openapi({ description: "Journal lines" }),
}).openapi("JournalBatchResponse");

/**
 * Journal list response schema
 */
const JournalListResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(true).openapi({ example: true }),
  data: zodOpenApi.array(JournalBatchResponseSchema).openapi({ description: "Journal batches" }),
}).openapi("JournalListResponse");

/**
 * Manual journal entry request schema
 */
const ManualJournalEntryRequestSchema = zodOpenApi.object({
  company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  outlet_id: zodOpenApi.number().int().positive().nullable().optional().openapi({ description: "Outlet ID" }),
  entry_date: zodOpenApi.string().openapi({ description: "Entry date (ISO)" }),
  reference: zodOpenApi.string().max(100).optional().openapi({ description: "Reference" }),
  description: zodOpenApi.string().max(500).openapi({ description: "Entry description" }),
  lines: zodOpenApi.array(JournalLineSchema).min(2).openapi({ description: "Journal lines (must balance)" }),
}).openapi("ManualJournalEntryRequest");

/**
 * Journal error response schema
 */
const JournalErrorResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(false).openapi({ example: false }),
  error: zodOpenApi.object({
    code: zodOpenApi.string().openapi({ description: "Error code" }),
    message: zodOpenApi.string().openapi({ description: "Error message" }),
  }).openapi("JournalErrorDetail"),
}).openapi("JournalErrorResponse");

/**
 * GET /journals
 * List journal entries with optional filtering
 *
 * Query params:
 * - outlet_id (optional): Outlet ID filter
 * - start_date (optional): Start date (YYYY-MM-DD)
 * - end_date (optional): End date (YYYY-MM-DD)
 * - doc_type (optional): Document type filter
 * - account_id (optional): Account ID filter
 * - limit (optional): Results limit (default 100, max 1000)
 * - offset (optional): Results offset (default 0)
 */
journalRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

    try {
    // Check module permission using bitmask
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "journals",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const body = await c.req.json();
    const input = ManualJournalEntryCreateRequestSchema.parse(body);

    // Verify company_id matches authenticated user
    if (input.company_id !== auth.companyId) {
      return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
    }

    const batch = await createManualJournalEntry(input, auth.userId);

    return successResponse(batch, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof JournalNotBalancedError) {
      return errorResponse("NOT_BALANCED", "Journal entry debits and credits must balance", 400);
    }

    if (error instanceof InvalidJournalLineError) {
      return errorResponse("INVALID_LINE", error.message, 400);
    }

    if (error instanceof Error && error.name === "JournalOutsideFiscalYearError") {
      return errorResponse("FISCAL_YEAR_CLOSED", "Entry date is outside any open fiscal year", 400);
    }

    console.error("POST /journals failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create journal entry", 500);
  }
});

/**
 * GET /journals/:id
 * Get single journal batch by ID
 */
journalRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    // Check module permission using bitmask
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "journals",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const idParam = c.req.param("id");
    const batchId = NumericIdSchema.parse(Number(idParam));

    const batch = await getJournalBatch(batchId, auth.companyId);

    return successResponse(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_ID", "Invalid batch ID", 400);
    }

    if (error instanceof JournalNotFoundError) {
      return errorResponse("NOT_FOUND", "Journal batch not found", 404);
    }

    console.error("GET /journals/:id failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get journal batch", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Registers journal routes with an OpenAPIHono instance.
 */
export function registerJournalRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /journals - List journal entries
  const listRoute = createRoute({
    path: "/journals",
    method: "get",
    tags: ["Journals"],
    summary: "List journal entries",
    description: "List journal batches with optional filtering by outlet, date range, doc type, or account",
    security: [{ BearerAuth: [] }],
    request: {
      query: zodOpenApi.object({
        outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID filter" }),
        start_date: zodOpenApi.string().optional().openapi({ description: "Start date (YYYY-MM-DD)" }),
        end_date: zodOpenApi.string().optional().openapi({ description: "End date (YYYY-MM-DD)" }),
        doc_type: zodOpenApi.string().optional().openapi({ description: "Document type filter" }),
        account_id: zodOpenApi.string().optional().openapi({ description: "Account ID filter" }),
        limit: zodOpenApi.string().optional().openapi({ description: "Results limit (max 1000)" }),
        offset: zodOpenApi.string().optional().openapi({ description: "Results offset" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: JournalListResponseSchema } },
        description: "Journal batches retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Invalid request parameters",
      },
      401: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Unauthorized",
      },
      500: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;

    try {
      const accessResult = await requireAccess({
        module: "accounting",
        resource: "journals",
        permission: "read"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const url = new URL(c.req.raw.url);
      const query = listQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        start_date: url.searchParams.get("start_date") ?? undefined,
        end_date: url.searchParams.get("end_date") ?? undefined,
        doc_type: url.searchParams.get("doc_type") ?? undefined,
        account_id: url.searchParams.get("account_id") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined,
      });

      const listQuery = {
        company_id: auth.companyId,
        outlet_id: query.outlet_id,
        start_date: query.start_date,
        end_date: query.end_date,
        doc_type: query.doc_type,
        account_id: query.account_id,
        limit: query.limit ?? 100,
        offset: query.offset ?? 0,
      };

      const batches = await listJournalBatches(listQuery);
      return successResponse(batches);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters: " + error.errors.map(e => e.message).join(", "), 400);
      }
      console.error("GET /journals failed:", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list journals", 500);
    }
  }) as any);

  // POST /journals - Create manual journal entry
  const createJournalRoute = createRoute({
    path: "/journals",
    method: "post",
    tags: ["Journals"],
    summary: "Create manual journal entry",
    description: "Create a manual journal entry. Debits must equal credits.",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: ManualJournalEntryRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: JournalBatchResponseSchema } },
        description: "Journal entry created successfully",
      },
      400: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Invalid request body or unbalanced entry",
      },
      401: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Unauthorized",
      },
      409: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Journal not balanced",
      },
      500: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createJournalRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;

    try {
      const accessResult = await requireAccess({
        module: "accounting",
        resource: "journals",
        permission: "create"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const body = await c.req.json();
      const input = ManualJournalEntryCreateRequestSchema.parse(body);

      if (input.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const batch = await createManualJournalEntry(input, auth.userId);
      return successResponse(batch, 201);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof JournalNotBalancedError) {
        return errorResponse("NOT_BALANCED", "Journal entry debits and credits must balance", 400);
      }

      if (error instanceof InvalidJournalLineError) {
        return errorResponse("INVALID_LINE", error.message, 400);
      }

      if (error instanceof Error && error.name === "JournalOutsideFiscalYearError") {
        return errorResponse("FISCAL_YEAR_CLOSED", "Entry date is outside any open fiscal year", 400);
      }

      console.error("POST /journals failed:", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create journal entry", 500);
    }
  }) as any);

  // GET /journals/:id - Get single journal batch
  const getRoute = createRoute({
    path: "/journals/{id}",
    method: "get",
    tags: ["Journals"],
    summary: "Get journal batch",
    description: "Get a single journal batch by ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Journal batch ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: JournalBatchResponseSchema } },
        description: "Journal batch retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Invalid batch ID",
      },
      401: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Unauthorized",
      },
      404: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Journal batch not found",
      },
      500: {
        content: { "application/json": { schema: JournalErrorResponseSchema } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;

    try {
      const accessResult = await requireAccess({
        module: "accounting",
        resource: "journals",
        permission: "read"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const idParam = c.req.param("id");
      const batchId = NumericIdSchema.parse(Number(idParam));
      const batch = await getJournalBatch(batchId, auth.companyId);
      return successResponse(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_ID", "Invalid batch ID", 400);
      }

      if (error instanceof JournalNotFoundError) {
        return errorResponse("NOT_FOUND", "Journal batch not found", 404);
      }

      console.error("GET /journals/:id failed:", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get journal batch", 500);
    }
  }) as any);
}

export { journalRoutes };
