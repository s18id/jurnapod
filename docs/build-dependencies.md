# Cross-Package Build Dependencies

> **Why This Document Exists**
>
> This monorepo uses npm workspaces with TypeScript project references. Packages must be built in a specific order because downstream packages import types and implementations from upstream ones. Building in the wrong order causes `Cannot find module` or `TypeError` errors at compile time.
>
> **The Golden Rule**: Always build packages before building their consumers.

---

## Canonical Build Order

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIER 0 — Foundation (No internal dependencies)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. @jurnapod/shared         — Zod schemas, types, constants                │
│  2. @jurnapod/db             — Kysely DB layer, migrations                  │
│  3. @jurnapod/offline-db     — Dexie/IndexedDB wrapper (POS only)          │
│  4. @jurnapod/notifications  — Email service (no internal deps)             │
│  5. @jurnapod/telemetry      — Observability primitives (no internal deps)   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIER 1 — Core Infrastructure                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  6. @jurnapod/modules-platform  — Settings, audit, feature flags            │
│     ↳ depends on: shared, db                                                │
│  7. @jurnapod/sync-core        — Sync registry, auth, idempotency           │
│     ↳ depends on: shared, db                                                │
│  8. @jurnapod/auth             — JWT, passwords, RBAC                      │
│     ↳ depends on: shared, db                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIER 2 — Domain Modules (Part A)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  9. @jurnapod/modules-inventory-costing  — FIFO, moving average, standard  │
│     ↳ depends on: shared, db, modules-platform                              │
│  10. @jurnapod/modules-accounting       — Journals, posting, fiscal years  │
│     ↳ depends on: shared, db                                             │
│  11. @jurnapod/modules-sales            — Invoices, payments, credit notes │
│     ↳ depends on: shared, db                                             │
│  12. @jurnapod/modules-reporting        — Trial balance, P&L, reports      │
│     ↳ depends on: shared, db                                             │
│  13. @jurnapod/modules-reservations     — Table reservations, sessions      │
│     ↳ depends on: shared, db                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIER 2 — Domain Modules (Part B)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  14. @jurnapod/modules-inventory      — Items, variants, stock movements   │
│     ↳ depends on: shared, db, modules-inventory-costing                     │
│  15. @jurnapod/modules-treasury       — Cash/bank mutations, journal lines  │
│     ↳ depends on: shared, db, modules-accounting, modules-platform          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIER 3 — Sync Modules                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  16. @jurnapod/backoffice-sync    — Backoffice dashboard sync              │
│     ↳ depends on: shared, sync-core                                         │
│  17. @jurnapod/pos-sync           — POS PULL/PUSH sync                     │
│     ↳ depends on: shared, db, sync-core, modules-inventory,                 │
│                   modules-accounting                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TIER 4 — Applications                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  18. @jurnapod/api          — Hono REST API server                         │
│     ↳ depends on: auth, sync-core, backoffice-sync, pos-sync,               │
│                   modules-accounting, modules-inventory, modules-platform,   │
│                   modules-reporting, modules-sales, (all domain modules)     │
│  19. @jurnapod/backoffice   — React dashboard (Vite)                       │
│     ↳ depends on: offline-db (dev dependency for predev)                    │
│  20. @jurnapod/pos          — React POS app (Capacitor/Vite)               │
│     ↳ depends on: offline-db (dev dependency for predev/prebuild)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dependency Rationale

### Why `@jurnapod/shared` is First

`@jurnapod/shared` exports:
- Zod schemas used for validation in **every** other package
- TypeScript types derived from those schemas
- Business constants (account codes, table states, RBAC bitmasks)

No other package can compile without these types available.

### Why `@jurnapod/db` is Second

`@jurnapod/db` exports:
- `Kysely` database client factory (`createKysely`, `getKysely`)
- Type-safe `DatabaseSchema` type used by all DB-aware packages
- Connection pooling and transaction helpers

Every domain module and sync package depends on Kysely for database access. Building it early ensures type-safe queries compile correctly.

### Why `@jurnapod/modules-platform` is Third

`@jurnapod/modules-platform` provides:
- **SettingsPort** — typed settings access used by `modules-inventory-costing`
- Audit logging infrastructure
- Feature flag system

The `modules-inventory-costing` package calls `settings.resolve('inventory.costing_method')` at runtime, so `modules-platform` must be built first.

### Why `@jurnapod/modules-inventory-costing` Before `@jurnapod/modules-inventory`

`modules-inventory` (items, variants, stock) depends on `modules-inventory-costing` because:
- Stock movements trigger cost calculation
- POS sync needs to know unit costs for COGS posting

Building `modules-inventory-costing` first ensures the cost calculator types are available when `modules-inventory` compiles.

### Why `@jurnapod/modules-accounting` Before `@jurnapod/modules-treasury`

`modules-treasury` builds journal lines that `modules-accounting` posts. The `CashBankService` in treasury calls `PostingService` from accounting. Building accounting first prevents circular dependency issues.

### Why `@jurnapod/modules-inventory` and `@jurnapod/modules-treasury` Before `@jurnapod/pos-sync`

`pos-sync` handles PULL (master data sync) and PUSH (transaction sync):
- PULL needs items/variants from `modules-inventory`
- PUSH needs journal posting via `modules-accounting`

Building both domain modules first ensures `pos-sync` can import their types.

---

## How to Build

### Build All Libraries (Required Before Apps)

```bash
# Builds all packages in correct order using TypeScript build references
npm run build:libs
```

This runs `tsc -b tsconfig.build.json` from the root, which respects project references and builds in the correct order automatically.

### Build a Specific Package

