# @jurnapod/shared

Cross-app contracts for Jurnapod ERP — shared TypeScript types, Zod schemas, and constants.

## Overview

The `@jurnapod/shared` package provides:

- **Zod schemas** for type-safe validation at all system boundaries
- **TypeScript types** derived from schemas for end-to-end type safety
- **Business constants** for controlled vocabularies
- **Temporal helpers** for date/time operations using JS Temporal polyfill

## Installation

```bash
npm install @jurnapod/shared
```

## Consumer Requirements (Monorepo)

When an app/package imports from `@jurnapod/shared`, ensure:

1. The consumer declares an explicit dependency in `package.json`
2. `@jurnapod/shared` is built before bundling consumers (especially Vite/PWA apps)

Example (Backoffice):

```json
{
  "dependencies": {
    "@jurnapod/shared": "0.3.0"
  },
  "scripts": {
    "prebuild": "npm run build -w @jurnapod/shared"
  }
}
```

## Usage

### Schema Validation

```typescript
import { 
  AccountSchema, 
  ItemSchema, 
  CompanySchema,
  type Account, 
  type Item 
} from '@jurnapod/shared';

// Validate data from API
const account = AccountSchema.parse(apiResponse);
const item = ItemSchema.parse(request.body);
```

### Type Inference

Types are derived from schemas:

```typescript
import { InvoiceSchema } from '@jurnapod/shared';

// type Invoice = z.infer<typeof InvoiceSchema>
const invoice: Invoice = {
  id: 'inv_123',
  companyId: 1,
  // ... fully typed
};
```

### Sync Contracts

```typescript
import { 
  PosSyncPullRequestSchema,
  PosSyncPullResponseSchema 
} from '@jurnapod/shared';

// Validate sync request
const pullParams = PosSyncPullRequestSchema.parse(query);

// Parse sync response
const pullResponse = PosSyncPullResponseSchema.parse(serverResponse);
```

## Schema Categories

### Platform Schemas
- `companies.ts` — Company/organization
- `outlets.ts` — Outlet/branch
- `users.ts` — User accounts
- `settings.ts` — Company settings

### Master Data Schemas
- `accounts.ts` — Chart of accounts
- `items.ts` — Items/products
- `customers.ts` — Customer records
- `suppliers.ts` — Supplier records

### Sales Schemas
- `sales.ts` — Invoices, payments
- `invoices.ts` — Invoice details
- `payments.ts` — Payment records
- `credit-notes.ts` — Credit notes

### Accounting Schemas
- `journals.ts` — Journal entries
- `posting.ts` — Posting rules
- `account-types.ts` — Account classification

### Reservation Schemas
- `reservations.ts` — Reservation records
- `table-reservation.ts` — Table bookings
- `reservation-groups.ts` — Reservation groups

### Sync Schemas
- `pos-sync.ts` — POS sync contracts
- `backoffice-sync.ts` — Backoffice sync contracts

## Constants

### Account Mapping Types

```typescript
import { ACCOUNT_MAPPING_TYPE } from '@jurnapod/shared';

ACCOUNT_MAPPING_TYPE.REVENUE     // 'REVENUE'
ACCOUNT_MAPPING_TYPE.AR          // 'AR'
ACCOUNT_MAPPING_TYPE.CASH        // 'CASH'
```

### Table States

```typescript
import { TABLE_STATE } from '@jurnapod/shared';

TABLE_STATE.VACANT    // 'VACANT'
TABLE_STATE.OCCUPIED  // 'OCCUPIED'
TABLE_STATE.RESERVED  // 'RESERVED'
```

## Canonical Permission Bits

The canonical permission bit values are documented here for reference. For the full ACL model, see [AGENTS.md](../../AGENTS.md#canonical-acl--permission-model-epic-39).

### Permission Bits

| Bit | Name | Value | Purpose |
|-----|------|-------|---------|
| 1 | READ | 1 | View data and records |
| 2 | CREATE | 2 | Create new records |
| 4 | UPDATE | 4 | Modify existing records |
| 8 | DELETE | 8 | Remove records |
| 16 | ANALYZE | 16 | Reports, dashboards, analytics |
| 32 | MANAGE | 32 | Setup, configuration, administration |

### Permission Masks

| Mask | Value | Binary | Permissions |
|------|-------|--------|-------------|
| READ | 1 | `0b000001` | View only |
| WRITE | 6 | `0b000110` | CREATE + UPDATE |
| CRUD | 15 | `0b001111` | READ + CREATE + UPDATE + DELETE |
| CRUDA | 31 | `0b011111` | CRUD + ANALYZE |
| CRUDAM | 63 | `0b111111` | Full permissions |

## Architecture

```
packages/shared/
├── src/
│   ├── index.ts                    # Main exports
│   ├── client.ts                   # Client-side helpers
│   ├── schemas/                    # Zod validation schemas
│   ├── constants/                  # Business constants
│   └── __tests__/                  # Schema tests
```

## Related Packages

- [@jurnapod/api](../../apps/api) - Uses shared schemas for API validation
- [@jurnapod/pos-sync](../../packages/pos-sync) - Uses shared schemas for sync
- [@jurnapod/modules/accounting](../../packages/modules/accounting) - Accounting domain

## Troubleshooting

### `Failed to resolve entry for package "@jurnapod/shared"`

Check these in order:

1. Consumer has explicit dependency (`"@jurnapod/shared": "0.3.0"`)
2. `@jurnapod/shared` build completed (`npm run build -w @jurnapod/shared`)
3. Re-run consumer build (`npm run build -w <consumer>`)
4. If needed, refresh lockfile from root (`npm install`)
