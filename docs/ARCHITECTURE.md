# Architecture

Jurnapod system design principles and architecture.

---

## Core Principles

### 1. Accounting/GL at the Center

All final business documents must reconcile to journal effects:
- Sales invoices → journal entries
- POS transactions → journal entries
- Payments → journal entries
- Purchases → journal entries

**Invariant:** The General Ledger is the single source of truth for financial state.

### 2. Idempotent Sync

POS sync uses `client_tx_id` (UUID v4) to prevent duplicate entries:

```
POS Local → API Server (via client_tx_id) → Database (UNIQUE constraint)
```

**Guarantees:**
- Network retries are safe
- Duplicate payloads don't create duplicate financial effects
- Explicit outcomes: `OK`, `DUPLICATE`, `ERROR`

### 3. Offline-First POS

Write locally first, sync via outbox pattern:

```
User Action → Local IndexedDB → Outbox Queue → Background Sync → API
```

**States:**
- `PENDING`: Queued for sync
- `SENT`: Sync in progress
- `FAILED`: Retry needed
- Transactions remain usable offline

### 4. Multi-Tenant Isolation

All operational data enforces tenant scoping:
- `company_id`: Company-level isolation
- `outlet_id`: Outlet-level isolation (when applicable)

**Database constraints enforce this at every level.**

### 5. Immutable Financial Records

Finalized records use correction flows instead of mutation:
- `DRAFT → POSTED → VOID` (not edit)
- POS: `COMPLETED → VOID/REFUND` (not delete)

**Auditability over convenience.**

---

## Document Status Flow

### Sales Invoices

```
DRAFT → POSTED → VOID
```

### POS Transactions

```
COMPLETED → VOID
COMPLETED → REFUND
```

### Payments

```
DRAFT → POSTED → VOID
```

---

## Module Architecture

### Module Enablement

- Per-company configuration in `modules` + `company_modules`
- Module configs store payment methods, posting rules, etc.
- Settings cascade: company-level → outlet-level

### Available Modules

| Module | Required | Purpose |
|--------|----------|---------|
| **platform** | ✅ Yes | Auth, organization, outlets, audit, numbering |
| **accounting** | ✅ Yes | Chart of accounts, journal posting, reports |
| **sales** | ❌ Optional | Service invoices, payments, light AR |
| **pos** | ❌ Optional | Offline-first transaction sync, posting rules |
| **inventory** | ❌ Optional | Stock movements, recipes, BOM |
| **purchasing** | ❌ Optional | PO, GRN, AP |

---

## Technology Stack

### Frontend

- **Framework**: React 18
- **Build**: Vite 5
- **State**: Local state + context
- **Offline**: IndexedDB (Dexie)
- **PWA**: Service workers, manifest
- **UI**: Mantine (Backoffice), Ionic (POS)

### Backend

- **Runtime**: Node.js 20.x
- **Framework**: Hono (replaces Next.js)
- **Validation**: Zod schemas
- **Database Driver**: mysql2

### Database

- **Engine**: MySQL 8.0.44 / MariaDB
- **Storage**: InnoDB (required)
- **Money**: `DECIMAL(18,2)` - never FLOAT/DOUBLE
- **Collation**: `utf8mb4_uca1400_ai_ci`

### Type Safety

- **Shared contracts**: `packages/shared` with Zod schemas
- **Type generation**: TypeScript from Zod
- **Validation**: Runtime via Zod at API boundaries

---

## Data Flow

### POS Transaction Flow

```
1. User creates transaction (offline)
   ↓
2. Store in IndexedDB with client_tx_id
   ↓
3. Add to outbox queue (PENDING)
   ↓
4. Background sync when online
   ↓
5. POST /api/sync/push (idempotent)
   ↓
6. Server validates, deduplicates, posts to GL
   ↓
7. Response: {status: "OK", transaction_id: 123}
   ↓
8. Update local record with server ID
```

### Sales Invoice Flow

