# @jurnapod/modules-reservations

Table reservations and service sessions for Jurnapod ERP.

## Overview

The `@jurnapod/modules-reservations` package provides:

- **Reservation management** — Create, update, cancel reservations
- **Table availability** — Check availability with overlap rules
- **Table occupancy** — Track current table status
- **Service sessions** — Manage dine-in session lifecycle
- **Timezone handling** — Proper timezone resolution per outlet

## Installation

```bash
npm install @jurnapod/modules-reservations
```

## Usage

### Reservations

```typescript
import { ReservationService } from '@jurnapod/modules-reservations';

const reservationService = new ReservationService(db);

// Create reservation
const reservation = await reservationService.create({
  companyId: 1,
  outletId: 1,
  customerId: 5,
  tableId: 10,
  reservationStartTs: 1705302000000,  // Unix milliseconds
  reservationEndTs: 1705305600000,
  partySize: 4,
  notes: 'Birthday celebration'
});

// Update reservation
await reservationService.update(1, reservation.id, {
  reservationEndTs: 1705307400000,  // Extend by 30 min
  partySize: 5
});

// Cancel reservation
await reservationService.cancel(1, reservation.id, 'Customer requested');
```

### Availability Check

```typescript
import { checkAvailability, findAvailableTables } from '@jurnapod/modules-reservations';

// Check specific table
await checkAvailability(db, {
  companyId: 1,
  outletId: 1,
  tableId: 10,
  reservationStartTs: startTs,
  reservationEndTs: endTs
});

// Find available tables for party
const tables = await findAvailableTables(db, {
  companyId: 1,
  outletId: 1,
  partySize: 4,
  reservationStartTs: startTs,
  reservationEndTs: endTs
});
```

### Table Occupancy

```typescript
import { TableOccupancyService } from '@jurnapod/modules-reservations';

const occupancy = new TableOccupancyService(db);

// Get current occupancy for outlet
const currentTables = await occupancy.getCurrent(1, 1);

// Occupy table (when customer sits)
await occupancy.occupy({
  companyId: 1,
  outletId: 1,
  tableId: 10,
  sessionId: 'sess_abc123',
  occupiedAt: Date.now()
});

// Release table (when customer leaves)
await occupancy.release({
  companyId: 1,
  outletId: 1,
  tableId: 10,
  sessionId: 'sess_abc123'
});
```

## Time Handling

This package uses **Unix milliseconds** (BIGINT) for canonical storage:

```typescript
// Create from Date
const startTs = Temporal.Now.plainDateTimeISO()
  .toZonedDateTimeISO('Asia/Jakarta')
  .epochMilliseconds;

// Query by date range (pass numeric boundaries)
const reservations = await reservationService.queryByDateRange(
  companyId,
  outletId,
  startOfDayTs,  // Unix ms
  endOfDayTs     // Unix ms
);
```

## Table States

| State | Description |
|-------|-------------|
| `VACANT` | Table available for seating |
| `OCCUPIED` | Currently has active session |
| `RESERVED` | Upcoming reservation (not yet seated) |
| `BLOCKED` | Temporarily unavailable |

## Architecture

```
packages/modules-reservations/
├── src/
│   ├── index.ts                    # Main exports
│   ├── reservations/              # Reservation CRUD
│   ├── service-sessions/           # Session lifecycle
│   ├── table-occupancy/            # Table status
│   ├── outlet-tables/              # Table management
│   ├── table-sync/                 # POS sync data
│   ├── time/                       # Timezone, overlap
│   └── interfaces/                  # Service interfaces
```

## Related Packages

- [@jurnapod/modules-sales](../sales) - Links to ordering
- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Reservation schemas