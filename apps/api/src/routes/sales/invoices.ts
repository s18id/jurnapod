// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Invoice Routes
 *
 * Routes for sales invoice operations.
 * NOTE: This is a stub. Full migration from app/api/sales/invoices/ pending.
 */

import { Hono } from "hono";

const invoiceRoutes = new Hono();

// Stubs - full migration pending
invoiceRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales invoices migrated to Hono - full logic pending" } }, 501);
});

invoiceRoutes.post("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales invoices migrated to Hono - full logic pending" } }, 501);
});

export { invoiceRoutes };
