// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Routes
 *
 * Hono route module for sync endpoints.
 * Sync routes stay under /sync/ prefix (cross-outlet operation).
 */

import { Hono } from "hono";
import { healthRoutes } from "./sync/health.js";
import { checkDuplicateRoutes } from "./sync/check-duplicate.js";
import { syncPushRoutes } from "./sync/push.js";
import { syncPullRoutes } from "./sync/pull.js";
import { stockSyncRoutes } from "./sync/stock.js";
import { telemetryMiddleware } from "../middleware/telemetry.js";

// Create sync routes Hono instance
const syncRoutes = new Hono();

// Apply telemetry middleware to all sync routes
syncRoutes.use(telemetryMiddleware());

// Mount sub-routes
syncRoutes.route("/health", healthRoutes);
syncRoutes.route("/check-duplicate", checkDuplicateRoutes);
syncRoutes.route("/push", syncPushRoutes);
syncRoutes.route("/pull", syncPullRoutes);
syncRoutes.route("/stock", stockSyncRoutes);

export { syncRoutes };
