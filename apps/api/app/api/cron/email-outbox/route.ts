// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { processPendingEmails } from "../../../../src/lib/email-outbox";
import { successResponse, errorResponse } from "../../../../src/lib/response";
import { getAppEnv } from "../../../../src/lib/env";

/**
 * Cron endpoint to process pending emails in the outbox.
 * 
 * Protected by CRON_EMAIL_OUTBOX_SECRET header.
 * Should be called by system cron every 1-5 minutes:
 * 
 * Example crontab entry:
 * * * * * * curl -sS -X POST http://127.0.0.1:3001/api/cron/email-outbox \
 *   -H "x-cron-secret: YOUR_SECRET" >> /var/log/jurnapod-cron.log 2>&1
 */
export async function POST(request: Request) {
  try {
    // Use getAppEnv for consistent validation
    const env = getAppEnv();
    const cronSecret = env.cron.emailOutboxSecret;

    const providedSecret = request.headers.get("x-cron-secret");
    
    if (!providedSecret || providedSecret !== cronSecret) {
      return errorResponse("UNAUTHORIZED", "Invalid or missing cron secret", 401);
    }

    const result = await processPendingEmails();
    
    return successResponse({
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("POST /api/cron/email-outbox failed", error);
    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      "Failed to process email outbox",
      500
    );
  }
}
