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

## Performance Patterns

### Streaming Large Data

File parsing and generation use streaming for large datasets to prevent memory exhaustion:

**CSV/Excel Parsing (Import)**
- Files approaching 50MB limit use streaming parsers
- Memory usage stays under 20MB for 50MB files
- PapaParse CSV streaming for large files
- XLSX sheet-by-sheet processing for Excel

**Export Streaming**
- CSV exports >10,000 rows use HTTP streaming
- No Content-Length header (Transfer-Encoding: chunked)
- Async generator yields data chunks
- Client receives data as it's generated

**Example: Streaming CSV Export**
```typescript
async function* generateCSVStream(data, columns) {
  yield Buffer.from(headerRow, 'utf-8');
  for (const row of data) {
    yield Buffer.from(formatRow(row, columns) + '\n', 'utf-8');
  }
}

const stream = createReadableStream(generateCSVStream(data, columns));
return new Response(stream, { headers: { "Content-Type": "text/csv" } });
```

### Batch Validation

Foreign key and existence validation use batch queries to prevent N+1 patterns:

**Pattern: Single IN Clause Query**
```typescript
// ❌ N+1 Query Pattern (AVOID)
for (const row of rows) {
  const exists = await db.query("SELECT 1 FROM items WHERE id = ?", [row.item_id]);
}
// 1000 rows = 1000 queries

// ✅ Batch Query Pattern (USE)
const ids = rows.map(r => r.item_id);
const results = await db.query(
  "SELECT id FROM items WHERE company_id = ? AND id IN (?)",
  [companyId, ids]
);
const existsMap = new Map(results.map(r => [r.id, true]));
for (const row of rows) {
  const exists = existsMap.get(row.item_id);
}
// 1000 rows = 1 query
```

**Benefits:**
- O(1) lookup after single query
- Reduced database round trips
- Predictable memory usage
- Better performance at scale

**Usage in Codebase:**
- `batchValidateForeignKeys()` in `lib/import/validator.ts`
- Import validation (Story 7.6)
- Export data fetching

### Chunked Processing

Large datasets are processed in chunks to maintain responsiveness:

**Excel Generation**
- Datasets >10,000 rows create multiple sheets (10K per sheet)
- Hard limit of 50,000 rows for Excel (recommend CSV for larger)
- Prevents workbook corruption and memory issues

**Batch Operations**
- Import apply processes in chunks of 500 rows
- Each chunk is a separate transaction
- Partial failures don't lose all progress

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

- **Runtime**: Node.js 22.x
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

### Dine-in Session Checkpoint Flow

```
1. Cashier adds session lines (ACTIVE session)
   ↓
2. POST /api/dinein/sessions/:id/finalize-batch
   ↓
3. Server assigns batch_no and syncs finalized lines to pos_order_snapshot_lines
   ↓
4. Server appends table_events and increments session_version
   ↓
5. Other cashiers pull/receive newer version and refresh
   ↓
6. Repeat for additional orders/adjustments until payment
   ↓
7. lock-payment -> close (final settlement + table release)
```

Design intent:
- `table_service_session_lines` is canonical during service.
- POS snapshot lines are synchronized at explicit finalize checkpoints and close.
- This avoids fragile real-time dual-write behavior on every line mutation.

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
- `SUPER_ADMIN`: Platform-wide access — global lookup in `user_role_assignments` (no `company_id` filter), bypasses `company.deleted_at` check, bypasses all module permission bitmask checks
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
5. **Dine-in consistency**: Finalize checkpoints and close must produce deterministic snapshot state across terminals
6. **Session auditability**: Line adjustments (cancel/reduce) require reason and must remain append-auditable

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
