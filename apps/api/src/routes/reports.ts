// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reports Routes
 *
 * Routes for report generation.
 * NOTE: This is a stub. Full migration from app/api/reports/ pending.
 */

import { Hono } from "hono";
import { authenticateRequest } from "../lib/auth-guard.js";
import type { AuthContext } from "../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const reportRoutes = new Hono();

// Auth middleware
reportRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Stubs - full migration pending
reportRoutes.get("/daily-sales", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Reports migrated to Hono - full logic pending" } }, 501);
});

reportRoutes.get("/trial-balance", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Reports migrated to Hono - full logic pending" } }, 501);
});

reportRoutes.get("/profit-loss", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Reports migrated to Hono - full logic pending" } }, 501);
});

export { reportRoutes };
