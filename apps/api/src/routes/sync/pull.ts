// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Routes
 *
 * GET /sync/pull - Pull master data from server
 *
 * NOTE: This is a stub. Full migration from app/api/sync/pull/route.ts pending.
 */

import { Hono } from "hono";
import { authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const syncPullRoutes = new Hono();

// Auth middleware
syncPullRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// TODO: Migrate full pull logic from app/api/sync/pull/route.ts
syncPullRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sync pull under migration" } }, 501);
});

export { syncPullRoutes };
