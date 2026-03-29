// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncRequest, 
  SyncResponse, 
  SyncEndpointConfig, 
  SyncContext,
  SyncModuleConfig
} from "./index.js";

// Sync handler function type
export type SyncHandler = (
  request: SyncRequest,
  context: SyncContext
) => Promise<SyncResponse>;

// Auth configuration for endpoints
export interface AuthConfig {
  required: boolean;
  roles?: string[];
  permissions?: string[];
  outlet_scoped?: boolean;
}

// Sync endpoint with handler
export interface SyncEndpoint {
  readonly config: SyncEndpointConfig;
  readonly handler: SyncHandler;
  readonly auth: AuthConfig;
}

// Sync module interface
export interface SyncModule {
  readonly moduleId: string;
  readonly clientType: 'POS' | 'BACKOFFICE';
  readonly config: SyncModuleConfig;
  readonly endpoints: ReadonlyArray<SyncEndpoint>;

  /**
   * Initialize the module with context
   */
  initialize(context: SyncModuleInitContext): Promise<void>;

  /**
   * Health check for the module
   */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;
}

// Module initialization context
export interface SyncModuleInitContext {
  database: any; // Database connection pool
  logger: any;   // Logger instance
  config: Record<string, any>; // Environment config
  cache?: any;   // Optional cache instance
}

// Module factory function type
export type SyncModuleFactory = (config: SyncModuleConfig) => SyncModule;