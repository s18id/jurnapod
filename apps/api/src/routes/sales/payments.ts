// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Payment Routes
 *
 * Routes for sales payment operations.
 * NOTE: This is a stub. Full migration from app/api/sales/payments/ pending.
 */

import { Hono } from "hono";

const paymentRoutes = new Hono();

// Stubs - full migration pending
paymentRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales payments migrated to Hono - full logic pending" } }, 501);
});

paymentRoutes.post("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales payments migrated to Hono - full logic pending" } }, 501);
});

export { paymentRoutes };
