// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Routes
 *
 * Hono route module for sales endpoints.
 * Includes invoices, orders, payments, and credit-notes.
 */

import { Hono } from "hono";
import { invoiceRoutes } from "./sales/invoices.js";
import { orderRoutes } from "./sales/orders.js";
import { paymentRoutes } from "./sales/payments.js";
import { creditNoteRoutes } from "./sales/credit-notes.js";
import { telemetryMiddleware } from "../middleware/telemetry.js";
import { authenticateRequest } from "../lib/auth-guard.js";
import type { AuthContext } from "../lib/auth-guard.js";

// Extend Hono context with auth
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// Create sales routes Hono instance
const salesRoutes = new Hono();

// Apply telemetry middleware to all sales routes
salesRoutes.use(telemetryMiddleware());

// Auth middleware
salesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Mount sub-routes
salesRoutes.route("/invoices", invoiceRoutes);
salesRoutes.route("/orders", orderRoutes);
salesRoutes.route("/payments", paymentRoutes);
salesRoutes.route("/credit-notes", creditNoteRoutes);

export { salesRoutes };
