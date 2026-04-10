// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * App Factory - Creates and configures the Hono application
 * 
 * This module creates the Hono app and registers all routes.
 * It's separate from server.ts so the app can be imported in tests
 * without starting the HTTP server.
 * 
 * To start the server, use server.ts which imports this module.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { compress } from 'hono/compress';
import { logger as honoLogger } from 'hono/logger';
import { createReadStream, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { stockRoutes } from './routes/stock.js';
import { syncRoutes } from './routes/sync.js';
import { salesRoutes } from './routes/sales.js';
import { inventoryRoutes } from './routes/inventory.js';
import { imageRoutes as inventoryImagesRoutes } from './routes/inventory-images.js';
import { healthRoutes } from './routes/health.js';
import { rolesRoutes } from './routes/roles.js';
import { authRoutes } from './routes/auth.js';
import { journalRoutes } from './routes/journals.js';
import { reportRoutes } from './routes/reports.js';
import { accountRoutes } from './routes/accounts.js';
import { companyRoutes } from './routes/companies.js';
import { dineinRoutes } from './routes/dinein.js';
import { usersRoutes } from './routes/users.js';
import { taxRatesRoutes } from './routes/tax-rates.js';
import { modulesRoutes } from './routes/settings-modules.js';
import { moduleRolesRoutes } from './routes/settings-module-roles.js';
import { adminPagesRoutes, publicPagesRoutes } from './routes/settings-pages.js';
import { settingsConfigRoutes } from './routes/settings-config.js';
import { outletsRoutes } from './routes/outlets.js';
import { recipesRoutes } from './routes/recipes.js';
import { cashBankTransactionsRoutes } from './routes/cash-bank-transactions.js';
import { suppliesRoutes } from './routes/supplies.js';
import { printRoutes } from './lib/routes.js';
import { posItemVariantsRoutes } from './routes/pos-items.js';
import { posCartRoutes } from './routes/pos-cart.js';
import { exportRoutes } from './routes/export.js';
import { importRoutes } from './routes/import.js';
import { progressRoutes } from './routes/progress.js';
import { adminDashboardRoutes } from './routes/admin-dashboards/index.js';
import { adminRunbookRoutes } from './routes/admin-runbook.js';
import { auditRoutes } from './routes/audit.js';
import { swaggerRoutes } from './routes/swagger.js';

const HTTP_LOG_ENABLED = process.env.JP_HTTP_LOG === "1";

function getAllowedOrigins(): string[] {
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

  if (isDevelopment) {
    return [
      "http://localhost:3002",
      "http://localhost:4173",
      "http://localhost:5173",
      "http://127.0.0.1:3002",
      "http://127.0.0.1:4173",
      "http://127.0.0.1:5173"
    ];
  }

  const corsOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (!corsOrigins) {
    console.warn("CORS_ALLOWED_ORIGINS not set in production. CORS will be disabled.");
    return [];
  }

  return corsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Create and configure the Hono application
 */
export function createApp(): Hono {
  const app = new Hono();
  const allowedOrigins = getAllowedOrigins();

  app.use("/api/*", compress());

  if (HTTP_LOG_ENABLED) {
    app.use("/api/*", honoLogger());
  }

  app.use("/api/*", async (c: Context, next: () => Promise<void>) => {
    const origin = c.req.header("origin") ?? null;

    if (c.req.method === "OPTIONS") {
      c.status(204);
      
      if (origin && allowedOrigins.includes(origin)) {
        c.header("Access-Control-Allow-Origin", origin);
      }

      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      c.header("Access-Control-Max-Age", "86400");
      c.header("Access-Control-Allow-Credentials", "true");

      return c.body(null);
    }

    await next();

    if (origin && allowedOrigins.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    }
  });

  // Static file serving for uploaded images
  // Serves files from JP_UPLOAD_PATH at /uploads/* URL path
  const UPLOAD_URL_PREFIX = "/uploads";
  const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  app.use(`${UPLOAD_URL_PREFIX}/*`, async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }

    const pathname = c.req.path;
    if (!pathname.startsWith(UPLOAD_URL_PREFIX + "/")) {
      return next();
    }

    const uploadPath = process.env.JP_UPLOAD_PATH || "./uploads";
    const fileRelPath = pathname.slice(UPLOAD_URL_PREFIX.length + 1);
    const absPath = join(uploadPath, fileRelPath);

    // Security: prevent path traversal
    if (!absPath.startsWith(join(uploadPath))) {
      return c.body("Forbidden", 403);
    }

    if (!existsSync(absPath)) {
      return c.body("Not Found", 404);
    }

    const ext = extname(absPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    c.header("X-Content-Type-Options", "nosniff");

    if (method === "HEAD") {
      return c.body(null);
    }

    // Convert Node.js ReadStream to Web ReadableStream for Hono
    const webStream = createReadStream(absPath) as unknown as ReadableStream;
    return c.body(webStream);
  });

  // Register stock routes using Hono's app.route() pattern
  app.route("/api/outlets/:outletId/stock", stockRoutes);

  // Register sync routes
  app.route("/api/sync", syncRoutes);

  // Register sales routes
  app.route("/api/sales", salesRoutes);

  // Register health routes (no auth required)
  app.route("/api/health", healthRoutes);

  // Register auth routes (special handling - no auth for login)
  app.route("/api/auth", authRoutes);

  // Register remaining route groups
  app.route("/api/roles", rolesRoutes);
  app.route("/api/journals", journalRoutes);
  app.route("/api/reports", reportRoutes);
  app.route("/api/accounts", accountRoutes);
  app.route("/api/companies", companyRoutes);
  app.route("/api/dinein", dineinRoutes);

  // Register inventory routes
  app.route("/api/inventory", inventoryRoutes);

  // Register inventory image routes under /api/inventory/items
  app.route("/api/inventory/items", inventoryImagesRoutes);

  // Register users routes
  app.route("/api/users", usersRoutes);

  // Register tax rates routes
  app.route("/api/settings/tax-rates", taxRatesRoutes);
  app.route("/api/settings/modules", modulesRoutes);
  app.route("/api/settings/module-roles", moduleRolesRoutes);
  app.route("/api/settings/config", settingsConfigRoutes);
  app.route("/api/settings/pages", adminPagesRoutes);
  app.route("/api/pages", publicPagesRoutes);

  // Register outlets routes
  app.route("/api/outlets", outletsRoutes);

  // Register audit routes
  app.route("/api/audit", auditRoutes);

  // Register POS items routes
  app.route("/api/pos/items", posItemVariantsRoutes);

  // Register POS cart routes
  app.route("/api/pos/cart", posCartRoutes);

  // Register recipe routes under inventory
  app.route("/api/inventory/recipes", recipesRoutes);

  // Register cash bank transactions routes
  app.route("/api/cash-bank-transactions", cashBankTransactionsRoutes);

  // Register supplies routes under inventory
  app.route("/api/inventory/supplies", suppliesRoutes);

  // Register export routes
  app.route("/api/export", exportRoutes);

  // Register import routes
  app.route("/api/import", importRoutes);

  // Register progress routes
  app.route("/api/operations", progressRoutes);

  // Register admin dashboard routes
  app.route("/admin/dashboard", adminDashboardRoutes);

  // Register admin runbook routes
  app.route("/admin", adminRunbookRoutes);

  // Register swagger routes (only in non-production)
  // Mount at root so /swagger and /swagger.json are at root level
  if (process.env.NODE_ENV !== "production") {
    app.route("/", swaggerRoutes);
  }

  app.notFound(() => {
    return Response.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Not Found"
        }
      },
      { status: 404 }
    );
  });

  app.onError((error: unknown) => {
    console.error("Unhandled API error", error);
    return Response.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal Server Error"
        }
      },
      { status: 500 }
    );
  });

  // Print registered routes in development
  if (process.env.NODE_ENV !== "production") {
    printRoutes(app);
  }

  return app;
}

// Create the app instance for server.ts and tests
export const app = createApp();
