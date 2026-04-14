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
 * POST /journals     - Create manual journal entry
 * GET  /journals/:id - Get single journal batch
 */

import { Hono } from "hono";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { authenticateRequest } from "@/lib/auth-guard";
import { errorResponse } from "@/lib/response";
import {
  handleListJournals,
  handleCreateJournal,
  handleGetJournal,
  listQuerySchema
} from "@/lib/journal-handlers";
import { NumericIdSchema } from "@jurnapod/shared";
import type { AuthContext } from "@/lib/auth-guard";

const journalRoutes = new Hono();

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
  const query = listQuerySchema.parse({
    outlet_id: url.searchParams.get("outlet_id") ?? undefined,
    start_date: url.searchParams.get("start_date") ?? undefined,
    end_date: url.searchParams.get("end_date") ?? undefined,
    doc_type: url.searchParams.get("doc_type") ?? undefined,
    account_id: url.searchParams.get("account_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  return handleListJournals(auth, c.req.raw, query);
});

/**
 * POST /journals - Create manual journal entry
 *
 * Creates a new journal batch with debit/credit lines that must balance.
 */
journalRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const body = await c.req.json();
  const input = body;

  return handleCreateJournal(auth, c.req.raw, input);
});

/**
 * GET /journals/:id - Get single journal batch by ID
 */
journalRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const idParam = c.req.param("id");
  const batchId = NumericIdSchema.parse(Number(idParam));

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

    return handleListJournals(auth, c.req.raw, query);
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

  app.openapi(createJournalRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;
    const body = await c.req.json();
    return handleCreateJournal(auth, c.req.raw, body);
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

  app.openapi(getRoute, (async (c: any) => {
    const auth = c.get("auth") as AuthContext;
    const batchId = NumericIdSchema.parse(Number(c.req.param("id")));
    return handleGetJournal(auth, c.req.raw, batchId);
  }) as any);
}

export { journalRoutes };
