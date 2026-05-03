// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Progress Routes
 *
 * Routes for tracking long-running operation progress:
 * - GET /api/operations/:operationId/progress - Get progress with optional SSE
 *
 * Story 8.3: Progress Persistence for Long-Running Operations
 */

import { Hono } from "hono";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  authenticateRequest,
  type AuthContext
} from "../lib/auth-guard.js";
import { toUtcIso } from "@/lib/date-helpers";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  getProgress,
  listProgress,
  calculateEta,
  calculatePercentage,
  type OperationStatus,
  type OperationType,
} from "../lib/progress/progress-store.js";

// ============================================================================
// SSE Configuration Constants
// ============================================================================

/**
 * SSE polling interval in milliseconds (default: 2000ms)
 * Override via SSE_POLL_INTERVAL_MS environment variable
 */
const SSE_POLL_INTERVAL_MS = Number(process.env.SSE_POLL_INTERVAL_MS || 2000);

/**
 * SSE keepalive interval in milliseconds (default: 30000ms)
 * Override via SSE_KEEPALIVE_INTERVAL_MS environment variable
 */
const SSE_KEEPALIVE_INTERVAL_MS = Number(process.env.SSE_KEEPALIVE_INTERVAL_MS || 30000);

// ============================================================================
// Types
// ============================================================================

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

interface ProgressResponse {
  operationId: string;
  total: number;
  completed: number;
  percentage: number;
  status: OperationStatus;
  etaSeconds: number | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  details?: Record<string, unknown>;
}

// ============================================================================
// SSE State
// ============================================================================

/**
 * SSE controller with metadata for cleanup
 */
interface SseControllerEntry {
  controller: ReadableStreamDefaultController<Uint8Array>;
  keepaliveInterval: NodeJS.Timeout;
  createdAt: number;
}

/**
 * Map of operation ID to SSE controller entry
 * Used to close SSE connections when operations complete
 */
const sseControllers = new Map<string, SseControllerEntry>();

/**
 * TTL for SSE controllers in milliseconds (5 minutes)
 */
const CONTROLLER_TTL_MS = 5 * 60 * 1000;

/**
 * Register an SSE controller for an operation
 */
export function registerSseController(
  operationId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  keepaliveInterval: NodeJS.Timeout
): void {
  sseControllers.set(operationId, {
    controller,
    keepaliveInterval,
    createdAt: Date.now(),
  });
}

/**
 * Unregister an SSE controller for an operation
 */
export function unregisterSseController(operationId: string): void {
  const entry = sseControllers.get(operationId);
  if (entry) {
    clearInterval(entry.keepaliveInterval);
    sseControllers.delete(operationId);
  }
}

/**
 * Send progress update via SSE to all subscribed clients
 */
export function broadcastProgressUpdate(operationId: string, progress: ProgressResponse): void {
  const entry = sseControllers.get(operationId);
  if (!entry) {
    return;
  }

  try {
    const data = `data: ${JSON.stringify(progress)}\n\n`;
    entry.controller.enqueue(new TextEncoder().encode(data));
  } catch {
    // Connection closed, cleanup
    unregisterSseController(operationId);
  }
}

/**
 * Clean up stale SSE controllers that have exceeded TTL
 * Returns the number of controllers cleaned up
 */
export function cleanupStaleSseControllers(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [operationId, entry] of sseControllers.entries()) {
    const age = now - entry.createdAt;
    if (age > CONTROLLER_TTL_MS) {
      clearInterval(entry.keepaliveInterval);
      try {
        entry.controller.close();
      } catch {
        // Already closed
      }
      sseControllers.delete(operationId);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================================================
// Route Handlers
// ============================================================================

const progressRoutes = new Hono();

// Auth middleware
progressRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" }
    });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /api/operations/:operationId/progress - Get progress for an operation
progressRoutes.get("/:operationId/progress", async (c) => {
  const auth = c.get("auth");
  const operationId = c.req.param("operationId");

  // Check for SSE request
  const acceptHeader = c.req.header("accept");
  const isSseRequest = acceptHeader?.includes("text/event-stream");

  try {
    const progress = await getProgress(operationId, auth.companyId);

    if (!progress) {
      return errorResponse("NOT_FOUND", "Operation not found", 404);
    }

    const percentage = calculatePercentage(progress);
    const etaSeconds = calculateEta(progress);

    const responseData: ProgressResponse = {
      operationId: progress.operationId,
      total: progress.totalUnits,
      completed: progress.completedUnits,
      percentage,
      status: progress.status,
      etaSeconds,
      startedAt: toUtcIso.dateLike(progress.startedAt) as string,
      updatedAt: toUtcIso.dateLike(progress.updatedAt) as string,
      completedAt: toUtcIso.dateLike(progress.completedAt, { nullable: true }) as string,
      details: progress.details ?? undefined,
    };

    // Handle SSE
    if (isSseRequest) {
      return handleSseRequest(c, operationId, progress, responseData);
    }

    return successResponse(responseData);
  } catch (error) {
    console.error(`[progress] Error getting progress for operation ${operationId}:`, error);
    return errorResponse("INTERNAL_ERROR", "Failed to get operation progress", 500);
  }
});

