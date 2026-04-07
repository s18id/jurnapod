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
      module: "journals",
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

    // Build query for listJournalBatches
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
});

/**
 * POST /journals
 * Create a manual journal entry
 *
 * Body: ManualJournalEntryCreateRequest
 * {
 *   company_id: number,
 *   outlet_id?: number | null,
 *   entry_date: string (ISO date),
 *   reference?: string,
 *   description: string,
 *   lines: [
 *     {
 *       account_id: number,
 *       debit: number,
 *       credit: number,
 *       description: string
 *     }
 *   ]
 * }
 */
journalRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    // Check module permission using bitmask
    const accessResult = await requireAccess({
      module: "journals",
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
      module: "journals",
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

export { journalRoutes };
