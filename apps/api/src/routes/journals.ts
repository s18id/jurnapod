// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal Routes
 *
 * Thin HTTP adapters that delegate to shared handlers in journal-handlers.ts.
 * All business logic (permission checks, service calls, error handling) is
 * centralized in the handler layer for reuse by both Hono and OpenAPI routes.
 *
 * Routes:
 * GET  /journals     - List journal entries
 * POST /journals     - Create manual journal draft
 * GET  /journals/:id - Get journal draft or posted journal
 * PATCH /journals/:id - Update journal draft
 * POST /journals/:id/post - Post journal draft
 */

import { Hono } from "hono";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { authenticateRequest } from "@/lib/auth-guard";
import { errorResponse, NumericIdSchema } from "@jurnapod/shared";
import {
  handleListJournals,
  handleCreateJournal,
  handleUpdateJournal,
  handlePostJournal,
  handleGetJournal,
  listQuerySchema
} from "@/lib/journal-handlers";
import type { AuthContext } from "@/lib/auth-guard";

const journalRoutes = new Hono();

function parseJournalIdParam(idParam: string): number | Response {
  const parsed = NumericIdSchema.safeParse(Number(idParam));
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", "Invalid journal ID", 400);
  }
  return parsed.data;
}

// ============================================================================
// Auth Middleware
// ============================================================================

journalRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    return errorResponse("UNAUTHORIZED", "Missing or invalid access token", 401);
  }
  c.set("auth", authResult.auth);
  await next();
});

// ============================================================================
// Hono Routes (Runtime - Used by app.ts)
// ============================================================================

/**
 * GET /journals - List journal entries with optional filtering
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

  const url = new URL(c.req.raw.url);
  const queryResult = listQuerySchema.safeParse({
    outlet_id: url.searchParams.get("outlet_id") ?? undefined,
    start_date: url.searchParams.get("start_date") ?? undefined,
    end_date: url.searchParams.get("end_date") ?? undefined,
    doc_type: url.searchParams.get("doc_type") ?? undefined,
    account_id: url.searchParams.get("account_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!queryResult.success) {
    return errorResponse("INVALID_REQUEST", "Invalid request query", 400);
  }

  return handleListJournals(auth, c.req.raw, queryResult.data);
});

/**
 * POST /journals - Create manual journal draft
 *
 * Creates a new journal draft with debit/credit lines that must balance.
 */
journalRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const body = await c.req.json();
  return handleCreateJournal(auth, c.req.raw, body);
});

journalRoutes.post("/:id/post", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const idParam = c.req.param("id");
  const journalId = parseJournalIdParam(idParam);
  if (journalId instanceof Response) {
    return journalId;
  }

  return handlePostJournal(auth, c.req.raw, journalId);
});

journalRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const idParam = c.req.param("id");
  const journalId = parseJournalIdParam(idParam);
  if (journalId instanceof Response) {
    return journalId;
  }
  const body = await c.req.json();

  return handleUpdateJournal(auth, c.req.raw, journalId, body);
});

/**
 * GET /journals/:id - Get journal draft or posted journal by ID
 */
journalRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const idParam = c.req.param("id");
  const batchId = parseJournalIdParam(idParam);
  if (batchId instanceof Response) {
    return batchId;
  }

  return handleGetJournal(auth, c.req.raw, batchId);
});

// ============================================================================
// OpenAPI Schemas (for spec generation)
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

const JournalEntryLineResponseSchema = JournalLineSchema.extend({
  id: zodOpenApi.number().int().positive().openapi({ description: "Line ID" }),
  journal_id: zodOpenApi.number().int().positive().openapi({ description: "Journal entry ID" }),
  journal_batch_id: zodOpenApi.number().int().positive().nullable().optional().openapi({ description: "Posted batch ID" }),
  journal_draft_id: zodOpenApi.number().int().positive().nullable().optional().openapi({ description: "Draft ID" }),
  company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  outlet_id: zodOpenApi.number().int().positive().nullable().openapi({ description: "Outlet ID" }),
  line_date: zodOpenApi.string().openapi({ description: "Line date" }),
  created_at: zodOpenApi.string().openapi({ description: "Created timestamp" }),
  updated_at: zodOpenApi.string().openapi({ description: "Updated timestamp" }),
}).openapi("JournalEntryLineResponse");