// GET /api/operations - List all operations for the company
progressRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  // Parse query parameters
  const status = c.req.query("status") as OperationStatus | undefined;
  const type = c.req.query("type") as OperationType | undefined;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // Validate status if provided
  const validStatuses: OperationStatus[] = ["running", "completed", "failed", "cancelled"];
  if (status && !validStatuses.includes(status)) {
    return errorResponse(
      "INVALID_REQUEST",
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      400
    );
  }

  // Validate type if provided
  const validTypes: OperationType[] = ["import", "export", "batch_update"];
  if (type && !validTypes.includes(type)) {
    return errorResponse(
      "INVALID_REQUEST",
      `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      400
    );
  }

  try {
    const result = await listProgress(auth.companyId, {
      status,
      type,
      limit: Math.min(limit, 100), // Cap at 100
      offset,
    });

    // Transform to response format
    const operations = result.operations.map((op) => ({
      operationId: op.operationId,
      type: op.operationType,
      total: op.totalUnits,
      completed: op.completedUnits,
      percentage: calculatePercentage(op),
      status: op.status,
      etaSeconds: op.status === "running" ? calculateEta(op) : null,
      startedAt: toUtcIso.dateLike(op.startedAt) as string,
      updatedAt: toUtcIso.dateLike(op.updatedAt) as string,
      completedAt: toUtcIso.dateLike(op.completedAt, { nullable: true }) as string,
    }));

    return successResponse({
      operations,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[progress] Error listing operations:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to list operations", 500);
  }
});

// ============================================================================
// SSE Handler
// ============================================================================

/**
 * Handle Server-Sent Events (SSE) request for real-time progress updates
 */
async function handleSseRequest(
  c: any,
  operationId: string,
  initialProgress: any,
  responseData: ProgressResponse
): Promise<Response> {
  // Set SSE headers
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  let isConnected = true;
  let pollInterval: NodeJS.Timeout | null = null;
  let keepalive: NodeJS.Timeout | null = null;

  // Cleanup function to properly tear down all intervals and controller
  const cleanup = () => {
    isConnected = false;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    unregisterSseController(operationId);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Set up keepalive interval first (before registering)
      keepalive = setInterval(() => {
        if (!isConnected) {
          if (keepalive) clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          if (keepalive) clearInterval(keepalive);
          cleanup();
        }
      }, SSE_KEEPALIVE_INTERVAL_MS);

      // Register controller with its keepalive interval
      registerSseController(operationId, controller, keepalive!);

      // Send initial progress
      const initialData = `data: ${JSON.stringify(responseData)}\n\n`;
      controller.enqueue(new TextEncoder().encode(initialData));

      // Set up polling for updates
      pollInterval = setInterval(async () => {
        if (!isConnected) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }

        try {
          const progress = await getProgress(operationId, c.get("auth").companyId);
          if (!progress) {
            // Operation was deleted
            const endData = `data: ${JSON.stringify({ type: "operation_deleted" })}\n\n`;
            controller.enqueue(new TextEncoder().encode(endData));
            controller.close();
            cleanup();
            return;
          }

          const percentage = calculatePercentage(progress);
          const etaSeconds = calculateEta(progress);

          const update: ProgressResponse = {
            operationId: progress.operationId,
            total: progress.totalUnits,
            completed: progress.completedUnits,
            percentage,
            status: progress.status,
            etaSeconds,
            startedAt: toUtcIso.dateLike(progress.startedAt) as string,
            updatedAt: toUtcIso.dateLike(progress.updatedAt) as string,
            completedAt: toUtcIso.dateLike(progress.completedAt, { nullable: true }) as string,
            details: progress.details ?? undefined,
          };

          const data = `data: ${JSON.stringify(update)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));

          // Close stream when operation completes
          if (progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled") {
            // Send final update
            const finalData = `data: ${JSON.stringify({ ...update, type: "operation_ended" })}\n\n`;
            controller.enqueue(new TextEncoder().encode(finalData));
            controller.close();
            cleanup();
          }
        } catch (error) {
          console.error(`[progress] SSE poll error for ${operationId}:`, error);
        }
      }, SSE_POLL_INTERVAL_MS);

      // Handle client abort/disconnect
      if (c.req.raw.signal) {
        c.req.raw.signal.addEventListener("abort", () => {
          cleanup();
        });
      }
    },
    cancel() {
      // Connection closed by client
      cleanup();
    },
  });

  return new Response(stream, {
    headers,
  });
}

