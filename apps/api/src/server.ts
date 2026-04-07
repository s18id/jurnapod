// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createServer } from "node:http";
import { assertAppEnvReady } from "./lib/env.js";
import { initializeSyncModules, cleanupSyncModules } from "./lib/sync-modules.js";
import { initWebSocketManager } from "./lib/websocket/index.js";
import { cleanupStaleOperations } from "./lib/progress/progress-store.js";
import { initializeDefaultMetrics } from "./lib/metrics/index.js";
import { alertEvaluationService } from "./lib/alerts/alert-evaluation.js";
import { app } from "./app.js";

// Validate environment configuration before starting server
assertAppEnvReady();

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? "3001");
const HOST = process.env.HOST ?? "0.0.0.0";

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
      headers,
    };

    if (body && body.length > 0) {
      (requestInit as any).body = body;
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

// Initialize sync modules after routes are registered
initializeSyncModules().catch((error) => {
  console.error("Failed to initialize sync modules. Server will continue without modular sync.", error);
});

// Initialize progress tracking - cleanup stale operations on startup
cleanupStaleOperations()
  .then((staleCount) => {
    if (staleCount > 0) {
      console.info(`[progress] Cleaned up ${staleCount} stale operation(s) on startup`);
    }
  })
  .catch((error) => {
    console.error("Failed to initialize progress tracking. Server will continue.", error);
  });

// Initialize WebSocket manager
const wsManager = initWebSocketManager(server);
wsManager.start();

server.listen(PORT, HOST, () => {
  console.log(`API server running on http://${HOST}:${PORT}`);
  console.log(`WebSocket server running on ws://${HOST}:${PORT}/ws`);
  console.log(`Metrics available at http://${HOST}:${PORT}/metrics`);

  // Initialize metrics collection
  initializeDefaultMetrics();
  console.log("[metrics] Prometheus metrics initialized");

  // Start alert evaluation service (only in production or when explicitly enabled)
  alertEvaluationService.start();
  console.log("[alert] Alert evaluation service started");
});

// Handle graceful shutdown
const shutdown = async () => {
  console.log("\nShutting down API server...");

  // Stop WebSocket server
  wsManager.stop();

  // Stop alert evaluation service
  alertEvaluationService.stop();

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
