// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Context } from "hono";
import { compress } from "hono/compress";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createServer } from "node:http";
import { assertAppEnvReady } from "./lib/env.js";
import { initializeSyncModules, cleanupSyncModules } from "./lib/sync-modules.js";
import { initWebSocketManager } from "./lib/websocket/index.js";
import { stockRoutes } from "./routes/stock.js";
import { syncRoutes } from "./routes/sync.js";
import { salesRoutes } from "./routes/sales.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { healthRoutes } from "./routes/health.js";
import { rolesRoutes } from "./routes/roles.js";
import { authRoutes } from "./routes/auth.js";
import { journalRoutes } from "./routes/journals.js";
import { reportRoutes } from "./routes/reports.js";
import { accountRoutes } from "./routes/accounts.js";
import { companyRoutes } from "./routes/companies.js";
import { dineinRoutes } from "./routes/dinein.js";
import { usersRoutes } from "./routes/users.js";
import { taxRatesRoutes } from "./routes/tax-rates.js";
import { outletsRoutes } from "./routes/outlets.js";
import { recipesRoutes } from "./routes/recipes.js";
import { printRoutes } from "./lib/routes.js";

// Validate environment configuration before starting server
assertAppEnvReady();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? "3001");
const HOST = process.env.HOST ?? "0.0.0.0";

const HTTP_LOG_ENABLED = process.env.JP_HTTP_LOG === "1";
const HTTP_LOG_HEALTH = process.env.JP_HTTP_LOG_HEALTH === "1";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];
type RouteModule = Partial<Record<HttpMethod, (request: Request) => Promise<Response> | Response>>;

function shouldLog(path: string): boolean {
  if (!HTTP_LOG_ENABLED) return false;
  if (!HTTP_LOG_HEALTH && path === "/api/health") return false;
  return true;
}

function logRequest(method: string, path: string, status: number, durationMs: number, origin: string | null) {
  const originStr = origin || "-";
  console.log(`[api-hit] ${method} ${path} ${status} in ${durationMs}ms origin=${originStr}`);
}

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

// Clean Hono-only server - no messy subfolder routing

const app = new Hono();
const allowedOrigins = getAllowedOrigins();

app.use("/api/*", compress());

if (HTTP_LOG_ENABLED) {
  app.use("/api/*", honoLogger());
}

app.use("/api/*", async (c: any, next: () => Promise<void>) => {
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

// Register stock routes using Hono's app.route() pattern
// URL standardization: /api/outlets/:outletId/stock/* (RESTful nesting)
app.route("/api/outlets/:outletId/stock", stockRoutes);

// Register sync routes using Hono's app.route() pattern
// URL standardization: /api/sync/* (cross-outlet operation)
app.route("/api/sync", syncRoutes);

// Register sales routes using Hono's app.route() pattern
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

// Register inventory routes using clean Hono structure  
app.route("/api/inventory", inventoryRoutes);

// Register users routes
app.route("/api/users", usersRoutes);

// Register tax rates routes  
app.route("/api/settings/tax-rates", taxRatesRoutes);

// Register outlets routes
app.route("/api/outlets", outletsRoutes);

// Register recipe routes under inventory
app.route("/api/inventory/recipes", recipesRoutes);

// Initialize sync modules after routes are registered
try {
  await initializeSyncModules();
} catch (error) {
  console.error("Failed to initialize sync modules. Server will continue without modular sync.", error);
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

// Helper to read request body from Node.js stream
function readRequestBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Create Node.js server with Hono adapter
const server = createServer(async (req, res) => {
  // Convert Node.js req to Web Standard Request
  try {
    // Build the full URL
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = `${protocol}://${host}${req.url}`;
    
    // Convert Node.js headers to Web Standard Headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }
    
    // Read request body for non-GET/HEAD methods
    let body: Buffer | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await readRequestBody(req);
    }
    
    // Create Web Standard Request from Node.js req
    const requestInit: RequestInit = {
      method: req.method,
      headers: headers,
    };
    
    if (body && body.length > 0) {
      requestInit.body = body as any;
      // Required for streaming bodies in Node.js fetch
      (requestInit as any).duplex = 'half';
    }
    
    const request = new Request(url, requestInit);
    
    // Call Hono's fetch with the proper Request object
    const response = await app.fetch(request);
    
    // Write response back to Node.js res
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    // Stream response body to Node.js res
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (error) {
        console.error("Error streaming response:", error);
        if (!res.writableEnded) {
          res.end();
        }
      }
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Request handling error:", error);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error" } }));
    }
  }
});

// Initialize WebSocket manager
const wsManager = initWebSocketManager(server);
wsManager.start();

server.listen(PORT, HOST, () => {
  console.log(`API server running on http://${HOST}:${PORT}`);
  console.log(`WebSocket server running on ws://${HOST}:${PORT}/ws`);
  
  // Print registered routes in development
  if (process.env.NODE_ENV !== "production") {
    printRoutes(app);
  }
});

// Handle graceful shutdown
const shutdown = async () => {
  console.log("\nShutting down API server...");
  
  // Stop WebSocket server
  wsManager.stop();
  
  // Cleanup sync modules
  await cleanupSyncModules();
  
  server.close(() => {
    console.log("API server stopped");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Handle port in use error
process.on("uncaughtException", (error: Error) => {
  if ("code" in error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Please stop the existing server or use a different port.`);
    process.exit(1);
  }
  throw error;
});