/**
 * Journal batch response schema
 */
const JournalBatchResponseSchema = zodOpenApi.object({
  id: zodOpenApi.number().int().positive().openapi({ description: "Batch ID" }),
  company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  outlet_id: zodOpenApi.number().int().positive().nullable().openapi({ description: "Outlet ID" }),
  status: zodOpenApi.enum(["POSTED"]).openapi({ description: "Journal status" }),
  reference: zodOpenApi.string().nullable().optional().openapi({ description: "Journal reference" }),
  total_debits: zodOpenApi.number().nonnegative().openapi({ description: "Total debit amount" }),
  total_credits: zodOpenApi.number().nonnegative().openapi({ description: "Total credit amount" }),
  doc_type: zodOpenApi.string().openapi({ description: "Document type" }),
  doc_id: zodOpenApi.number().int().positive().openapi({ description: "Document ID" }),
  client_ref: zodOpenApi.string().uuid().nullable().optional().openapi({ description: "Client idempotency reference" }),
  posted_at: zodOpenApi.string().openapi({ description: "Posted timestamp" }),
  created_at: zodOpenApi.string().openapi({ description: "Created timestamp" }),
  updated_at: zodOpenApi.string().openapi({ description: "Updated timestamp" }),
  lines: zodOpenApi.array(JournalEntryLineResponseSchema).openapi({ description: "Journal lines" }),
}).openapi("JournalBatchResponse");

const JournalDraftResponseSchema = zodOpenApi.object({
  id: zodOpenApi.number().int().positive().openapi({ description: "Draft ID" }),
  company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  outlet_id: zodOpenApi.number().int().positive().nullable().openapi({ description: "Outlet ID" }),
  status: zodOpenApi.enum(["DRAFT"]).openapi({ description: "Journal status" }),
  reference: zodOpenApi.string().nullable().openapi({ description: "Journal reference" }),
  description: zodOpenApi.string().openapi({ description: "Journal description" }),
  entry_date: zodOpenApi.string().openapi({ description: "Entry date" }),
  doc_type: zodOpenApi.enum(["MANUAL"]).openapi({ description: "Document type" }),
  doc_id: zodOpenApi.number().int().positive().openapi({ description: "Draft document ID" }),
  client_ref: zodOpenApi.string().uuid().nullable().optional().openapi({ description: "Client idempotency reference" }),
  posted_at: zodOpenApi.string().nullable().openapi({ description: "Posted timestamp" }),
  created_at: zodOpenApi.string().openapi({ description: "Created timestamp" }),
  updated_at: zodOpenApi.string().openapi({ description: "Updated timestamp" }),
  total_debits: zodOpenApi.number().nonnegative().openapi({ description: "Total debit amount" }),
  total_credits: zodOpenApi.number().nonnegative().openapi({ description: "Total credit amount" }),
  lines: zodOpenApi.array(JournalEntryLineResponseSchema).openapi({ description: "Journal lines" }),
}).openapi("JournalDraftResponse");

const JournalEntryResponseSchema = zodOpenApi.union([
  JournalDraftResponseSchema,
  JournalBatchResponseSchema,
]).openapi("JournalEntryResponse");

/**
 * Journal list response schema
 */
const JournalListResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(true).openapi({ example: true }),
  data: zodOpenApi.array(JournalEntryResponseSchema).openapi({ description: "Journal entries" }),
}).openapi("JournalListResponse");

const JournalDraftSuccessResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(true).openapi({ example: true }),
  data: JournalDraftResponseSchema,
}).openapi("JournalDraftSuccessResponse");

const JournalEntrySuccessResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(true).openapi({ example: true }),
  data: JournalEntryResponseSchema,
}).openapi("JournalEntrySuccessResponse");

/**
 * Manual journal entry request schema
 */
