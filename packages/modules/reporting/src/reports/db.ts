// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Database configuration for reporting module.
 * 
 * Reads database configuration from environment variables.
 * This is used internally by the reporting services.
 */

import { createKysely, getKysely, type KyselySchema } from "@jurnapod/db";
import type { DbPoolConfig } from "@jurnapod/db";

// Singleton instance
let dbInstance: KyselySchema | null = null;
let configKey: string | null = null;

/**
 * Get database configuration from environment variables.
 */
function getDbConfig(): DbPoolConfig {
  // Support DATABASE_URL format for convenience
  if (process.env.DATABASE_URL) {
    return { uri: process.env.DATABASE_URL };
  }

  // Fall back to individual env vars
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jurnapod',
  };
}

/**
 * Get or create the singleton database instance for the reporting module.
 * Uses getKysely under the hood for caching.
 */
export function getReportingDb(): KyselySchema {
  const config = getDbConfig();
  const key = config.uri || `${config.host}:${config.port}:${config.database}`;
  
  if (!dbInstance || configKey !== key) {
    dbInstance = getKysely(config);
    configKey = key;
  }
  
  return dbInstance;
}