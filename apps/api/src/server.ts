// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Hono } from "hono";
import type { Context } from "hono";
import { compress } from "hono/compress";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";

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

function toApiRoutePath(routesRoot: string, routeFilePath: string): string {
  const routeDir = dirname(routeFilePath);
  const routeRelativeDir = relative(routesRoot, routeDir);
  const routeSegments = routeRelativeDir === "." ? "" : routeRelativeDir.split(sep).join("/");
  const nextStylePath = routeSegments.length > 0 ? `/api/${routeSegments}` : "/api";
  return nextStylePath.replace(/\[([^\]]+)\]/g, ":$1");
}

async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRouteFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function cloneRequestForHandler(request: Request): Request {
  const isBodylessMethod = request.method === "GET" || request.method === "HEAD";
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: isBodylessMethod ? undefined : request.body
  });
}

function registerRoute(app: Hono, routePath: string, method: HttpMethod, handler: (request: Request) => Promise<Response> | Response): void {
  const wrappedHandler = async (c: Context) => {
    const startTime = Date.now();
    const origin = c.req.header("origin") ?? null;
    const requestForHandler = cloneRequestForHandler(c.req.raw);

    try {
      const response = await handler(requestForHandler);
      if (shouldLog(c.req.path)) {
        logRequest(c.req.method, c.req.path, response.status, Date.now() - startTime, origin);
      }
      
      // Return response and let Hono handle it
      return response;
    } catch (error) {
      console.error(`Route handler failed for ${method} ${routePath}`, error);
      
      if (shouldLog(c.req.path)) {
        logRequest(c.req.method, c.req.path, 500, Date.now() - startTime, origin);
      }
      
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal Server Error"
          }
        },
        500
      );
    }
  };

  switch (method) {
    case "GET":
      app.get(routePath, wrappedHandler);
      break;
    case "POST":
      app.post(routePath, wrappedHandler);
      break;
    case "PUT":
      app.put(routePath, wrappedHandler);
      break;
    case "PATCH":
      app.patch(routePath, wrappedHandler);
      break;
    case "DELETE":
      app.delete(routePath, wrappedHandler);
      break;
  }
}

async function registerRoutes(app: Hono): Promise<void> {
  const routesRoot = join(__dirname, "..", "app", "api");
  const routeFiles = await listRouteFiles(routesRoot);

  for (const routeFilePath of routeFiles) {
    const routePath = toApiRoutePath(routesRoot, routeFilePath);
    const routeModule = (await import(pathToFileURL(routeFilePath).href)) as RouteModule;

    for (const method of HTTP_METHODS) {
      const handler = routeModule[method];
      if (typeof handler === "function") {
        registerRoute(app, routePath, method, handler);
      }
    }
  }
}

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

await registerRoutes(app);

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

const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST
  },
  (info: { address: string; port: number }) => {
    console.log(`API server running on http://${info.address}:${info.port}`);
  }
);

// Handle graceful shutdown
const shutdown = () => {
  console.log("\nShutting down API server...");
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
