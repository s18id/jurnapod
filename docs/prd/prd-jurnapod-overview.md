# Jurnapod Product Requirements Document (PRD)

**Version:** 1.0  
**Last Updated:** 2026-03-31  
**Product:** Jurnapod  
**Tagline:** From cashier to ledger.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Core Modules](#3-core-modules)
4. [Technical Conventions](#4-technical-conventions)
5. [API High-Level Summary](#5-api-high-level-summary)
6. [Development Workflow](#6-development-workflow)
7. [Open Questions / Risks](#7-open-questions--risks)

---

## 1. Product Overview

### 1.1 Product Name & Tagline

- **Product Name:** Jurnapod
- **Tagline:** From cashier to ledger.

### 1.2 Problem Statement

Jurnapod solves the fragmented nature of small-to-medium business operations by providing an integrated ERP system that unifies:

- **Point-of-Sale operations** with offline-first reliability
- **Accounting/GL** as the financial source of truth
- **Inventory management** with multi-outlet support
- **Customer-facing and back-office operations** in a single modular platform

### 1.3 Business Model Overview

Jurnapod is a modular ERP monorepo serving multi-tenant businesses with:

- **Offline-first POS** for retail/hospitality environments with unreliable networks
- **Real-time accounting** with journal-based financial integrity
- **Multi-outlet support** with tenant isolation at company and outlet levels
- **Module-based architecture** allowing optional features (sales, inventory, purchasing)

### 1.4 Key Differentiators

| Feature | Description |
|---------|-------------|
| **Offline-First POS** | POS continues to work during network outages; syncs when connectivity returns with idempotency guarantees |
| **GL-Centered Accounting** | All financial documents (invoices, POS transactions, payments) reconcile to journal entries |
| **Idempotent Sync** | `client_tx_id` ensures duplicate network retries don't create duplicate financial effects |
| **Tenant Isolation** | All data enforces `company_id`; `outlet_id` where applicable |
| **Immutable Financial Records** | Finalized records use VOID/REFUND correction flows, never mutation |

---

## 2. System Architecture

### 2.1 Modular Monorepo Structure

```
jurnapod/
├── apps/
│   ├── api/           # Hono-based REST API server
│   ├── backoffice/   # React admin dashboard (Mantine UI)
│   └── pos/          # React PWA for Point-of-Sale (Ionic UI)
├── packages/
│   ├── auth/         # Authentication utilities
│   ├── backoffice-sync/  # Backoffice sync module
│   ├── core/         # Core posting logic
│   ├── db/           # Database pool and Kysely ORM
│   ├── notifications/# Email service
│   ├── offline-db/   # IndexedDB schema for POS offline storage
│   ├── pos-sync/     # POS sync module (push/pull)
│   ├── shared/       # Zod schemas and TypeScript contracts
│   ├── sync-core/    # Core sync primitives (idempotency, retry)
│   └── telemetry/     # SLO and metrics
└── docs/             # Architecture Decision Records, guides
```

### 2.2 Core Apps

| App | Purpose | Tech Stack | Port |
|-----|---------|------------|------|
| **api** | REST API server | Hono + TypeScript | 3001 |
| **backoffice** | Admin dashboard | React + Vite + Mantine | 3002 |
| **pos** | POS PWA | React + Vite + Ionic + Dexie | 5173 |

### 2.3 Shared Packages

| Package | Purpose |
|---------|---------|
| **@jurnapod/shared** | Zod schemas for all API contracts, shared TypeScript types |
| **@jurnapod/sync-core** | Idempotency logic, retry transport, sync primitives |
| **@jurnapod/pos-sync** | POS-specific sync (push/pull operations) |
| **@jurnapod/backoffice-sync** | Backoffice sync scheduler |
| **@jurnapod/db** | Database pool, Kysely ORM, schema types |
| **@jurnapod/offline-db** | IndexedDB schema for POS offline storage |

### 2.4 Data Flow Between Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                           POS PWA                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │  IndexedDB  │───▶│  Outbox     │───▶│  Sync Queue │            │
│  │  (Dexie)   │    │  (PENDING)  │    │             │            │
│  └─────────────┘    └─────────────┘    └──────┬──────┘            │
└──────────────────────────────────────────────┼─────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API Server (Hono)                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │ /sync/push  │───▶│ Idempotency │───▶│   Journal   │            │
│  │             │    │   Check     │    │   Posting   │            │
│  └─────────────┘    └─────────────┘    └──────┬──────┘            │
│                                                │                    │
│                                                ▼                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │ /sync/pull  │◀───│ Master Data │◀───│    MySQL    │            │
│  │             │    │   Version   │    │  (InnoDB)   │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Backoffice (React)                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │  Reports    │───▶│   Journal   │───▶│    GL       │            │
│  │  Dashboard  │    │   Queries   │    │   Queries   │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Modules

### 3.1 POS Module

**Location:** `apps/pos/`, `packages/pos-sync/`

#### Offline-First Architecture

```
User Action → Local IndexedDB (Dexie) → Outbox Queue → Background Sync → API Server
```

**Key Principles:**
- Never await network before writing to IndexedDB
- All transactions written locally first with `client_tx_id`
- Background sync worker retries with exponential backoff (max 3 retries)
- Transactions remain usable offline

#### Sync Patterns

**Push Sync (`/api/sync/push`):**
- Fully transactional: document + journal in same DB transaction
- Idempotent via `client_tx_id` UNIQUE constraint
- Returns explicit outcomes: `OK`, `DUPLICATE`, `ERROR`

**Pull Sync (`/api/sync/pull`):**
- Delta sync via `updated_after` timestamp
- Returns master data: items, prices, tax rates, tax defaults

#### Key Flows

| Flow | Description |
|------|-------------|
| **Takeaway** | Simple transaction: items → payment → receipt |
| **Dine-in** | Table service with session management, checkpoints, adjustments |
| **Reservation** | Table booking with time windows, guest counts |
| **Refund/Void** | Correction flows for completed transactions |

#### Key Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `pos_transactions` | `pos_transactions` | POS transaction header |
| `pos_transaction_items` | `pos_transaction_items` | Line items with price snapshot |
| `pos_transaction_payments` | `pos_transaction_payments` | Payment methods and amounts |
| `pos_transaction_taxes` | `pos_transaction_taxes` | Tax breakdown |
| `table_service_sessions` | `table_service_sessions` | Dine-in session lifecycle |
| `table_service_session_lines` | `table_service_session_lines` | Session line items |
| `reservations` | `reservations` | Table reservations with time windows |

#### API Groups

- `POST /api/sync/push` — Push transactions to server
- `POST /api/sync/push/table-events` — Push table occupancy events
- `GET /api/sync/pull` — Pull master data updates
- `GET /api/sync/pull/table-state` — Pull table occupancy state
- `POST /api/dinein/sessions/:id/lines` — Add session line
- `POST /api/dinein/sessions/:id/finalize-batch` — Checkpoint sync
- `POST /api/dinein/sessions/:id/lock-payment` — Lock for payment
- `POST /api/dinein/sessions/:id/close` — Close session

---

### 3.2 Accounting/GL Module

**Location:** `apps/api/src/lib/sales-posting.ts`, `apps/api/src/lib/cogs-posting.ts`, `apps/api/src/routes/journals.ts`

#### Journal Integrity

All financial documents create journal entries that must balance (Debits = Credits):

```
Sales Invoice → Journal Batch → Journal Lines (debit/credit pairs)
POS Transaction → Journal Batch → Journal Lines
Payment → Journal Batch → Journal Lines
```

#### Posting Rules

| Document Type | Posting Behavior |
|---------------|------------------|
| **Sales Invoice** | `DRAFT → POSTED` creates journal entries |
| **POS Transaction** | `COMPLETED` at sync time, journaled atomically |
| **Payment** | `DRAFT → POSTED` creates journal entries |
| **Credit Note** | `DRAFT → POSTED` creates reversing journal entries |

#### Financial Documents

| Document | Status Flow | Correction Flow |
|----------|-------------|-----------------|
| Invoice | `DRAFT → POSTED → VOID` | Credit Note |
| Payment | `DRAFT → POSTED → VOID` | Reversal |
| POS Transaction | `COMPLETED → VOID/REFUND` | N/A |

#### Key Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `journal_batches` | `journal_batches` | Groups related journal lines |
| `journal_lines` | `journal_lines` | Individual debit/credit entries |
| `accounts` | `accounts` | Chart of accounts |
| `account_types` | `account_types` | Account categories |
| `account_balances_current` | `account_balances_current` | Running balances |

#### API Groups

- `POST /api/sales/invoices/:id/post` — Post invoice to GL
- `GET /api/reports/general-ledger` — GL report
- `GET /api/reports/trial-balance` — Trial balance
- `GET /api/reports/profit-loss` — P&L report
- `GET /api/reports/journals` — Journal entry report

---

### 3.3 Inventory Module

**Location:** `apps/api/src/routes/inventory.ts`, `apps/api/src/routes/stock.ts`

#### Stock Tracking

- **Item Types:** SERVICE, PRODUCT, INGREDIENT, RECIPE
- **Stock Level:** Tracked for PRODUCTS and INGREDIENTS
- **Recipes (BOM):** Products can have ingredient compositions for COGS calculation

#### Outlet Scoping

- `item_prices` table supports outlet-specific pricing via `outlet_id`
- `company_settings` cascade: company-level → outlet-level
- Stock movements scoped by `outlet_id`

#### Key Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `items` | `items` | Master items with type |
| `item_groups` | `item_groups` | Item categorization |
| `item_prices` | `item_prices` | Outlet-specific pricing |
| `supplies` | `supplies` | Raw materials for recipes |
| `recipes` | Recipes via `recipe_ingredients` | Bill of materials |

#### API Groups

- `GET /api/inventory` — List inventory
- `GET /api/stock` — Stock levels
- `POST /api/recipes` — Create recipe (BOM)
- `GET /api/settings/tax-rates` — Tax rate management

---

### 3.4 Users & Roles Module

**Location:** `apps/api/src/routes/users.ts`, `apps/api/src/routes/roles.ts`

#### Permissions Model

**Role Hierarchy:**
```
SUPER_ADMIN (platform-wide)
  └── OWNER (company-level)
       └── ADMIN (company-level)
            └── ACCOUNTANT (company-level)
                 └── CASHIER (outlet-level)
```

**Scoping by Role:**
| Role | Access Scope |
|------|--------------|
| `SUPER_ADMIN` | Platform-wide (all companies) |
| `OWNER/ADMIN/ACCOUNTANT` | Company-scoped |
| `CASHIER` | Outlet-scoped |

#### Module Permissions

- Per-company module enablement: `platform`, `accounting`, `sales`, `pos`, `inventory`, `purchasing`
- Role-based module permissions via `module_roles.permission_mask`

#### Key Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `users` | `users` | User accounts |
| `roles` | `roles` | Role definitions |
| `user_role_assignments` | `user_role_assignments` | User-role associations |
| `module_roles` | `module_roles` | Role-module-permission mapping |
| `user_outlets` | `user_outlets` | User-outlet assignments |

#### API Groups

- `POST /api/auth/login` — Authentication
- `POST /api/auth/logout` — Logout
- `POST /api/auth/refresh` — Token refresh
- `GET /api/users` — List users
- `GET /api/roles` — List roles
- `GET /api/settings/module-roles` — Module permissions

---

### 3.5 Settings Module

**Location:** `apps/api/src/routes/settings-config.ts`, `apps/api/src/routes/settings-modules.ts`

#### Outlet/Company Configuration

- Key-value store in `company_settings` with outlet_id scoping
- Settings cascade: company-level defaults → outlet-level overrides

#### Timezone Handling

- Per-outlet timezone stored in `outlets.timezone`
- Reservation time: unix milliseconds in `BIGINT` columns
- **No UTC fallback** — timezone resolution order: outlet → company
- Date filtering uses: `outlet → company` timezone resolution

#### Key Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `outlets` | `outlets` | Outlet definitions with timezone |
| `companies` | `companies` | Company root entity |
| `company_settings` | `company_settings` | Key-value configuration |
| `company_modules` | `company_modules` | Per-company module enablement |
| `numbering_templates` | `numbering_templates` | Document numbering patterns |

#### API Groups

- `GET /api/settings/config` — Read outlet settings
- `PUT /api/settings/config` — Update settings
- `GET /api/settings/modules` — Module enablement
- `PUT /api/settings/modules` — Update module config
- `GET /api/outlets` — List outlets
- `POST /api/outlets` — Create outlet

---

## 4. Technical Conventions

### 4.1 Database: MySQL/MariaDB Compatibility

**Requirements:**
- MySQL 8.0.44+ or MariaDB
- InnoDB storage engine
- Collation: `utf8mb4_uca1400_ai_ci`

**Money Storage:**
```sql
-- ✓ Correct
DECIMAL(18,2)

-- ✗ Never use
FLOAT, DOUBLE
```

**Rerunnable Migrations:**
- All DDL uses `information_schema` checks
- No `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (not portable)
- Guarded dynamic ALTER TABLE statements

### 4.2 Reservation Time Schema

**Canonical Schema:**
```sql
reservation_start_ts BIGINT  -- Unix milliseconds (source of truth)
reservation_end_ts BIGINT    -- Unix milliseconds (source of truth)
reservation_at DATETIME      -- API compatibility only, derived from reservation_start_ts
```

**Overlap Rule:**
```sql
-- Non-overlap condition (end == next start is allowed)
a_start < b_end AND b_start < a_end
```

**Timezone Resolution Order:**
1. Outlet timezone
2. Company timezone
3. **No UTC fallback**

### 4.3 Import Path Conventions

**API Imports:**
```typescript
// ✓ Correct - use @/ alias
import { getDbPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth-guard";

// ✗ Never use relative paths
import { getDbPool } from "../../../../lib/db";
```

**Cross-Package Imports:**
```typescript
import { SomeSchema } from "@jurnapod/shared";
```

### 4.4 Tenant Isolation Enforcement

**Mandatory Scoping:**
- All data accesses require `company_id`
- Outlet-specific resources require `outlet_id`
- Composite foreign keys enforce tenant isolation

**Anti-Patterns (Never Do):**
```typescript
// ✗ Hardcoded company_id
const result = await db.execute("SELECT * FROM items WHERE company_id = 1");

// ✓ Always use authenticated scope
const result = await db.execute(
  "SELECT * FROM items WHERE company_id = ?",
  [auth.companyId]
);
```

### 4.5 Sync Patterns

**Idempotency via client_tx_id:**
```typescript
// Each POS transaction generates a UUID v4 client_tx_id
// Server uses UNIQUE constraint for deduplication
interface PushTransaction {
  client_tx_id: string;  // UUID v4, client's idempotency key
  outlet_id: number;
  cashier_user_id: number;
  total_amount: string;  // DECIMAL as string
  lines: TransactionLine[];
}
```

**Sync Outcomes:**
```typescript
type SyncResult = 
  | { client_tx_id: string; result: "OK"; transaction_id: number }
  | { client_tx_id: string; result: "DUPLICATE" }
  | { client_tx_id: string; result: "ERROR"; message: string };
```

**Retry Behavior:**
- Max 3 retries with exponential backoff
- After 3 failures: mark as `FAILED`, keep in outbox for manual retry

### 4.6 Date/Time Handling

**Critical Rule:** Never use native `Date` for business logic.

```typescript
// ✓ Correct - use @js-temporal/polyfill
import { Temporal } from "@js-temporal/polyfill";

// MySQL → Temporal
const instant = Temporal.Instant.fromEpochMilliseconds(row.ts);

// Temporal → MySQL (BIGINT)
const bigIntMs = instant.epochMilliseconds;

// BigInt → JSON
const jsonValue = BigInt(val).toString();
```

---

## 5. API High-Level Summary

### 5.1 Major API Groups

| Group | Route Prefix | Purpose |
|-------|--------------|---------|
| **Auth** | `/api/auth/*` | Login, logout, token refresh |
| **Sync** | `/api/sync/*` | POS push/pull, table events |
| **Sales** | `/api/sales/*` | Invoices, orders, payments, credit notes |
| **Dine-in** | `/api/dinein/*` | Service sessions, table reservations |
| **Inventory** | `/api/inventory/*` | Items, stock, recipes |
| **Accounting** | `/api/accounts/*` | Chart of accounts, journals |
| **Reports** | `/api/reports/*` | GL, trial balance, P&L |
| **Settings** | `/api/settings/*` | Config, modules, tax rates |
| **Import/Export** | `/api/import/*`, `/api/export/*` | Master data bulk operations |

### 5.2 Auth Pattern Overview

**JWT-based authentication with refresh tokens:**
- Access token: 1 hour TTL (configurable)
- Refresh token: 30 days TTL (configurable)
- Password hashing: Argon2id (default), bcrypt (legacy)

**Login Flow:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "companyCode": "JP",
  "email": "owner@example.com",
  "password": "ChangeMe123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 3600
  }
}
```

### 5.3 Sync Endpoints Overview

**Push Transactions:**
```http
POST /api/sync/push
Authorization: Bearer {token}

{
  "transactions": [
    {
      "client_tx_id": "uuid-v4",
      "outlet_id": 1,
      "cashier_user_id": 1,
      "total_amount": "100.00",
      "lines": [...]
    }
  ]
}
```

**Pull Master Data:**
```http
GET /api/sync/pull?outlet_id=1&since_version=0
Authorization: Bearer {token}
```

---

## 6. Development Workflow

### 6.1 Repository Setup

```bash
# Clone and install
git clone <url>
cd jurnapod
npm install

# Configure environment
cp .env.example .env
# Edit .env with database credentials and secrets

# Run migrations and seed
npm run db:migrate
npm run db:seed

# Build packages
npm run build
```

### 6.2 Testing Commands

**Run from repository root `/home/ahmad/jurnapod`:**

| Workspace | Command |
|-----------|---------|
| **API Unit Tests** | `npm run test:unit -w @jurnapod/api` |
| **API Single Test** | `npm run test:unit:single -w @jurnapod/api <path>` |
| **API Routes Tests** | `npm run test:unit:routes -w @jurnapod/api` |
| **API Lib Tests** | `npm run test:unit:lib -w @jurnapod/api` |
| **API Critical Path** | `npm run test:unit:critical -w @jurnapod/api` |
| **POS Tests** | `npm run test -w @jurnapod/pos` |
| **POS E2E** | `npm run qa:e2e -w @jurnapod/pos` |
| **Backoffice Tests** | `npm run test -w @jurnapod/backoffice` |

**Scoped Test Runs (faster feedback):**
```bash
# Auth, sync, posting (PR gate candidate)
npm run test:unit:critical -w @jurnapod/api

# Orders, payments, invoices
npm run test:unit:sales -w @jurnapod/api

# Push, pull sync
npm run test:unit:sync -w @jurnapod/api

# Import route + lib
npm run test:unit:import -w @jurnapod/api
```

**Quality Gates:**
```bash
# All checks in sequence
npm run typecheck -w @jurnapod/api && \
npm run build -w @jurnapod/api && \
npm run lint -w @jurnapod/api && \
npm run test:unit -w @jurnapod/api
```

### 6.3 Code Review Standards

**Priority Areas:**
- **P0/P1:** Correctness, validation, authorization, idempotency, transaction boundaries
- **P1:** Missing `company_id`/`outlet_id` scoping
- **P1:** Missing Zod validation on API boundaries
- **P1:** Duplicate creation risk around `client_tx_id`, retry handling

**Review Checklist:**
- [ ] Auth and access control correctly enforced
- [ ] `company_id` and `outlet_id` scoping on all data access
- [ ] Zod validation on all request bodies/params/queries
- [ ] POSTED/COMPLETED flows cannot bypass journal creation
- [ ] Sync outcomes are explicit (`OK`, `DUPLICATE`, `ERROR`)
- [ ] Unit tests exist for auth, sync, posting, settings
- [ ] Database pool cleanup in tests (`test.after()`)

### 6.4 Definition of Done

**Implementation Checklist:**
- [ ] All Acceptance Criteria implemented with evidence
- [ ] No known technical debt (or debt items formally created in `sprint-status.yaml`)
- [ ] Code follows repo-wide operating principles
- [ ] No breaking changes without cross-package alignment

**Testing Requirements:**
- [ ] Unit tests written and passing (show test output in completion notes)
- [ ] Integration tests for API boundaries
- [ ] Error path/happy path testing completed
- [ ] Database pool cleanup hooks present

**Quality Gates:**
- [ ] Code review completed with no blockers
- [ ] AI review conducted (use `bmad-code-review` agent)
- [ ] Review feedback addressed or formally deferred

**Documentation:**
- [ ] Schema changes documented (if applicable)
- [ ] API changes reflected in contracts (`packages/shared`)
- [ ] Dev Notes include files modified/created

**Production Readiness:**
- [ ] Feature is deployable (no feature flags hiding incomplete work)
- [ ] No hardcoded values or secrets in code
- [ ] Performance considerations addressed

---

## 7. Open Questions / Risks

### 7.1 Known Technical Debt

**Current Status:** All P1 and P2 technical debt has been resolved. The remaining items are P3/P4.

| ID | Description | Priority | Status |
|----|-------------|----------|--------|
| TD-033 | Epic 13 libraries verification | P3 | Resolved |
| TD-034 | Epic 14 introduced no new TD | — | Confirmed |

**Historical Highlights:**
- TD-001 to TD-003: N+1 query patterns in COGS posting/calculation (resolved)
- TD-010 to TD-011: Import/export memory issues (resolved)
- TD-020 to TD-022: Monolith route files (4K+ lines) (resolved)
- TD-026: Import sessions in-memory (resolved with MySQL persistence)

### 7.2 Performance Considerations

| Area | Consideration |
|------|---------------|
| **Large Exports** | CSV exports >10K rows stream to prevent memory exhaustion |
| **Excel Generation** | >10K rows create multiple sheets; 50K row limit |
| **Import Parsing** | Streaming parsers for files approaching 50MB |
| **Batch Operations** | 500-row chunks with separate transactions |
| **Database Indexes** | Compound indexes on `(company_id, outlet_id)` for tenant queries |

### 7.3 Security Notes

| Area | Implementation |
|------|----------------|
| **Password Storage** | Argon2id (default), bcrypt (legacy with auto-migration) |
| **Auth Tokens** | JWT with configurable TTL, refresh token rotation |
| **Rate Limiting** | Login throttling, production 10 req/sec per IP |
| **Audit Logging** | All critical operations logged with user/company/outlet context |
| **Input Validation** | Zod schemas at all API boundaries |

### 7.4 Known Limitations

| Limitation | Workaround |
|------------|------------|
| **Single-instance import sessions** | MySQL-backed sessions (not Redis); works for single-node deployments |
| **Max import file size** | 50MB hard limit |
| **Max export rows (Excel)** | 50,000 rows; recommend CSV for larger |
| **Offline POS** | Requires periodic sync; offline duration limited by outbox size |

---

## Appendix: Key File Locations

### Routes (API)
| Route | File |
|-------|------|
| Auth | `apps/api/src/routes/auth.ts` |
| Sync | `apps/api/src/routes/sync.ts` |
| Sales | `apps/api/src/routes/sales.ts` |
| Dine-in | `apps/api/src/routes/dinein.ts` |
| Reports | `apps/api/src/routes/reports.ts` |
| Settings | `apps/api/src/routes/settings-config.ts` |
| Import | `apps/api/src/routes/import.ts` |
| Export | `apps/api/src/routes/export.ts` |

### Library Modules
| Module | File |
|--------|------|
| Auth Guard | `apps/api/src/lib/auth-guard.ts` |
| Sales Posting | `apps/api/src/lib/sales-posting.ts` |
| COGS Posting | `apps/api/src/lib/cogs-posting.ts` |
| Sync Push | `apps/api/src/lib/sync/push/index.ts` |
| Sync Pull | `apps/api/src/lib/sync/pull/index.ts` |
| Reservations | `apps/api/src/lib/reservations/crud.ts` |

### Shared Contracts
| Contract | Location |
|----------|----------|
| All Zod Schemas | `packages/shared/src/schemas/*.ts` |
| POS Sync Types | `packages/shared/src/schemas/pos-sync.ts` |
| Sales Schemas | `packages/shared/src/schemas/sales.ts` |

### Database
| Artifact | Location |
|----------|----------|
| Schema Reference | `docs/db/schema.md` |
| Kysely Schema | `packages/db/src/kysely/schema.ts` |

---

*Document generated for developer onboarding. For detailed technical specifications, refer to Architecture.md, API.md, and the ADRs in `docs/adr/`.*
