<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Jurnapod

**From cashier to ledger.**

Modular ERP monorepo with Accounting/GL at the center, offline-first POS, and module contracts built on TypeScript + Zod.

---

## 📁 Structure

- `apps/pos` - Vite React PWA for offline-first cashier
- `apps/backoffice` - ERP backoffice and reports
- `apps/api` - Hono API server
- `packages/shared` - Cross-app contracts (types, Zod schemas)
- `packages/core` - Framework-agnostic business logic
- `packages/modules/*` - Domain module implementations
- `packages/db` - MySQL 8.0.44 SQL migrations
- `docs/` - ADRs, API contracts, accounting mappings, guides

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run db:migrate
npm run db:seed

# Start all services (API + Backoffice + POS)
npm run dev
```

**Service URLs:**
- API: http://localhost:3001
- Backoffice: http://localhost:3002
- POS: http://localhost:5173

---

## 📚 Documentation

- **[Development Guide](docs/DEVELOPMENT.md)** - Full development workflow, commands, troubleshooting
- **[Production Deployment](docs/PRODUCTION.md)** - Complete production setup guide
- **[API Reference](docs/API.md)** - API endpoints and contracts
- **[Architecture](docs/ARCHITECTURE.md)** - System design and principles
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

---

## 🏗️ Architecture Overview

### Core Principles

- **Accounting/GL at the center**: All final documents post to `journal_batches` + `journal_lines`
- **Idempotent sync**: POS uses `client_tx_id` (UUID v4) to prevent duplicates
- **Offline-first POS**: Write locally, sync via outbox pattern
- **Multi-tenant**: All data scoped to `company_id` and `outlet_id`
- **Type-safe contracts**: Shared Zod schemas across apps

### Modules

| Module | Purpose |
|--------|---------|
| **platform** | Auth, organization, outlets, audit, module enablement |
| **accounting** | Chart of accounts, journal posting, financial reports, import |
| **sales** | Service invoices, payments, light AR |
| **pos** | Offline-first transaction sync, posting rules |
| **inventory** | Stock movements, recipes, BOM _(optional)_ |
| **purchasing** | PO, GRN, AP _(optional)_ |

### Technology Stack

- **Frontend**: React, Vite, PWA (service workers)
- **Backend**: Hono, Node.js 20.x
- **Database**: MySQL 8.0.44 / MariaDB (InnoDB)
- **Validation**: Zod schemas
- **Money**: `DECIMAL(18,2)` - never FLOAT/DOUBLE

---

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start all services
npm run dev:api          # API only
npm run dev:backoffice   # Backoffice only
npm run dev:pos          # POS only

# Build & Test
npm run build            # Build all packages (incremental)
npm run build:clean      # Clean build from scratch
npm run typecheck        # Type-check all workspaces
npm run lint             # Lint all workspaces
npm run test             # Run all tests

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Seed initial data
npm run db:smoke         # Verify database connection

# Deployment
npm run deploy:pos       # Deploy POS (with backup/rollback)
npm run deploy:backoffice # Deploy Backoffice
```

**See:** [Development Guide](docs/DEVELOPMENT.md) for detailed workflow and troubleshooting.

---

## 🔐 Security

### Auth Secrets

```bash
# Generate new JWT secret
npm run auth:secret:generate

# Regenerate secret in .env
npm run auth:secret:regenerate
```

**Password hashing:** Defaults to Argon2id. Legacy bcrypt hashes auto-migrate on login when `AUTH_PASSWORD_REHASH_ON_LOGIN=true`.

**Audit logging:** Secret operations logged to `logs/security-events.log` (values redacted).

---

## 📦 Item Types

Jurnapod supports four item types:

| Type | Purpose | Stock Tracking |
|------|---------|----------------|
| **SERVICE** | Non-tangible (delivery, labor) | Never |
| **PRODUCT** | Finished goods (drinks, pastries) | Optional |
| **INGREDIENT** | Raw materials (beans, milk) | Yes (when inventory enabled) |
| **RECIPE** | BOM templates (latte recipe) | Never |

**See:** [ADR-0002: Item Types](docs/adr/ADR-0002-item-types-taxonomy.md)

---

## 🤝 Contributing

- Follow existing code patterns and architecture
- Maintain test coverage for critical paths
- Update documentation for user-facing changes
- See [AGENTS.md](AGENTS.md) for development guidelines

---

## 📄 License

Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

---

## 📞 Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: Check [docs/](docs/) for detailed guides
- **Architecture**: Review [AGENTS.md](AGENTS.md) for system invariants

