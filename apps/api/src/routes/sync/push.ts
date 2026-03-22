// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Routes
 *
 * POST /sync/push - Push transactions to server
 *
 * NOTE: This is a stub. Full migration from app/api/sync/push/route.ts pending.
 */

import { Hono } from "hono";
import { authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const syncPushRoutes = new Hono();

// Auth middleware
syncPushRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// TODO: Migrate full push logic from app/api/sync/push/route.ts
syncPushRoutes.post("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Sync push under migration" } }, 501);
});

export { syncPushRoutes };
