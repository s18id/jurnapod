# @jurnapod/modules-platform

Platform foundation for Jurnapod ERP — organization management, outlets, audit logging, feature flags, and settings.

## Overview

The `@jurnapod/modules-platform` package provides:

- **Organization management** — Companies and outlets hierarchy
- **Audit logging** — Queryable audit trails for compliance
- **Feature flags** — Module and feature enablement per company/outlet
- **Settings management** — Company and outlet configuration
- **Sync audit** — Audit data for backoffice sync

## Installation

```bash
npm install @jurnapod/modules-platform
```

## Usage

### Audit Logging

```typescript
import { AuditService } from '@jurnapod/modules-platform/audit';

const auditService = new AuditService(db);

// Query audit logs
const logs = await auditService.query({
  companyId: 1,
  outletId: 1,
  userId: 5,
  action: 'ORDER_CREATED',
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31'),
  limit: 100
});

// Super admin can query across companies
const allLogs = await auditService.queryAsSuperAdmin({
  companyId: 1,
  actions: ['ORDER_CREATED', 'ORDER_VOIDED'],
  limit: 1000
});
```

### Feature Flags

```typescript
import { 
  isFeatureEnabled,
  enableModule,
  disableModule 
} from '@jurnapod/modules-platform/feature-flags';

// Check if feature is enabled
const hasInventory = await isFeatureEnabled(db, {
  companyId: 1,
  module: 'inventory',
  feature: 'stock_count',
  outletId: 1
});

// Enable a module
await enableModule(db, {
  companyId: 1,
  module: 'inventory',
  outletId: 1
});
```

### Settings Management

```typescript
import { SettingsService } from '@jurnapod/modules-platform/settings';

const settings = new SettingsService(db);

// Get company settings
const companySettings = await settings.getCompanySettings(1);
// {
//   defaultTaxRate: 0.10,
//   timezone: 'Asia/Jakarta',
//   currency: 'IDR',
//   // ...
// }

// Update settings
await settings.updateSettings(1, {
  defaultTaxRate: 0.11,
  timezone: 'Asia/Makassar'
});

// Get encrypted setting (auto-decrypted)
const apiKey = await settings.getEncrypted(companyId, 'api_key');
```

## SettingsPort

The SettingsPort provides typed, cached settings access with cascade resolution.

```typescript
import { createSettingsPort } from '@jurnapod/modules-platform/settings';

const settings = createSettingsPort(db);

// Get a setting with outlet override
const method = await settings.get(
  'inventory.costing_method',
  companyId,
  { outletId: 1 }
);

// Resolve with full cascade (outlet → company → default)
const value = await settings.resolve(
  companyId,
  'accounting.allow_multiple_open_fiscal_years',
  { outletId: 1, defaultValue: false }
);
```

### Settings Resolution Order

1. **Outlet-specific** — `outlet_id = {outletId}` (if outletId provided)
2. **Company-wide** — `outlet_id IS NULL`
3. **Registry default** — From `SETTINGS_REGISTRY`

### Caching

Settings are cached for 30 seconds to reduce database hits. Cache is automatically invalidated on updates.

## Audit Actions

| Action | Description |
|--------|-------------|
| `ORDER_CREATED` | New order placed |
| `ORDER_UPDATED` | Order modified |
| `ORDER_VOIDED` | Order voided |
| `ORDER_REFUNDED` | Order refunded |
| `PAYMENT_RECEIVED` | Payment recorded |
| `INVENTORY_ADJUSTED` | Stock adjustment |
| `USER_LOGIN` | User login |
| `USER_LOGOUT` | User logout |

## Architecture

```
packages/modules-platform/
├── src/
│   ├── index.ts                    # Main exports
│   ├── audit/                      # Audit logging
│   ├── settings/                   # Settings management
│   ├── feature-flags/              # Feature flags
│   └── sync/                       # Sync audit
```

## Related Packages

- [@jurnapod/auth](../../packages/auth) - Authentication
- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Shared schemas