<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# AGENTS.md
Important: Use codex-* subagents if the invoker is from openai model, and use claude-* if the invoker is from anthropic model.

**Product:** Jurnapod
**Tagline:** From cashier to ledger.

Working guide for agents/contributors in **Jurnapod** (modular ERP for services + coffee shops) in a **monorepo**.

## Project Summary
This project is a **modular ERP** with **Accounting/GL as the center** (single source of truth):

- Import and manage financial reports from Excel/ODS files (structure follows ODS: DA + JRNL/TRNS)
- Multi-user and multi-outlet backoffice
- **Offline-first** POS (client-side) that syncs to server (manual/interval)
- Sales (service invoices) + invoice/receipt printing (PDF/print view)
- Optional modules: Inventory, Purchasing/AP, Cash & Bank
- Database: **MySQL 8.0.44** (InnoDB)

Target stack:
- POS: **Vite + React PWA** (offline via IndexedDB)
- API: start with Next.js API (or directly NestJS), designed to be "Nest-ready"
- Backoffice: React/Next.js
- Shared contract: TypeScript + **Zod** (schema validation)

---

## Monorepo Layout (recommended)
```
.
├─ apps/
│  ├─ pos/                 # Vite React PWA (offline-first)
│  ├─ backoffice/          # Admin ERP & laporan (React/Next)
│  └─ api/                 # API server (Next API / NestJS)
├─ packages/
│  ├─ shared/              # Types, Zod schemas, constants, DTO contracts
│  ├─ core/                # Business logic (framework-agnostic): posting, rules, services
│  ├─ modules/             # Per-module implementation (adapter to core)
│  │   ├─ platform/        # auth/org/outlet/audit/numbering/feature flags
│  │   ├─ accounting/      # COA + journal + reports + ODS import mapping
│  │   ├─ sales/           # service invoice + payment in (light AR)
│  │   ├─ pos/             # sync contract + posting rules POS
│  │   ├─ inventory/       # (optional) stock movements + recipe/BOM
│  │   └─ purchasing/      # (optional) PO/GRN/AP
│  └─ db/                  # SQL migrations / Prisma schema (if used)
├─ docs/                   # ADR, ODS mapping, API contracts, invoice/receipt templates
├─ AGENTS.md
└─ README.md
```

---

## Mandatory Design Principles

### 1) Accounting/GL as the center
- All **POSTED/COMPLETED** documents must generate **Journal** entries:
  - `journal_batches` + `journal_lines`
- Other modules do not produce their own financial reports.
- Ledger/P&L/Balance Sheet reports are calculated from journals + COA (optional cache/snapshot).

### 2) POS offline-first (web/PWA)
- POS **must always write transactions to IndexedDB first**.
- Sync uses an outbox queue:
  - `PENDING -> SENT` or `FAILED` (retry)
- POS transactions are **append-only**:
  - `COMPLETED` (final)
  - corrections through `VOID` or `REFUND` (not by editing final transactions)

### 3) Idempotent sync
- All POS transactions have a `client_tx_id` (UUID v4) generated on the client.
- Server must have a UNIQUE index on `pos_transactions.client_tx_id`.
- Endpoint `/sync/push` must be safe against re-sent payloads.

### 4) Multi-company / multi-outlet / RBAC
- All operational data must be bound to `company_id` and (when relevant) `outlet_id`.
- Outlet access is determined via user<->outlet relations.
- Minimum roles: OWNER, ADMIN, CASHIER, ACCOUNTANT.

### 5) Documents have consistent lifecycle
Use standard statuses:
- `DRAFT -> POSTED -> VOID`
- POS: `COMPLETED -> VOID/REFUND`
Goal: clean audit trail and minimal sync conflicts.

---

## Module Contracts & Posting to GL

### Posting contract (core)
Core provides a framework-agnostic service:
- `posting.post(doc_type, doc_id, company_id, outlet_id)`

Each module provides a mapper to produce journal lines:
- Sales invoice: `mapInvoiceToJournal`
- POS sale: `mapPosSaleToJournal`
- Payment in/out: `mapPaymentToJournal`
- Inventory/purchasing (optional): map to inventory/COGS/AP

