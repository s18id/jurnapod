import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getJournalBatch, JournalNotFoundError } from "../../../../src/lib/journals";

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
 * Helper: Parse batch ID from URL pathname
 */
function parseBatchId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const batchIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(batchIdRaw);
}

/**
 * GET /api/journals/:batchId
 * Get single journal batch by ID with all lines
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const batchId = parseBatchId(request);
      const batch = await getJournalBatch(batchId, auth.companyId);

      return Response.json(
        {
          success: true,
          data: batch
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_ID", "Invalid batch ID", 400);
      }

      if (error instanceof JournalNotFoundError) {
        return errorResponse("NOT_FOUND", "Journal batch not found", 404);
      }

      console.error("GET /api/journals/:batchId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
