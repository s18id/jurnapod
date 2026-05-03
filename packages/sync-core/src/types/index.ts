// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { UtcIsoSchema } from "@jurnapod/shared";

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

// Sync endpoint tier types (formerly used for routing/rate-limiting)
export const SyncEndpointTypeSchema = z.enum([
  "REALTIME",
  "OPERATIONAL",
  "MASTER",
  "ADMIN",
  "ANALYTICS"
]);

// Context passed to sync modules
export const SyncContextSchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().optional(),
  user_id: z.number().int().positive().optional(),
  client_type: SyncClientTypeSchema,
  request_id: z.string().uuid(),
  timestamp: UtcIsoSchema
});

// Base sync request
export const SyncRequestSchema = z.object({
  operation: SyncOperationTypeSchema,
  since_version: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  context: SyncContextSchema
});

// Base sync response
export const SyncResponseSchema = z.object({
  success: z.boolean(),
  data_version: z.number().int().nonnegative().optional(),
  timestamp: UtcIsoSchema,
  next_cursor: z.string().optional(),
  has_more: z.boolean().default(false),
  error_message: z.string().optional()
});

// Sync endpoint configuration
export const SyncEndpointConfigSchema = z.object({
  path: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
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
  poll_interval_ms: z.number().int().positive().optional() // operational polling interval in milliseconds
});

// Service interface types
export type * from "./services.js";

// Type exports
export type SyncClientType = z.infer<typeof SyncClientTypeSchema>;
export type SyncOperationType = z.infer<typeof SyncOperationTypeSchema>;
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
export type SyncEndpointType = z.infer<typeof SyncEndpointTypeSchema>;
export type SyncContext = z.infer<typeof SyncContextSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type SyncEndpointConfig = z.infer<typeof SyncEndpointConfigSchema>;
export type SyncModuleConfig = z.infer<typeof SyncModuleConfigSchema>;