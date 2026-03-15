---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: [
  '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/prd.md',
  '/home/ahmad/jurnapod/README.md',
  '/home/ahmad/jurnapod/docs/db/schema.md',
  '/home/ahmad/jurnapod/docs/api/sync-contract.md',
  '/home/ahmad/jurnapod/docs/adr/ADR-0001-gl-as-source-of-truth.md'
]
workflowType: 'architecture'
project_name: 'jurnapod'
user_name: 'Ahmad'
date: '2026-03-15'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- 27 FRs across 7 categories: POS, Accounting/GL, User Management, Company & Outlet, Settings, Reporting, Items
- Key capabilities: Offline-first POS, GL posting, RBAC, multi-tenant

**Non-Functional Requirements:**
- Performance: <1s POS, <500ms API, <5s reports
- Security: TLS, Argon2id/bcrypt, JWT, RBAC
- Availability: 99.9% uptime (6AM-11PM), offline POS (7 days)
- Testing: 80%+ coverage on critical paths

### Technical Context

- **Architecture:** Modular monorepo with TypeScript + Zod
- **Database:** MySQL 8.0.44 with migrations
- **Apps:** POS (PWA), Backoffice, API
- **Key ADR:** GL as source of truth - all posted documents create journal entries
- **Sync:** Idempotent via client_tx_id (UUID v4)

### Scale & Complexity

| Indicator | Assessment |
|-----------|------------|
| Primary domain | ERP / POS / Accounting |
| Complexity | Medium (accounting requires precision) |
| Multi-tenancy | Yes (company_id, outlet_id) |
| Offline-first | Critical for POS |
| Real-time | Limited (sync on reconnect) |
| Regulatory | Financial data - audit trails required |

### Cross-Cutting Concerns Identified

1. **Accounting at center** - Every transaction must flow to GL journals
2. **Offline-first POS** - Local storage + sync queue with conflict resolution
3. **Modular design** - Modules can be enabled/disabled per company
4. **Multi-tenant** - Company and outlet scoping everywhere
5. **Data integrity** - ACID transactions, DECIMAL for money

## Party Mode Architectural Insights

### Component Breakdown

```
jurnapod/
├── apps/
│   ├── api/              # Express/Fastify REST API
│   ├── pos-pwa/          # Offline-first PWA (Vite + React)
│   └── backoffice/       # Admin dashboard (React)
├── packages/
│   ├── shared/           # Zod contracts, types, utilities
│   ├── db/               # Schema + migrations
│   ├── sync/             # Offline sync logic (shared)
│   └── posting/          # GL posting engine (shared)
```

### Key Technical Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Sync architecture** | Embedded in API, not separate service | Avoids distributed transactions early |
| **Money handling** | cents/pennies in DB, display formatting at boundary | Prevents rounding drift |
| **Tenant isolation** | Foreign keys with company_id + outlet_id | Enforced at DB layer |
| **Module activation** | Feature flags in company_settings table | Extensible, no code deploys |
| **Offline storage** | IndexedDB in POS, sync via outbox table | MySQL-compatible |

### Critical Test Paths

