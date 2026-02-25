import { ManualJournalEntryCreateRequestSchema, JournalListQuerySchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import {
  createManualJournalEntry,
  listJournalBatches,
  JournalNotBalancedError,
  InvalidJournalLineError
} from "../../../src/lib/journals";

/**
 * Helper: Create standardized error response
 */
function errorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

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

      return Response.json(
        {
          success: true,
          data: batches
        },
        { status: 200 }
      );
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

      // Verify company_id matches authenticated user
      if (input.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const batch = await createManualJournalEntry(input, auth.userId);

      return Response.json(
        {
          success: true,
          data: batch
        },
        { status: 201 }
      );
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

      console.error("POST /api/journals failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
