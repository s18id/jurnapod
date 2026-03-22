// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Account Routes
 *
 * Routes for account management.
 * NOTE: This is a stub. Full migration from app/api/accounts/ pending.
 */

import { Hono } from "hono";
import { authenticateRequest } from "../lib/auth-guard.js";
import type { AuthContext } from "../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const accountRoutes = new Hono();

// Auth middleware
accountRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Stubs - full migration pending
accountRoutes.get("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Accounts migrated to Hono - full logic pending" } }, 501);
});

accountRoutes.post("/", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Accounts migrated to Hono - full logic pending" } }, 501);
});

accountRoutes.get("/types", async (c) => {
  return c.json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Accounts migrated to Hono - full logic pending" } }, 501);
});

export { accountRoutes };