| Priority | Test Scenario | Why |
|----------|---------------|-----|
| **P0** | Offline POS → sync → no duplicates | Core value prop |
| **P0** | POS sale → GL posting → correct amounts | Financial integrity |
| **P0** | Tenant isolation (company A can't see company B) | Security |
| **P1** | Concurrent sync from multiple devices | Race conditions |
| **P1** | Void/refund creates correction entries | Audit trail |

### Cross-Cutting Concerns

1. **Auth**: JWT with short expiry, refresh tokens, RBAC at API middleware
2. **Audit**: Every financial write logs to audit table (who, what, when)
3. **Error handling**: Standard error response format across all apps
4. **API versioning**: URL-based (`/api/v1/`) for backward compatibility

## Current Tech Stack Assessment

> Note: This is an existing brownfield project - not a new project starting from scratch.

### Current Architecture

| Component | Technology | Version |
|-----------|------------|---------|
| **API** | Next.js | 15.5.12 |
| **POS PWA** | Vite + React + Ionic | 8.x |
| **Backoffice** | React | 18.x |
| **Database** | MySQL | 8.0.44 |
| **Auth** | JWT (jose) + Argon2/bcrypt | - |
| **Validation** | Zod | 3.24.1 |
| **Local DB (POS)** | Dexie (IndexedDB) | 4.0.11 |
| **Mobile** | Capacitor | 8.2.0 |

### Tech Stack Evaluation

| Aspect | Current | Assessment | Recommendation |
|--------|---------|------------|----------------|
| **API Framework** | Next.js | Good | Keep - well supported |
| **Frontend** | React + Ionic + Vite | Good | Keep - PWA + mobile ready |
| **Database** | MySQL 8.0 | Good | Keep - meets requirements |
| **Validation** | Zod | Excellent | Keep - type-safe |
| **Offline Storage** | Dexie | Good | Keep - IndexedDB wrapper |
| **Auth** | JWT + Argon2 | Good | Keep - secure |
| **Testing** | Node test + Playwright | Good | Consider adding Vitest |

### Architecture Gaps Identified

| Gap | Recommendation |
|-----|----------------|
| No shared sync package | Create `packages/sync` for offline logic |
| No shared posting package | Create `packages/posting` for GL engine |
| Module system ad-hoc | Formalize with feature flags |
| Testing could improve | Add Vitest for frontend unit tests |

## Core Architectural Decisions

### Data Architecture

| Decision | Current Practice | Status |
|----------|------------------|--------|
| **Database** | MySQL 8.0.44 | ✅ Decided |
| **ORM/Query** | mysql2 (raw SQL) | Current |
| **Migrations** | SQL files in packages/db/migrations | ✅ Working |
| **Money Values** | DECIMAL(18,2) | ✅ Enforced |
| **Tenant Scoping** | company_id, outlet_id on all tables | ✅ Required |

### Authentication & Security

| Decision | Current Practice | Status |
|----------|------------------|--------|
| **Auth Method** | JWT (jose library) | ✅ Decided |
| **Password Hashing** | Argon2id (default), bcrypt (legacy) | ✅ Decided |
| **Authorization** | RBAC with roles (SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, CASHIER) | ✅ Decided |
| **API Security** | TLS 1.2+ in transit | Required |
| **Tenant Isolation** | Foreign keys + company_id checks | ✅ Required |

### API Architecture

| Decision | Current Practice | Status |
|----------|------------------|--------|
| **API Style** | REST (Next.js API routes) | ✅ Decided |
| **Sync Endpoint** | POST /api/sync/push with client_tx_id | ✅ Decided |
| **Error Responses** | Standard envelope format | To standardize |
| **Versioning** | Not yet implemented | Future consideration |

### Offline-First POS

| Decision | Current Practice | Status |
|----------|------------------|--------|
| **Local Storage** | Dexie (IndexedDB wrapper) | ✅ Decided |
| **Sync Protocol** | Outbox pattern with idempotency | ✅ Decided |
| **Conflict Resolution** | client_tx_id prevents duplicates | ✅ Decided |
| **Offline Duration** | Configurable (up to 7 days) | In NFR |

### Module System

| Decision | Current Practice | Status |
|----------|------------------|--------|
| **Module Storage** | company_modules table | ✅ Working |
| **Activation** | Per-company enablement | ✅ Working |
| **Configuration** | JSON config per module | ✅ Working |
| **Future** | Feature flags in company_settings | Recommended |

## Standardized Patterns

### Money Handling
- All monetary values stored as DECIMAL(18,2) in MySQL
- Calculations done in cents/pennies to avoid floating point issues
- Display formatting applied at UI boundary only
- No FLOAT or DOUBLE for money fields

## Established Patterns (from AGENTS.md)

### Repo-Wide Operating Principles

1. **Accounting/GL is the source of truth** - All posted documents must create journal entries
2. **POS is offline-first** - Write locally first, then sync via outbox
3. **POS sync must be idempotent** - Use `client_tx_id` (UUID v4)
4. **Tenant isolation** - All operational data must have `company_id` and `outlet_id`
5. **Immutable corrections** - Use VOID/REFUND, not silent mutations

### Database Patterns

- Migrations must be rerunnable/idempotent
- MySQL/MariaDB compatible (avoid engine-specific syntax)
- Use `information_schema` for existence checks
- DECIMAL(18,2) for all monetary values

### API Patterns

- Shared Zod contracts in `packages/shared`
- All sync payloads must be validated
- Tenant scoping enforced on every request

### Review Guidelines

**P0/P1 Issues:**
- Incorrect ledger balances
- Duplicate posting
- Duplicate POS transaction creation
- Tenant data leakage
- Auth bypass

**P1 Issues:**
- Missing validation on money movement, posting, sync, auth
- Missing tenant/outlet scoping

### Transaction Boundaries
- All financial writes must be atomic (within single transaction)
- No partial writes allowed for journal entries
- Void/Refund creates correction entries, not mutations

### Tenant Isolation
- Every operational table has company_id column
- Outlet-specific data has outlet_id column
- Foreign key constraints enforce isolation

## Project Structure

### Current Directory Structure

```
jurnapod/
├── apps/
│   ├── api/                 # Next.js API server (port 3001)
│   ├── backoffice/          # React admin dashboard (port 3002)
│   └── pos/                 # Vite React PWA (port 5173)
├── packages/
│   ├── core/               # Framework-agnostic business logic
│   ├── db/                 # MySQL migrations + seeds
│   ├── modules/            # Domain modules
│   │   ├── modules-accounting/
│   │   ├── modules-inventory/
│   │   ├── modules-platform/
│   │   ├── modules-pos/
│   │   ├── modules-purchasing/
│   │   └── modules-sales/
│   ├── offline-db/         # POS offline IndexedDB schema
│   └── shared/            # Zod contracts, types, utilities
├── docs/                  # ADRs, API contracts, plans
└── scripts/               # Build & dev scripts
```

### Package Responsibilities

| Package | Responsibility |
|---------|---------------|
| `@jurnapod/api` | REST API, auth, sync endpoints, posting triggers |
| `@jurnapod/pos` | Offline-first PWA, local storage, outbox |
| `@jurnapod/backoffice` | Admin dashboard, reports, settings |
| `@jurnapod/shared` | Zod schemas, types, validation |
| `@jurnapod/db` | Migrations, seeds, SQL |
| `@jurnapod/offline-db` | IndexedDB schema for POS |
| `@jurnapod/modules-*` | Domain logic (accounting, sales, pos, etc.) |

### Recommended Additions

| Package | Purpose |
|---------|---------|
| `@jurnapod/sync` | Shared offline sync logic (recommended) |
| `@jurnapod/posting` | GL posting engine (recommended) |
- API middleware validates scoping on every request

### Error Handling (To Standardize)
```typescript
// Standard error response format
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Human readable message',
    details?: Record<string, unknown>
  }
}
```