const ManualJournalEntryRequestSchema = zodOpenApi.object({
  company_id: zodOpenApi.number().int().positive().openapi({ description: "Company ID" }),
  outlet_id: zodOpenApi.number().int().positive().nullable().optional().openapi({ description: "Outlet ID" }),
  client_ref: zodOpenApi.string().uuid().optional().openapi({ description: "Client idempotency reference" }),
  entry_date: zodOpenApi.string().regex(/^\d{4}-\d{2}-\d{2}$/).openapi({ description: "Entry date (YYYY-MM-DD)" }),
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

// ============================================================================
// OpenAPI Route Registration (Used by openapi-aggregator.ts)
// ============================================================================

/**
 * Registers journal routes with an OpenAPIHono instance.
 * Uses the same shared handlers as the Hono routes above.
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

  app.openapi(listRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;

    const query = {
      outlet_id: c.req.query("outlet_id"),
      start_date: c.req.query("start_date"),
      end_date: c.req.query("end_date"),
      doc_type: c.req.query("doc_type"),
      account_id: c.req.query("account_id"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    };

    const queryResult = listQuerySchema.safeParse(query);
    if (!queryResult.success) {
      return errorResponse("INVALID_REQUEST", "Invalid request query", 400);
    }

    return handleListJournals(auth, c.req.raw, queryResult.data);
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
        content: { "application/json": { schema: JournalDraftSuccessResponseSchema } },
        description: "Journal draft created successfully",
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

  app.openapi(createJournalRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;
    const body = await c.req.json();
    return handleCreateJournal(auth, c.req.raw, body);
  }) as any);

  // PATCH /journals/:id - Update journal draft
  const updateJournalRoute = createRoute({
    path: "/journals/{id}",
    method: "patch",
    tags: ["Journals"],
    summary: "Update journal draft",
    description: "Update a journal draft. Posted journals are immutable.",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({ id: zodOpenApi.string().openapi({ description: "Journal draft ID" }) }),
      body: { content: { "application/json": { schema: ManualJournalEntryRequestSchema } } },
    },
    responses: {
      200: { content: { "application/json": { schema: JournalDraftSuccessResponseSchema } }, description: "Journal draft updated successfully" },
      400: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Invalid request body" },
      401: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Unauthorized" },
      403: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Forbidden" },
      404: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Journal draft not found" },
      409: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Journal conflict" },
    },
  });

  app.openapi(updateJournalRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;
    const journalId = parseJournalIdParam(c.req.param("id"));
    if (journalId instanceof Response) {
      return journalId;
    }
    const body = await c.req.json();
    return handleUpdateJournal(auth, c.req.raw, journalId, body);
  }) as any);

  // POST /journals/:id/post - Post journal draft
  const postJournalRoute = createRoute({
    path: "/journals/{id}/post",
    method: "post",
    tags: ["Journals"],
    summary: "Post journal draft",
    description: "Post a balanced journal draft into immutable journal batch and line records.",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({ id: zodOpenApi.string().openapi({ description: "Journal draft ID" }) }),
    },
    responses: {
      200: { content: { "application/json": { schema: JournalEntrySuccessResponseSchema } }, description: "Journal draft posted successfully" },
      400: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Invalid request or fiscal year closed" },
      401: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Unauthorized" },
      403: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Forbidden" },
      404: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Journal draft not found" },
      409: { content: { "application/json": { schema: JournalErrorResponseSchema } }, description: "Journal conflict" },
    },
  });

  app.openapi(postJournalRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;
    const journalId = parseJournalIdParam(c.req.param("id"));
    if (journalId instanceof Response) {
      return journalId;
    }
    return handlePostJournal(auth, c.req.raw, journalId);
  }) as any);

  // GET /journals/:id - Get single journal entry
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
        content: { "application/json": { schema: JournalEntrySuccessResponseSchema } },
        description: "Journal entry retrieved successfully",
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

  app.openapi(getRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;
    const batchId = parseJournalIdParam(c.req.param("id"));
    if (batchId instanceof Response) {
      return batchId;
    }
    return handleGetJournal(auth, c.req.raw, batchId);
  }) as any);
}

export { journalRoutes };