export { progressRoutes };
export { SSE_POLL_INTERVAL_MS, SSE_KEEPALIVE_INTERVAL_MS };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Operation progress response schema
 */
const OperationProgressSchema = zodOpenApi.object({
  operationId: zodOpenApi.string(),
  total: zodOpenApi.number(),
  completed: zodOpenApi.number(),
  percentage: zodOpenApi.number(),
  status: zodOpenApi.string(),
  etaSeconds: zodOpenApi.number().nullable(),
  startedAt: zodOpenApi.string(),
  updatedAt: zodOpenApi.string(),
  completedAt: zodOpenApi.string().nullable(),
}).openapi("OperationProgress");

/**
 * Registers progress routes with an OpenAPIHono instance.
 */
export function registerProgressRoutes(app: OpenAPIHono): void {
  // GET /api/operations/:operationId/progress - Get progress for an operation
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operations/{operationId}/progress",
      operationId: "getOperationProgress",
      summary: "Get operation progress",
      description: "Get progress for a long-running operation with optional SSE.",
      tags: ["Progress"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          operationId: zodOpenApi.string().openapi({ description: "Operation ID" }),
        }),
      },
      responses: {
        200: {
          description: "Operation progress",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: OperationProgressSchema,
              }).openapi("GetOperationProgressResponse"),
            },
          },
        },
        404: { description: "Operation not found" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const operationId = c.req.param("operationId");

      try {
        const progress = await getProgress(operationId, auth.companyId);
        if (!progress) return errorResponse("NOT_FOUND", "Operation not found", 404);

        const percentage = calculatePercentage(progress);
        const etaSeconds = calculateEta(progress);

        return successResponse({
          operationId: progress.operationId,
          total: progress.totalUnits,
          completed: progress.completedUnits,
          percentage,
          status: progress.status,
          etaSeconds,
          startedAt: toUtcIso.dateLike(progress.startedAt) as string,
          updatedAt: toUtcIso.dateLike(progress.updatedAt) as string,
          completedAt: toUtcIso.dateLike(progress.completedAt, { nullable: true }) as string,
          details: progress.details ?? undefined,
        });
      } catch (error) {
        console.error(`[progress] Error getting progress for operation ${operationId}:`, error);
        return errorResponse("INTERNAL_ERROR", "Failed to get operation progress", 500);
      }
    }
  );

  // GET /api/operations - List all operations
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operations",
      operationId: "listOperations",
      summary: "List operations",
      description: "List all long-running operations for the company.",
      tags: ["Progress"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          status: zodOpenApi.string().optional().openapi({ description: "Status filter" }),
          type: zodOpenApi.string().optional().openapi({ description: "Type filter" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Limit" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset" }),
        }),
      },
      responses: {
        200: {
          description: "List of operations",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  operations: zodOpenApi.array(OperationProgressSchema),
                  total: zodOpenApi.number(),
                  limit: zodOpenApi.number(),
                  offset: zodOpenApi.number(),
                }).openapi("ListOperationsResponse"),
              }),
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");

      const status = c.req.query("status") as OperationStatus | undefined;
      const type = c.req.query("type") as OperationType | undefined;
      const limit = parseInt(c.req.query("limit") ?? "50", 10);
      const offset = parseInt(c.req.query("offset") ?? "0", 10);

      const validStatuses: OperationStatus[] = ["running", "completed", "failed", "cancelled"];
      if (status && !validStatuses.includes(status)) {
        return errorResponse("INVALID_REQUEST", `Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
      }

      const validTypes: OperationType[] = ["import", "export", "batch_update"];
      if (type && !validTypes.includes(type)) {
        return errorResponse("INVALID_REQUEST", `Invalid type. Must be one of: ${validTypes.join(", ")}`, 400);
      }

      try {
        const result = await listProgress(auth.companyId, {
          status,
          type,
          limit: Math.min(limit, 100),
          offset,
        });

        const operations = result.operations.map((op) => ({
          operationId: op.operationId,
          type: op.operationType,
          total: op.totalUnits,
          completed: op.completedUnits,
          percentage: calculatePercentage(op),
          status: op.status,
          etaSeconds: op.status === "running" ? calculateEta(op) : null,
          startedAt: toUtcIso.dateLike(op.startedAt) as string,
          updatedAt: toUtcIso.dateLike(op.updatedAt) as string,
          completedAt: toUtcIso.dateLike(op.completedAt, { nullable: true }) as string,
        }));

        return successResponse({ operations, total: result.total, limit, offset });
      } catch (error) {
        console.error("[progress] Error listing operations:", error);
        return errorResponse("INTERNAL_ERROR", "Failed to list operations", 500);
      }
    }
  );
}
