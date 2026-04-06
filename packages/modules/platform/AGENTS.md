# AGENTS.md — @jurnapod/modules-platform

## Package Purpose

Platform foundation for Jurnapod ERP — organization management, outlets, audit logging, feature flags, and module enablement.

**Core Capabilities:**
- **Organization management**: Companies, outlets, organizational hierarchy
- **Audit logging**: Queryable audit trails for compliance
- **Feature flags**: Module and feature enablement per company/outlet
- **Settings management**: Company and outlet configuration

**Boundaries:**
- ✅ In: Organization CRUD, audit query, feature flags, settings management
- ❌ Out: Authentication (modules-auth), user management (modules-auth)

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Audit Query

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
```

### Feature Flags

```typescript
import { isFeatureEnabled } from '@jurnapod/modules-platform/feature-flags';

const enabled = await isFeatureEnabled(db, {
  companyId: 1,
  module: 'inventory',
  feature: 'stock_count',
  outletId: 1
});
```

### Settings Management

```typescript
import { SettingsService } from '@jurnapod/modules-platform/settings';

const settings = new SettingsService(db);

// Get company settings
const companySettings = await settings.getCompanySettings(1);

// Update settings (encrypted values)
await settings.updateSettings(1, {
  defaultTaxRate: 0.10,
  timezone: 'Asia/Jakarta',
  currency: 'IDR'
});
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| AuditService | `audit/index.ts` | Audit logging and query |
| AuditQuery | `audit/query.ts` | Audit log queries |
| Settings | `settings/index.ts` | Settings management |
| FeatureFlags | `feature-flags/index.ts` | Module/feature enablement |

### SettingsPort Architecture

The package provides a typed, cached settings access layer for module packages via `SettingsPort`.

**Architecture:**
```
Module Packages → SettingsPort → Typed Tables + Legacy Fallback + Cache
```

**Key files:**
- `settings/port.ts` — Interface definition
- `settings/adapter.ts` — Kysely implementation with dual-read
- `settings/cache.ts` — 30-second TTL LRU cache

**Usage:**

```typescript
import { createSettingsPort } from '@jurnapod/modules-platform/settings';

const settings = createSettingsPort(db);

// Get typed setting
const costingMethod = await settings.get(
  'inventory.costing_method',
  companyId,
  { outletId }
);

// Resolve with defaults (outlet → company → registry default)
const allowMultipleOpen = await settings.resolve(
  companyId,
  'accounting.allow_multiple_open_fiscal_years',
  { outletId, defaultValue: false }
);
```

**Dual-Read Pattern:**
1. Query typed tables (`settings_strings`, `settings_numbers`, `settings_booleans`)
2. Fall back to legacy `company_settings` table
3. Lazy-migrate legacy values to typed tables on read
4. Return typed value from `SETTINGS_REGISTRY` default if not found

**Cascade Resolution:**
- Outlet-specific value (if `outletId` provided)
- Company-wide fallback (if no outlet override)
- Registry default (from `SETTINGS_REGISTRY`)

### File Structure

```
packages/modules/platform/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── audit/
│   │   ├── index.ts               # AuditService exports
│   │   ├── query.ts               # Audit query logic
│   │   └── super-admin.ts         # Super admin audit access
│   │
│   ├── settings/
│   │   ├── index.ts               # Settings exports
│   │   ├── port.ts                # SettingsPort interface (NEW)
│   │   ├── adapter.ts             # Kysely adapter (NEW)
│   │   ├── cache.ts               # Cache layer (NEW)
│   │   └── encryption.ts          # Encrypted settings
│   │
│   └── feature-flags/
│       └── index.ts               # Feature flag logic
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance)
2. **Export from `index.ts`** for public API
3. **Use Kysely query builder** — never raw SQL

### Audit Logging Rules

1. **Log all significant actions** — creates, updates, deletes, important reads
2. **Include relevant context** — user, outlet, company, IP if available
3. **Never log sensitive data** — passwords, tokens, card numbers

---

## Review Checklist

When modifying this package:

- [ ] Audit logs capture all significant events
- [ ] No sensitive data in audit logs (PII redacted)
- [ ] Feature flag checks applied consistently
- [ ] Settings properly encrypted for sensitive values
- [ ] Kysely query builder used (not raw SQL)
- [ ] Company/outlet/user scoping on all queries

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/auth` — Authentication (boundary)

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

- Any code path that reads/writes SQL tables must be validated with a real database.
- Use integration tests for DB-backed behavior; do not claim correctness with stubbed/mocked DB executors.
- Always close/destroy DB clients/pools in teardown to avoid hanging test processes.

For project-wide conventions, see root `AGENTS.md`.
