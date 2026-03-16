// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { searchParams } = new URL(request.url);
      const insight_type = searchParams.get("type");
      const outlet_id = searchParams.get("outlet_id");
      const include_expired = searchParams.get("include_expired") === "true";

      const dbPool = getDbPool();
      
      let query = `
        SELECT id, company_id, outlet_id, insight_type, metric_name, metric_value,
               reference_period, severity, description, recommendation, calculated_at, expires_at
        FROM analytics_insights
        WHERE company_id = ?
      `;
      const params: any[] = [auth.companyId];

      if (!include_expired) {
        query += " AND expires_at > NOW()";
      }

      if (insight_type) {
        query += " AND insight_type = ?";
        params.push(insight_type);
      }

      if (outlet_id) {
        query += " AND (outlet_id = ? OR outlet_id IS NULL)";
        params.push(parseInt(outlet_id, 10));
      }

      query += " ORDER BY calculated_at DESC LIMIT 50";

      const [insights] = await dbPool.execute(query, params);

      const insightsList = (insights as any[]).map(i => ({
        id: i.id,
        outlet_id: i.outlet_id,
        insight_type: i.insight_type,
        metric_name: i.metric_name,
        metric_value: parseFloat(i.metric_value),
        reference_period: i.reference_period,
        severity: i.severity,
        description: i.description,
        recommendation: i.recommendation,
        calculated_at: i.calculated_at,
        expires_at: i.expires_at
      }));

      return successResponse({
        insights: insightsList,
        count: insightsList.length
      });
    } catch (error) {
      console.error("GET /backoffice/analytics/insights failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch insights", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      const period = body.period || 30;

      const dbPool = getDbPool();
      const jobId = crypto.randomUUID();

      await dbPool.execute(`
        INSERT INTO backoffice_sync_queue (
          id, company_id, document_type, tier, sync_status, scheduled_at, retry_count, max_retries, payload_hash
        ) VALUES (?, ?, 'INSIGHTS_CALCULATION', 'ANALYTICS', 'PENDING', NOW(), 0, 3, ?)
      `, [jobId, auth.companyId, JSON.stringify({ period })]);

      return successResponse({ 
        message: "Insights calculation queued",
        job_id: jobId
      }, 202);
    } catch (error) {
      console.error("POST /backoffice/analytics/insights failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to queue insights calculation", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"]
    })
  ]
);
