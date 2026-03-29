# @jurnapod/sync-core

Shared sync infrastructure for Jurnapod ERP - provides the module registry, authentication, audit logging, transport, and idempotency services.

## Overview

The `@jurnapod/sync-core` package provides:

- **SyncModuleRegistry**: Central registry for sync modules with factory pattern
- **SyncAuthenticator**: Token validation and role-based access
- **SyncAuditor**: Audit logging for all sync operations
- **RetryTransport**: HTTP client with exponential backoff
- **SyncIdempotencyService**: Duplicate detection and prevention
- **Tier-based versioning**: MASTER/OPERATIONAL/REALTIME tier sync
- **WebSocket support**: Event publishing for real-time notifications
- **Data retention jobs**: Automatic cleanup of old sync data
- **Shared data queries**: SQL queries used by pos-sync and backoffice-sync

## Installation

```bash
npm install @jurnapod/sync-core
```

## Quick Start

### Creating a Sync Module

```typescript
import type { SyncModule, SyncModuleConfig, SyncModuleInitContext } from "@jurnapod/sync-core";
import type { PullSyncParams, PullSyncResult } from "./pull/types.js";
import type { PushSyncParams, PushSyncResult } from "./push/types.js";

export class MySyncModule implements SyncModule {
  readonly moduleId = "my-module";
  readonly clientType = "POS";
  readonly endpoints = [];
  
  constructor(public config: SyncModuleConfig) {}

  async initialize(context: SyncModuleInitContext): Promise<void> {
    // Set up database connection, cache, etc.
  }

  async handlePullSync(params: PullSyncParams): Promise<PullSyncResult> {
    // Fetch data for POS
  }

  async handlePushSync(params: PushSyncParams): Promise<PushSyncResult> {
    // Receive data from POS
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }

  async cleanup(): Promise<void> {
    // Release resources
  }
}
```

### Registering Modules

```typescript
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { MySyncModule } from "./my-sync-module.js";

// Register with factory (recommended for lazy loading)
syncModuleRegistry.registerFactory('my-module', (config) => new MySyncModule(config));

// Create and initialize module
const module = await syncModuleRegistry.createModule('my-module', {
  module_id: 'my-module',
  client_type: 'POS',
  enabled: true,
});

// Initialize all registered modules at once
await syncModuleRegistry.initialize({
  database: dbConn,
  logger: console,
  config: { env: 'production' }
});

// Health check all modules
const health = await syncModuleRegistry.healthCheck();
```

## Architecture

### Sync Tiers

Data syncs at different frequencies based on change rate:

| Tier | Description | Typical Frequency |
|------|-------------|------------------|
| **REALTIME** | Critical operations | WebSocket/SSE |
| **OPERATIONAL** | High-frequency data | 30s-2min |
| **MASTER** | Core reference data | 5-10min |
| **ADMIN** | Configuration | 30min-daily |
| **ANALYTICS** | Reporting | Hourly-daily |

### Client Types

- **POS**: Lightweight, operation-focused, offline-first
- **BACKOFFICE**: Comprehensive, audit-focused, rich metadata

## Core Components

### Module Registry

```typescript
// Singleton instance
import { syncModuleRegistry } from "@jurnapod/sync-core";

// Register module factory
syncModuleRegistry.registerFactory('pos', (config) => new PosSyncModule(config));

// Create module instance
const posModule = await syncModuleRegistry.createModule('pos', config);

// List all modules
const moduleIds = syncModuleRegistry.listModuleIds();

// Get all endpoints
const endpoints = syncModuleRegistry.getAllEndpoints();

// Health check
const health = await syncModuleRegistry.healthCheck();
```

### Authentication

```typescript
import { syncAuthenticator } from "@jurnapod/sync-core";

const authResult = await syncAuthenticator.authenticate({
  token: 'jwt-token',
  requiredRole: 'cashier'
});

if (!authResult.valid) {
  throw new UnauthorizedError(authResult.reason);
}
```

### Audit Logging

```typescript
import { syncAuditor } from "@jurnapod/sync-core";

await syncAuditor.logEvent({
  company_id: 1,
  outlet_id: 1,
  user_id: 5,
  module_id: 'pos',
  tier: 'MASTER',
  operation: 'PULL',
  request_id: 'uuid',
  status: 'SUCCESS',
  metadata: { duration_ms: 45, records_affected: 120 }
});
```

### Idempotency Service

```typescript
import { syncIdempotencyService, ERROR_CLASSIFICATION } from "@jurnapod/sync-core";

// Check if operation was already processed
const check = await syncIdempotencyService.checkAndRecord({
  operationId: 'tx-123',
  companyId: 1,
  operation: 'PUSH',
  payload: JSON.stringify(data)
});

if (check.alreadyProcessed) {
  return check.existingResult;
}

// Classify errors for retry decisions
const classification = ERROR_CLASSIFICATION.classify(error);
if (classification.retryable) {
  // Retry with backoff
}
```

### Retry Transport

```typescript
import { defaultRetryTransport } from "@jurnapod/sync-core";

const response = await defaultRetryTransport.execute({
  url: 'https://api.example.com/sync',
  method: 'POST',
  body: JSON.stringify(data),
  timeout: 30000
}, {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2
});
```

## Data Queries

Shared SQL queries for sync operations:

```typescript
import { getVariantsForSync, getVariantPricesForOutlet } from "@jurnapod/sync-core";

// Get all variants for a company
const variants = await getVariantsForSync(db, companyId);

// Get variant prices for a specific outlet
const prices = await getVariantPricesForOutlet(db, companyId, outletId);
```

Available query functions:
- `getVariantsForSync`, `getVariantsChangedSince`
- `getVariantPricesForOutlet`
- `getItemsForSync`, `getItemsChangedSince`
- `getOrdersForSync`, `getOrderUpdatesForSync`
- `getTransactionsForSync`
- And more in `src/data/`

## SyncContext

Every sync request carries context:

```typescript
interface SyncContext {
  company_id: number;
  outlet_id?: number;
  user_id?: number;
  client_type: 'POS' | 'BACKOFFICE';
  request_id: string;  // UUID
  timestamp: string;   // ISO 8601
}
```

## File Structure

```
packages/sync-core/
├── src/
│   ├── index.ts                    # Main exports
│   ├── registry/                   # Module registry
│   ├── auth/                       # Authentication
│   ├── audit/                      # Audit logging
│   ├── transport/                  # HTTP transport with retry
│   ├── idempotency/                 # Idempotency service
│   ├── data/                       # Shared SQL queries
│   ├── websocket/                  # WebSocket support
│   ├── jobs/                       # Background jobs
│   └── types/                      # TypeScript types
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

## Testing

```bash
# Run all tests
npm test -w @jurnapod/sync-core

# Run once (CI mode)
npm run test:run -w @jurnapod/sync-core
```

## Related Packages

- [@jurnapod/pos-sync](../pos-sync) - POS-specific sync module
- [@jurnapod/db](../db) - Database connectivity
- [@jurnapod/api](../../apps/api) - HTTP API using this package
- [@jurnapod/shared](../shared) - Shared utilities