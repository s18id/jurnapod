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

## Catatan Arsitektur

- Semua dokumen final diposting ke `journal_batches` + `journal_lines`.
- POS menggunakan `client_tx_id` (UUID v4) untuk idempotent sync.
- Status dokumen konsisten: `DRAFT -> POSTED -> VOID`, POS: `COMPLETED -> VOID/REFUND`.
