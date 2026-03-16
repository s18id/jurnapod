// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

// Sync tier definitions
export const SyncTierSchema = z.enum([
  "REALTIME",     // WebSocket/SSE - immediate updates
  "OPERATIONAL",  // High-frequency polling (30s-2min)
  "MASTER",       // Medium-frequency polling (5-10min)
  "ADMIN",        // Low-frequency polling (30min-daily)
  "ANALYTICS"     // Batch processing (hourly-daily)
]);

// Client types
export const SyncClientTypeSchema = z.enum([
  "POS",
  "BACKOFFICE"
]);

// Sync operation types
export const SyncOperationTypeSchema = z.enum([
  "PUSH",
  "PULL",
  "RECONCILE",
  "BATCH"
]);

// Sync status types
export const SyncStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "SUCCESS",
  "FAILED",
  "CANCELLED"
]);

// Context passed to sync modules
export const SyncContextSchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().optional(),
  user_id: z.number().int().positive().optional(),
  client_type: SyncClientTypeSchema,
  request_id: z.string().uuid(),
  timestamp: z.string().datetime()
});

// Base sync request
export const SyncRequestSchema = z.object({
  tier: SyncTierSchema,
  operation: SyncOperationTypeSchema,
  since_version: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  context: SyncContextSchema
});

// Base sync response
export const SyncResponseSchema = z.object({
  success: z.boolean(),
  data_version: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
  next_cursor: z.string().optional(),
  has_more: z.boolean().default(false),
  error_message: z.string().optional()
});

// Sync endpoint configuration
export const SyncEndpointConfigSchema = z.object({
  path: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  tier: SyncTierSchema,
  auth_required: z.boolean().default(true),
  rate_limit: z.object({
    requests: z.number().int().positive(),
    window_ms: z.number().int().positive()
  }).optional()
});

// Module configuration
export const SyncModuleConfigSchema = z.object({
  module_id: z.string().min(1),
  client_type: SyncClientTypeSchema,
  enabled: z.boolean().default(true),
  frequencies: z.object({
    realtime: z.union([z.literal("websocket"), z.literal("sse")]).optional(),
    operational: z.number().int().positive().optional(), // milliseconds
    master: z.number().int().positive().optional(),
    admin: z.union([z.number().int().positive(), z.literal("startup")]).optional(),
    analytics: z.union([z.number().int().positive(), z.literal("batch")]).optional()
  })
});

// Type exports
export type SyncTier = z.infer<typeof SyncTierSchema>;
export type SyncClientType = z.infer<typeof SyncClientTypeSchema>;
export type SyncOperationType = z.infer<typeof SyncOperationTypeSchema>;
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
export type SyncContext = z.infer<typeof SyncContextSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type SyncEndpointConfig = z.infer<typeof SyncEndpointConfigSchema>;
export type SyncModuleConfig = z.infer<typeof SyncModuleConfigSchema>;