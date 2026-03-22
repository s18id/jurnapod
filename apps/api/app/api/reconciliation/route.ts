// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { getDbPool } from "../../../src/lib/db";
import { ReconciliationService } from "../../../src/lib/reconciliation-service";
import { ReconciliationMetricsCollector, reconciliationMetricsCollector, RECONCILIATION_SLO_LATENCY_MS } from "../../../src/lib/reconciliation-metrics";
import { errorResponse, successResponse } from "../../../src/lib/response";

const ReconciliationQuerySchema = z.object({
  company_id: z.coerce.number().int().positive().optional(),
  outlet_id: z.coerce.number().int().positive().optional()
});

/**
 * Emit structured log for reconciliation metrics (for alerting/monitoring)
 */
function logReconciliationMetrics(
  companyId: number,
  outletId: number | undefined,
  counts: { missingJournal: number; unbalanced: number; orphan: number },
  latencyMs: number,
  status: "PASS" | "FAIL"
): void {
  const sloOk = latencyMs < RECONCILIATION_SLO_LATENCY_MS;

  // Structured log for metrics aggregation
  console.info("reconciliation.run", {
    company_id: companyId,
    outlet_id: outletId,
    missing_journal_count: counts.missingJournal,
    unbalanced_count: counts.unbalanced,
    orphan_count: counts.orphan,
    latency_ms: latencyMs,
    status,
    slo_latency_ok: sloOk,
    has_findings: counts.missingJournal > 0 || counts.unbalanced > 0 || counts.orphan > 0
  });

  // Alert-worthy events (could trigger external alerting)
  if (counts.missingJournal > 0) {
    console.warn("reconciliation.alert.missing_journal", {
      company_id: companyId,
      outlet_id: outletId,
      count: counts.missingJournal
    });
  }

  if (counts.unbalanced > 0) {
    console.error("reconciliation.alert.unbalanced", {
      company_id: companyId,
      outlet_id: outletId,
      count: counts.unbalanced
    });
  }

  if (counts.orphan > 0) {
    console.error("reconciliation.alert.orphan", {
      company_id: companyId,
      outlet_id: outletId,
      count: counts.orphan
    });
  }

  if (!sloOk) {
    console.warn("reconciliation.alert.slo_breach", {
      company_id: companyId,
      outlet_id: outletId,
      latency_ms: latencyMs,
      threshold_ms: RECONCILIATION_SLO_LATENCY_MS
    });
  }
}

/**
 * GET /api/reconciliation
 * Get reconciliation status (counts only, no full findings for lighter response)
 *
 * Query params:
 * - company_id (optional): Company ID (defaults to auth user's company)
 * - outlet_id (optional): Outlet ID filter
 *
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);

      const query = ReconciliationQuerySchema.parse({
        company_id: url.searchParams.get("company_id")
          ? parseInt(url.searchParams.get("company_id")!)
          : auth.companyId,
        outlet_id: url.searchParams.get("outlet_id")
          ? parseInt(url.searchParams.get("outlet_id")!)
          : undefined
      });

      // Use auth company if company_id not provided or matches
      const companyId = query.company_id ?? auth.companyId;

      // Verify company_id matches authenticated user (unless super admin)
      if (companyId !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const pool = getDbPool();
      const connection = await pool.getConnection();

      try {
        const service = new ReconciliationService(connection);
        const startTime = Date.now();
        const counts = await service.getCounts({
          companyId,
          outletId: query.outlet_id
        });
        const latencyMs = Date.now() - startTime;

        const status = counts.missingJournal > 0 || counts.unbalanced > 0 || counts.orphan > 0
          ? "FAIL"
          : "PASS";

        // Record metrics
        reconciliationMetricsCollector.recordReconciliation(
          { companyId, outletId: query.outlet_id, ranAt: new Date().toISOString(), counts, status },
          latencyMs
        );

        // Log for monitoring/alerting
        logReconciliationMetrics(companyId, query.outlet_id, counts, latencyMs, status);

        return successResponse({
          companyId,
          outletId: query.outlet_id,
          counts,
          status
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/reconciliation failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
    })
  ]
);

/**
 * POST /api/reconciliation
 * Trigger full reconciliation run with all findings
 *
 * Body params (JSON):
 * - company_id (optional): Company ID (defaults to auth user's company)
 * - outlet_id (optional): Outlet ID filter
 *
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json().catch(() => ({}));

      const schema = ReconciliationQuerySchema.extend({
        company_id: z.coerce.number().int().positive().optional()
      });

      const params = schema.parse({
        company_id: body.company_id ?? auth.companyId,
        outlet_id: body.outlet_id
      });

      // Use auth company if company_id not provided or matches
      const companyId = params.company_id ?? auth.companyId;

      // Verify company_id matches authenticated user
      if (companyId !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const pool = getDbPool();
      const connection = await pool.getConnection();

      try {
        const service = new ReconciliationService(connection);
        const startTime = Date.now();
        const result = await service.reconcile({
          companyId,
          outletId: params.outlet_id
        });
        const latencyMs = Date.now() - startTime;

        // Record metrics
        reconciliationMetricsCollector.recordReconciliation(result, latencyMs);

        // Log for monitoring/alerting
        logReconciliationMetrics(companyId, params.outlet_id, result.counts, latencyMs, result.status);

        return successResponse(result);
      } finally {
        connection.release();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("POST /api/reconciliation failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
    })
  ]
);
