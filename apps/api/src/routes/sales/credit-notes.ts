// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Credit Note Routes
 *
 * Routes for sales credit note operations.
 * NOTE: This is a stub. Full migration from app/api/sales/credit-notes/ pending.
 */

import { Hono } from "hono";

const creditNoteRoutes = new Hono();

// Stubs - full migration pending
creditNoteRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales credit notes migrated to Hono - full logic pending" } }, 501);
});

creditNoteRoutes.post("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sales credit notes migrated to Hono - full logic pending" } }, 501);
});

export { creditNoteRoutes };
