// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ManualJournalEntryCreateRequestSchema, JournalListQuerySchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../src/lib/response";
import {
  createManualJournalEntry,
  listJournalBatches,
  JournalNotBalancedError,
  InvalidJournalLineError
} from "../../../src/lib/journals";

/**
 * GET /api/journals
 * List journal entries with optional filtering
 * 
 * Query params:
 * - company_id (required): Company ID
 * - outlet_id (optional): Outlet ID
 * - start_date (optional): Start date (YYYY-MM-DD)
 * - end_date (optional): End date (YYYY-MM-DD)
 * - doc_type (optional): Document type filter
 * - account_id (optional): Account ID filter
 * - limit (optional): Results limit (default 100, max 1000)
 * - offset (optional): Results offset (default 0)
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      
      const query = JournalListQuerySchema.parse({
        company_id: parseInt(url.searchParams.get("company_id") || String(auth.companyId)),
        outlet_id: url.searchParams.get("outlet_id") ? parseInt(url.searchParams.get("outlet_id")!) : undefined,
        start_date: url.searchParams.get("start_date") || undefined,
        end_date: url.searchParams.get("end_date") || undefined,
        doc_type: url.searchParams.get("doc_type") || undefined,
        account_id: url.searchParams.get("account_id") ? parseInt(url.searchParams.get("account_id")!) : undefined,
        limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : 100,
        offset: url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!) : 0
      });

      // Verify company_id matches authenticated user
      if (query.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const batches = await listJournalBatches(query);

      return successResponse(batches);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/journals failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * POST /api/journals
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
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ManualJournalEntryCreateRequestSchema.parse(payload);
      const clientRefCandidate = typeof payload?.client_ref === "string" ? payload.client_ref : null;
      let clientRef = input.client_ref ?? null;
      if (!clientRef && clientRefCandidate) {
        const parsedClientRef = z.string().uuid().safeParse(clientRefCandidate);
        if (!parsedClientRef.success) {
          return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
        }
        clientRef = parsedClientRef.data;
      }
      const normalizedInput = clientRef ? { ...input, client_ref: clientRef } : input;

      // Verify company_id matches authenticated user
      if (normalizedInput.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const batch = await createManualJournalEntry(normalizedInput, auth.userId);

      return successResponse(batch, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof JournalNotBalancedError) {
        return errorResponse("NOT_BALANCED", "Journal entry debits and credits must balance", 400);
      }

      if (error instanceof InvalidJournalLineError) {
        return errorResponse("INVALID_LINE", error.message, 400);
      }

      if (error instanceof Error && error.name === "JournalOutsideFiscalYearError") {
        return errorResponse(
          "FISCAL_YEAR_CLOSED",
          "Entry date is outside any open fiscal year",
          400
        );
      }

      console.error("POST /api/journals failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
