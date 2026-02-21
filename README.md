# Jurnapod

Dari kasir sampai neraca.

Monorepo ERP modular dengan Accounting/GL sebagai pusat, POS offline-first, dan kontrak modul berbasis TypeScript + Zod.

## Struktur

- `apps/pos`: Vite React PWA untuk kasir offline-first
- `apps/backoffice`: Backoffice ERP dan laporan
- `apps/api`: API server (Nest-ready)
- `packages/shared`: kontrak lintas app (types, Zod schemas)
- `packages/core`: business logic framework-agnostic
- `packages/modules/*`: implementasi modul per domain
- `packages/db`: SQL migrations MySQL 8.0.44
- `docs/`: ADR, kontrak API, mapping accounting, template dokumen

## Quick Start

```bash
npm install
npm run typecheck
```

## Auth Secret Utilities

```bash
# Print a new random JWT secret
npm run auth:secret:generate

# Regenerate AUTH_JWT_ACCESS_SECRET in .env
npm run auth:secret:regenerate
```

Optional target file:

```bash
npm run auth:secret:regenerate -- .env.local
```

Both commands append audit entries (without secret values) to `logs/security-events.log`.

Warning: `npm run auth:secret:generate` prints the raw secret to stdout. Do not run it in environments where command output is persisted or shared (for example CI logs, terminal recording tools, or shared shell sessions).

## Catatan Arsitektur

- Semua dokumen final diposting ke `journal_batches` + `journal_lines`.
- POS menggunakan `client_tx_id` (UUID v4) untuk idempotent sync.
- Status dokumen konsisten: `DRAFT -> POSTED -> VOID`, POS: `COMPLETED -> VOID/REFUND`.
