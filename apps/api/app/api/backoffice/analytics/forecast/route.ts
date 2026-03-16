// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getDbPool } from "@/lib/db";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { searchParams } = new URL(request.url);
      const forecast_type = searchParams.get("type") || "DAILY";
      const outlet_id = searchParams.get("outlet_id");
      const days = parseInt(searchParams.get("days") || "30", 10);

      const dbPool = getDbPool();
      
      let query = `
        SELECT id, company_id, outlet_id, forecast_type, forecast_date, 
               predicted_amount, confidence_lower, confidence_upper, model_version, generated_at
        FROM sales_forecasts
        WHERE company_id = ? AND forecast_type = ? AND forecast_date >= CURDATE() AND forecast_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      `;
      const params: any[] = [auth.companyId, forecast_type, days];

      if (outlet_id) {
        query += " AND outlet_id = ?";
        params.push(parseInt(outlet_id, 10));
      }

      query += " ORDER BY forecast_date ASC";

      const [forecasts] = await dbPool.execute(query, params);

      const forecastList = (forecasts as any[]).map(f => ({
        id: f.id,
        outlet_id: f.outlet_id,
        forecast_type: f.forecast_type,
        forecast_date: f.forecast_date,
        predicted_amount: parseFloat(f.predicted_amount),
        confidence_lower: f.confidence_lower ? parseFloat(f.confidence_lower) : null,
        confidence_upper: f.confidence_upper ? parseFloat(f.confidence_upper) : null,
        model_version: f.model_version,
        generated_at: f.generated_at
      }));

      return successResponse({
        forecasts: forecastList,
        type: forecast_type,
        days
      });
    } catch (error) {
      console.error("GET /backoffice/analytics/forecast failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch forecasts", 500);
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
      const forecastType = body.forecast_type || "DAILY";
      const forecastDays = body.forecast_days || 30;

      const dbPool = getDbPool();
      const jobId = crypto.randomUUID();

      await dbPool.execute(`
        INSERT INTO backoffice_sync_queue (
          id, company_id, document_type, tier, sync_status, scheduled_at, retry_count, max_retries, payload_hash
        ) VALUES (?, ?, 'FORECAST_GENERATION', 'ANALYTICS', 'PENDING', NOW(), 0, 3, ?)
      `, [jobId, auth.companyId, JSON.stringify({ forecastType, forecastDays })]);

      return successResponse({ 
        message: "Forecast generation queued",
        job_id: jobId
      }, 202);
    } catch (error) {
      console.error("POST /backoffice/analytics/forecast failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to queue forecast generation", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"]
    })
  ]
);