```
1. Create draft invoice (DRAFT status)
   ↓
2. Edit lines, customer, terms
   ↓
3. POST /api/sales/invoices/:id/post
   ↓
4. Server creates journal entries
   ↓
5. Update invoice status (POSTED)
   ↓
6. Generate PDF receipt
```

---

## Security Model

### Authentication

- **Algorithm**: JWT (access + refresh tokens)
- **Access token TTL**: 1 hour (configurable)
- **Refresh token TTL**: 30 days (configurable)
- **Password hashing**: Argon2id (default), bcrypt (legacy)

### Authorization (RBAC)

**Role hierarchy:**
```
SUPER_ADMIN (platform-wide)
  ↓
OWNER (company-level)
  ↓
ADMIN (company-level)
  ↓
ACCOUNTANT (company-level)
  ↓
CASHIER (outlet-level)
```

**Scoping:**
- `SUPER_ADMIN`: Platform-wide access
- `OWNER/ADMIN/ACCOUNTANT`: Company-scoped
- `CASHIER`: Outlet-scoped

### Audit Logging

All critical operations logged to `audit_logs`:
- User actions
- Financial posting
- Settings changes
- Role assignments

**Fields:**
- `user_id`, `company_id`, `outlet_id`
- `entity_type`, `entity_id`
- `action`, `details`
- `success` (canonical), `result` (display)

---

## Constraints & Invariants

### Database Constraints

1. **Uniqueness**: `client_tx_id` (POS sync idempotency)
2. **Foreign keys**: Enforce referential integrity
3. **Check constraints**: Validate monetary values, JSON fields
4. **Tenant scoping**: Composite FKs enforce `company_id` + `outlet_id`

### Business Invariants

1. **Balanced journals**: Debits = Credits (enforced on insert)
2. **Immutable posting**: POSTED records cannot be edited
3. **Tenant isolation**: No cross-company data access
4. **Idempotent sync**: Duplicate `client_tx_id` returns `DUPLICATE`

---

## Item Types Taxonomy

| Type | Purpose | Stock Tracking |
|------|---------|----------------|
| **SERVICE** | Non-tangible offerings | Never |
| **PRODUCT** | Finished goods | Optional (inventory level 1+) |
| **INGREDIENT** | Raw materials | Yes (inventory level 1+) |
| **RECIPE** | Bill of Materials | Never (template only) |

**See:** [ADR-0002: Item Types Taxonomy](adr/ADR-0002-item-types-taxonomy.md)

---

## Performance Considerations

### Database Indexes

Critical indexes for performance:
- `(company_id, outlet_id)` on operational tables
- `(company_id, date)` on financial tables
- `(account_id, company_id, date)` for GL queries
- `client_tx_id` unique index (POS sync)

### Caching Strategy

- **Master data**: Cached in POS IndexedDB
- **Reports**: Consider TTL-based caching
- **User sessions**: In-memory or Redis (for multi-instance)

### Query Optimization

- Use compound indexes for tenant-scoped queries
- Avoid N+1 queries (use JOINs or batching)
- Date range filters should use indexes

---

## Deployment Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   API       │────▶│   MySQL     │
│  (Reverse   │     │  (Node.js)  │     │  Database   │
│   Proxy)    │     └─────────────┘     └─────────────┘
└─────────────┘
      │
      ├──▶ /pos        → Static files (PWA)
      ├──▶ /backoffice → Static files (SPA)
      └──▶ /api        → Proxy to API server
```

**See:** [Production Deployment](PRODUCTION.md)

---

## Testing Strategy

### Unit Tests

- Business logic in `packages/`
- Database operations with cleanup
- **CRITICAL**: Always close database pools in tests

### Integration Tests

- Full HTTP request/response cycle
- API-driven fixture setup
- Read-only DB verification

### E2E Tests

- POS PWA workflows (Playwright)
- Lighthouse CI for performance
- Offline behavior verification

---

## Additional Resources

- [Development Guide](DEVELOPMENT.md)
- [API Reference](API.md)
- [AGENTS.md](../AGENTS.md) - Development guidelines
- [ADRs](adr/) - Architecture Decision Records

