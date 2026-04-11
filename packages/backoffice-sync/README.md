# @jurnapod/backoffice-sync

Backoffice sync module for Jurnapod ERP - handles comprehensive data synchronization for backoffice dashboard, analytics, and administrative operations.

## Overview

The `@jurnapod/backoffice-sync` package provides:

- **Tier-based sync**: REALTIME, OPERATIONAL, MASTER, ADMIN, and ANALYTICS tiers
- **Dashboard data**: Live sales metrics, staff activity, system alerts
- **Business intelligence**: Sales analytics, financial reports, reconciliation data
- **Administrative sync**: Company settings, outlets, users, tax settings
- **Batch processing**: Background job queue for heavy operations
- **Export scheduling**: Automated report generation and export

## Installation

```bash
npm install @jurnapod/backoffice-sync
```

## Quick Start

```typescript
import { BackofficeSyncModule } from '@jurnapod/backoffice-sync';
import { createDbPool, DbConn } from '@jurnapod/db';

// Create database connection
const pool = createDbPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const db = new DbConn(pool);

// Create and initialize module
const module = new BackofficeSyncModule({
  module_id: 'backoffice',
  client_type: 'BACKOFFICE',
  enabled: true,
});

await module.initialize({
  database: db,
  logger: console,
  config: { env: 'production' },
});
```

## Sync Tiers

Data syncs at different frequencies based on change rate and importance:

| Tier | Description | Typical Frequency |
|------|-------------|-------------------|
| **REALTIME** | Live dashboard metrics | WebSocket/SSE |
| **OPERATIONAL** | Recent transactions, alerts | 30s-2min |
| **MASTER** | Items, customers, suppliers, accounts | 5-10min |
| **ADMIN** | Users, outlets, tax settings | 30min-daily |
| **ANALYTICS** | Reports, reconciliation | Hourly-daily |

## Data Types

### Realtime Data
```typescript
interface BackofficeRealtimeData {
  live_sales_metrics: {
    total_sales_today: number;
    transaction_count_today: number;
    active_orders_count: number;
    occupied_tables_count: number;
    revenue_this_hour: number;
    avg_transaction_value: number;
    last_updated: string;
  };
  system_alerts: SystemAlert[];
  staff_activity: StaffActivity[];
}
```

### Analytics Data
```typescript
interface BackofficeAnalyticsData {
  financial_reports: FinancialReport[];
  sales_analytics: SalesAnalytics;
  audit_logs: AuditLog[];
  reconciliation_data: Reconciliation[];
}
```

## Architecture

```
packages/backoffice-sync/
├── src/
│   ├── index.ts                          # Main exports
│   ├── backoffice-sync-module.ts         # Main module class
│   ├── core/
│   │   └── backoffice-data-service.ts   # Database queries
│   ├── batch/
│   │   └── batch-processor.ts           # Background job processing
│   ├── scheduler/
│   │   ├── index.ts
│   │   └── export-scheduler.ts          # Report export scheduling
│   ├── endpoints/
│   │   └── backoffice-sync-endpoints.ts # HTTP endpoint factory
│   ├── events/
│   │   └── websocket-publisher.ts       # WebSocket event publishing
│   └── types/
│       └── backoffice-data.ts           # Zod schemas and types
```

## Testing

```bash
# Run integration tests (requires database)
npm test -w @jurnapod/backoffice-sync

# Run once
npm run test:run -w @jurnapod/backoffice-sync
```

**Note**: Integration tests require a real database. Set up `.env` with database credentials:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jurnapod
```

## Related Packages

- [@jurnapod/sync-core](../sync-core) - Sync infrastructure and module interface
- [@jurnapod/db](../db) - Database connectivity
- [@jurnapod/api](../../apps/api) - HTTP API using this module