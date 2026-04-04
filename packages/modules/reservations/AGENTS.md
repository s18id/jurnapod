# AGENTS.md — @jurnapod/modules-reservations

## Package Purpose

Table reservations and service sessions for Jurnapod ERP — reservation management, table occupancy tracking, and session lifecycle.

**Core Capabilities:**
- **Reservation management**: Create, update, cancel reservations
- **Table availability**: Check availability with overlap rules
- **Table occupancy**: Track current table status
- **Service sessions**: Manage dine-in session lifecycle
- **Timezone handling**: Proper timezone resolution per outlet

**Boundaries:**
- ✅ In: Reservation CRUD, availability checking, session management, table occupancy
- ❌ Out: Ordering (modules-sales), payment processing

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Canonical Reservation Time Schema

**This package enforces the canonical reservation time schema:**
- `reservation_start_ts` (BIGINT) — Unix milliseconds, source of truth
- `reservation_end_ts` (BIGINT) — Unix milliseconds, source of truth
- `reservation_at` (DATETIME) — API compatibility, derived from `reservation_start_ts`

**Overlap rule:** `a_start < b_end && b_start < a_end` — `end == next start` is non-overlap

**Timezone resolution:** `outlet.timezone` → `company.timezone` (no UTC fallback)

---

## Architecture Patterns

### Reservation CRUD

```typescript
import { ReservationService } from '@jurnapod/modules-reservations';

const reservationService = new ReservationService(db);

// Create reservation
const reservation = await reservationService.create({
  companyId: 1,
  outletId: 1,
  customerId: 5,
  tableId: 10,
  reservationStartTs: 1705302000000,  // Unix ms
  reservationEndTs: 1705305600000,    // Unix ms
  partySize: 4,
  notes: 'Birthday celebration'
});
```

### Availability Check

```typescript
import { checkAvailability } from '@jurnapod/modules-reservations';

const available = await checkAvailability(db, {
  companyId: 1,
  outletId: 1,
  tableId: 10,
  reservationStartTs: 1705302000000,
  reservationEndTs: 1705305600000
});
// Throws if conflict, returns true if available
```

### Table Occupancy

```typescript
import { TableOccupancyService } from '@jurnapod/modules-reservations';

const occupancy = new TableOccupancyService(db);

// Get current occupancy
const current = await occupancy.getCurrent(1, 1);
// [{ tableId: 10, status: 'OCCUPIED', sessionId: '...', since: ts }, ...]

// Occupy table
await occupancy.occupy(1, 1, 10, sessionId, reservationStartTs);

// Release table
await occupancy.release(1, 1, 10, sessionId);
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| Reservations | `reservations/` | Reservation CRUD, availability |
| ServiceSessions | `service-sessions/` | Dine-in session lifecycle |
| TableOccupancy | `table-occupancy/` | Table status tracking |
| OutletTables | `outlet-tables/` | Table management |
| TableSync | `table-sync/` | Sync data for POS |
| Time | `time/` | Timezone, overlap calculation |

### File Structure

```
packages/modules/reservations/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── reservations/
│   │   ├── index.ts
│   │   ├── crud.ts                 # Create, read, update, cancel
│   │   ├── availability.ts         # Availability checking
│   │   ├── status.ts               # Status helpers
│   │   ├── types.ts
│   │   └── utils.ts
│   │
│   ├── service-sessions/
│   │   ├── index.ts
│   │   ├── lifecycle.ts            # Session lifecycle
│   │   ├── lines.ts                # Session order lines
│   │   ├── checkpoint.ts           # State checkpoints
│   │   └── session-utils.ts
│   │
│   ├── table-occupancy/
│   │   ├── index.ts
│   │   ├── service.ts              # Occupancy service
│   │   └── types.ts
│   │
│   ├── outlet-tables/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── types.ts
│   │
│   ├── table-sync/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── types.ts
│   │
│   ├── time/
│   │   ├── index.ts
│   │   ├── timezone.ts             # Timezone resolution
│   │   ├── timestamp.ts            # TS conversions
│   │   └── overlap.ts              # Overlap checking
│   │
│   └── interfaces/
│       ├── index.ts
│       ├── reservation-service.ts
│       └── shared.ts
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Review Checklist

When modifying this package:

- [ ] Uses BIGINT for `reservation_start_ts` and `reservation_end_ts`
- [ ] Derives `reservation_at` from timestamp (not legacy parsing)
- [ ] Overlap rule follows `a_start < b_end && b_start < a_end`
- [ ] Timezone resolved as `outlet → company` (no UTC fallback)
- [ ] Session lifecycle properly managed
- [ ] Table occupancy accurately tracked
- [ ] Kysely query builder used (not raw SQL)

---

## DB Testing Policy

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

DB-backed tests (tests that exercise database queries, transactions, or constraints) MUST use real database connections:

```typescript
// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { createKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

**Why no mocks for DB-backed tests?**
- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks don't reveal transaction isolation issues
- Integration with real DB catches performance problems early

**What to mock instead:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic (pure computation) may use unit tests without database.**

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas (reservation schemas)
- `@jurnapod/modules-sales` — Links to sales sessions

For project-wide conventions, see root `AGENTS.md`.