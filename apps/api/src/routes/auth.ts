// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Auth Routes
 *
 * Routes for authentication.
 * NOTE: This is a stub. Full migration from app/api/auth/ pending.
 */

import { Hono } from "hono";

const authRoutes = new Hono();

// Stubs - full migration pending
authRoutes.post("/login", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Auth migrated to Hono - full logic pending" } }, 501);
});

authRoutes.post("/logout", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Auth migrated to Hono - full logic pending" } }, 501);
});

authRoutes.post("/refresh", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Auth migrated to Hono - full logic pending" } }, 501);
});

export { authRoutes };