All posting processes must be executed in **1 DB transaction**.

---

## API (high level)
### Auth
- Backoffice and POS use tokens (JWT recommended).
- POS endpoints must verify user and outlet access.

### POS Sync
- `GET /sync/pull?outlet_id=...&since_version=...`
  - pull master data (items, prices, tax config, relevant feature flags)
- `POST /sync/push`
  - push POS transactions (header + items + payments)
  - response per transaction: OK / DUPLICATE / ERROR
  - idempotent by `client_tx_id`

### Accounting Import (ODS/Excel)
- Upload file (.ods/.xlsx)
- Mapping sheet:
  - `DA` → COA
  - `JRNL/TRNS` → journal batches + lines
- Store import metadata + hash for audit and import idempotency.

---

## Database Guidelines (MySQL 8.0.44)
- Required: `ENGINE=InnoDB`.
- Monetary values: `DECIMAL(18,2)` (or `DECIMAL(18,4)` if needed).
- Do not use FLOAT/DOUBLE for money.
- All document inserts + journal posting must be wrapped in `BEGIN/COMMIT`.
- Important UNIQUE indexes:
  - `pos_transactions.client_tx_id`
  - invoice / receipt / journal reference numbers (based on sequence)
- Use clear FKs + indexes for reporting queries:
  - journal: (company_id, date), (account_id, date), (outlet_id, date)

---

## Frontend POS Guidelines (Vite React PWA)
- Storage offline: IndexedDB (Dexie).
- Outbox queue is mandatory.
- UI must remain usable:
  - without internet
  - with intermittent connection
- Always show sync status (e.g., badge: Offline / Pending / Synced).
- Cache master data per outlet (prices may differ by outlet).
- Avoid "editing final transactions"; use void/refund flow.

---

## Feature Flags (modular)
Recommended keys:
- `pos.enabled`
- `sales.enabled`
- `cashbank.enabled`
- `inventory.enabled` (level: 0/1/2 in `config_json`)
- `purchasing.enabled`
- `recipes.enabled`

All UI must respect flags (menu and routes do not appear when module is off).

---

## Coding Conventions
- TypeScript strict mode (recommended).
- Validate payloads and cross-module contracts:
  - use Zod schemas in `packages/shared`
- Layering:
  - `controllers/routes` only handle parsing + auth + validation
  - `services` (core/modules) contain business rules
  - `repositories` contain DB access
- Logging:
  - include correlation id + `client_tx_id` for sync cases
- Important snapshots (POS):
  - store `name_snapshot` and `price_snapshot` in `pos_items` to keep historical consistency.

---

## Testing (minimal)
Unit tests:
- idempotency `/sync/push`
- posting rules (invoice → journal, pos → journal)
- import mapping ODS/Excel -> COA/journal

Integration tests:
- `/sync/push` duplicate payload does not create double inserts
- `/sync/pull` master data versioning
- generate PDF invoice/receipt (smoke)

---

## Migration Plan (Next.js API → NestJS)
To make migration easier:
- Business logic must live in `packages/core` (framework agnostic).
- Next.js API and NestJS controllers should only call core services.
- Avoid business logic in route handlers (tight coupling to Next).

Strategy:
- Run Next API and Nest API in parallel
- Migrate endpoints module by module
- Keep API/payload contracts stable.

---

## Security & Audit
- Audit log is required for:
  - void/refund
  - master data changes (items/prices/accounts)
  - posting invoice/journal
- Store at minimum:
  - `user_id`, `outlet_id`, action, timestamp, concise payload
- Do not store sensitive data (e.g., cards) in client storage.

---

## How to Contribute
1) Create a branch: `feat/<name>` or `fix/<name>`
2) Ensure:
   - lint + typecheck pass
   - API contract changes are documented (`docs/`)
   - DB changes include migrations
3) PR must include:
   - description of changes
   - DB impact (migrations)
   - offline sync impact (if any)
   - journal posting impact (if any)

---

## Additional Documents
- `docs/` contains:
  - ADR (architecture decisions)
  - ODS sheet mapping -> database
  - sync API contracts
  - invoice/receipt templates
