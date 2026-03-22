// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Dine-in Routes
 *
 * Routes for dine-in operations (sessions, tables, reservations).
 * NOTE: This is a stub. Full migration from app/api/dinein/ pending.
 */

import { Hono } from "hono";
import { authenticateRequest } from "../lib/auth-guard.js";
import type { AuthContext } from "../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const dineinRoutes = new Hono();

// Auth middleware
dineinRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Stubs - full migration pending
dineinRoutes.get("/sessions", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Dine-in migrated to Hono - full logic pending" } }, 501);
});

dineinRoutes.get("/tables", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Dine-in migrated to Hono - full logic pending" } }, 501);
});

export { dineinRoutes };