```bash
# Build a single package (will fail if its deps aren't built)
npm run build -w @jurnapod/pos-sync

# Build a package and all its dependencies
npm run build -w @jurnapod/api
```

### Full Clean Build

```bash
npm run build:clean
```

This runs `clean` (removes all `dist/` folders) then `build` (libs + apps).

### Build Apps Only (After libs are built)

```bash
npm run build:api
npm run build:backoffice
npm run build:pos
```

---

## Special Build Flags and Considerations

### POS and Backoffice `predev`/`prebuild` Scripts

Both `apps/pos` and `apps/backoffice` have `predev` and `prebuild` scripts that force `@jurnapod/offline-db` to build first:

```json
// apps/pos/package.json
{
  "scripts": {
    "predev": "npm run build -w @jurnapod/offline-db",
    "prebuild": "npm run build -w @jurnapod/offline-db"
  }
}
```

This is necessary because:
- Both apps import `dexie` from `@jurnapod/offline-db`
- Vite needs the compiled output before it can bundle the app

### Why `@jurnapod/offline-db` Has No Internal Dependencies

`@jurnapod/offline-db` uses Dexie (IndexedDB wrapper) for offline storage. It intentionally has **no** internal dependencies to:
- Keep the bundle size small for the POS PWA
- Ensure it builds quickly (it's a predev dependency for both apps)
- Avoid triggering cascading rebuilds across the monorepo

### TypeScript Build References

The root `tsconfig.build.json` configures TypeScript project references:

```json
{
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/db" },
    { "path": "packages/modules/platform" },
    ...
  ]
}
```

Running `tsc -b tsconfig.build.json` from the root builds packages in dependency order without manual sequencing.

### No Circular Dependencies

This monorepo is structured as a **directed acyclic graph (DAG)**:

```
shared  →  db
   ↓        ↓
auth   sync-core  modules-platform
   ↓        ↓              ↓
   └────────┴──────────────┴→ modules-accounting
        ↓                           ↓
   modules-treasury            modules-inventory
        ↓                           ↓
   pos-sync ←────────────────── modules-accounting
        ↓
   api
```

**There are no circular imports between packages.** If you encounter a build error about circular dependencies, it likely indicates a import path mistake (using `@/` alias to import from an app that re-exports package code).

---

## Package Inventory

| Package | Type | Dependencies | Exports |
|---------|------|--------------|---------|
| `@jurnapod/shared` | lib | (none) | Zod schemas, types, constants |
| `@jurnapod/db` | lib | (none) | Kysely client, migrations |
| `@jurnapod/offline-db` | lib | (none) | Dexie wrapper for IndexedDB |
| `@jurnapod/notifications` | lib | (none) | Email service |
| `@jurnapod/telemetry` | lib | (none) | SLO, metrics, correlation |
| `@jurnapod/auth` | lib | db, shared | JWT, passwords, RBAC |
| `@jurnapod/sync-core` | lib | db, shared | Sync registry, idempotency |
| `@jurnapod/modules-platform` | lib | db, shared | Settings, audit, feature flags |
| `@jurnapod/modules-inventory-costing` | lib | db, shared, platform | FIFO, moving average, standard cost |
| `@jurnapod/modules-accounting` | lib | db, shared | Journals, posting, fiscal years |
| `@jurnapod/modules-sales` | lib | db, shared | Invoices, payments, credit notes |
| `@jurnapod/modules-reporting` | lib | db, shared | Trial balance, P&L, reports |
| `@jurnapod/modules-reservations` | lib | db, shared | Table reservations, sessions |
| `@jurnapod/modules-inventory` | lib | db, shared, inventory-costing | Items, variants, stock |
| `@jurnapod/modules-treasury` | lib | db, shared, accounting, platform | Cash/bank mutations |
| `@jurnapod/backoffice-sync` | lib | shared, sync-core | Backoffice sync |
| `@jurnapod/pos-sync` | lib | db, shared, sync-core, inventory, accounting | POS sync |
| `@jurnapod/api` | app | (all packages) | Hono REST API |
| `@jurnapod/backoffice` | app | offline-db (dev) | React dashboard |
| `@jurnapod/pos` | app | offline-db (dev) | React POS PWA |

---

## Troubleshooting

### "Cannot find module '@jurnapod/...'"

**Cause**: The dependency hasn't been built yet.

**Fix**: Run `npm run build:libs` from the repo root.

### "tsc --build" fails with "Project references output file cannot be found"

**Cause**: A downstream package's output was deleted but its dependents still reference it.

**Fix**: Run `npm run clean && npm run build:libs`.

### Vite build fails for POS or Backoffice

**Cause**: `@jurnapod/offline-db` wasn't built before Vite started.

**Fix**: The `predev`/`prebuild` scripts should handle this automatically. If they didn't, run:
```bash
npm run build -w @jurnapod/offline-db
npm run build -w @jurnapod/pos  # or backoffice
```

### Build works locally but fails in CI

**Cause**: `dist/` folders might be gitignored and not restored from cache.

**Fix**: Ensure the CI pipeline runs `npm run build:libs` before `npm run build:api`, etc.

---

## Quick Reference for Developers

| Scenario | Command |
|----------|---------|
| First time setup | `npm run build:libs` |
| Work on `@jurnapod/api` | `npm run build:libs && npm run build:api` |
| Work on `@jurnapod/pos-sync` | `npm run build:libs` (sync-core, modules already included) |
| Work on `@jurnapod/pos` | `npm run build -w @jurnapod/offline-db && npm run build:pos` |
| Work on a domain module | `npm run build -w @jurnapod/modules-<name>` |
| Full rebuild | `npm run build:clean` |
