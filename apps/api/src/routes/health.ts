// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Health Routes
 *
 * Simple health check endpoint - no auth required.
 * 
 * SECURITY DECISION: This endpoint is intentionally public to allow:
 * - Load balancer health checks
 * - Monitoring systems
 * - Infrastructure health validation
 * 
 * This endpoint only returns basic status information and does not
 * expose sensitive data or allow any mutations.
 */

import { Hono } from "hono";

const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  return c.json({ success: true, data: { status: "ok", timestamp: new Date().toISOString() } });
});

export { healthRoutes };
