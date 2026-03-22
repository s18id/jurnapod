// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Order Routes
 *
 * Routes for sales order operations.
 * NOTE: This is a stub. Full migration from app/api/sales/orders/ pending.
 */

import { Hono } from "hono";

const orderRoutes = new Hono();

// Stubs - full migration pending
orderRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales orders migrated to Hono - full logic pending" } }, 501);
});

orderRoutes.post("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales orders migrated to Hono - full logic pending" } }, 501);
});

export { orderRoutes };
