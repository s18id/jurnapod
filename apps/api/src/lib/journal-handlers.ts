// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal Request Handlers
 *
 * Pure handler functions that orchestrate:
 * 1. Permission checks via requireAccess
 * 2. Input validation
 * 3. Service calls
 * 4. Response formatting
 *
 * These handlers work with both Hono and OpenAPI contexts.
 * Shared by both runtime routes and OpenAPI spec generation.
 */

import { z } from "zod";
import { requireAccess } from "./auth-guard";
import { errorResponse, successResponse } from "./response";
import {
  createManualJournalEntry,
  listJournalBatches,
  getJournalBatch,
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError
} from "./journals";
import type { AuthContext } from "./auth-guard";
import { normalizeJournalDocType, type ManualJournalEntryCreateRequest } from "@jurnapod/shared";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query schema for list journals endpoint
 */
export const listQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doc_type: z.string().optional(),
  account_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Input type for list journals query
 */
export type ListJournalsInput = z.infer<typeof listQuerySchema>;

// ============================================================================
// Handlers
// ============================================================================

/**
 * List journal entries with filtering
 *
 * Shared handler for GET /journals - used by both Hono routes and OpenAPI.
 */
export async function handleListJournals(
  auth: AuthContext,
  rawRequest: Request,
  query: ListJournalsInput
): Promise<Response> {
  // Permission check - read permission for listing
  const accessResult = await requireAccess({
    module: "accounting",
    resource: "journals",
    permission: "read"
  })(rawRequest, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const listQuery = {
      company_id: auth.companyId,
      outlet_id: query.outlet_id,
      start_date: query.start_date,
      end_date: query.end_date,
      doc_type: normalizeJournalDocType(query.doc_type),
      account_id: query.account_id,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    };

    const batches = await listJournalBatches(listQuery);
    return successResponse(batches);
  } catch (error) {
    console.error("handleListJournals failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list journals", 500);
  }
}

/**
 * Create manual journal entry
 *
 * Shared handler for POST /journals - used by both Hono routes and OpenAPI.
 */
export async function handleCreateJournal(
  auth: AuthContext,
  rawRequest: Request,
  input: ManualJournalEntryCreateRequest
): Promise<Response> {
  // Permission check - create permission for POST
  const accessResult = await requireAccess({
    module: "accounting",
    resource: "journals",
    permission: "create"
  })(rawRequest, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  // Company scoping check - ensure user can only create journals for their company
  if (input.company_id !== auth.companyId) {
    return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
  }

  try {
    const batch = await createManualJournalEntry(input, auth.userId);
    return successResponse(batch, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
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

    console.error("handleCreateJournal failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create journal entry", 500);
  }
}

/**
 * Get single journal batch by ID
 *
 * Shared handler for GET /journals/:id - used by both Hono routes and OpenAPI.
 */
export async function handleGetJournal(
  auth: AuthContext,
  rawRequest: Request,
  batchId: number
): Promise<Response> {
  // Permission check - read permission for getting single batch
  const accessResult = await requireAccess({
    module: "accounting",
    resource: "journals",
    permission: "read"
  })(rawRequest, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const batch = await getJournalBatch(batchId, auth.companyId);
    return successResponse(batch);
  } catch (error) {
    if (error instanceof JournalNotFoundError) {
      return errorResponse("NOT_FOUND", "Journal batch not found", 404);
    }
    console.error("handleGetJournal failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get journal batch", 500);
  }
}
