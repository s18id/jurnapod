// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createOutletTable } from '@jurnapod/modules-reservations';
import { closeTestDb, getTestDb } from '../../helpers/db';
import {
  createTestCompanyMinimal,
  createTestOutletMinimal,
  resetFixtureRegistry,
} from '../../fixtures';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import { createReservationV2, listReservations } from '../../../src/lib/reservations/crud';
import { checkReservationOverlap } from '../../../src/lib/reservations/availability';

describe('reservations canonical timestamp hard cutover (Story 52-2)', { timeout: 60000 }, () => {
  let companyId: number;
  let outletId: number;
  let tableId: number;

  beforeAll(async () => {
    await acquireReadLock();

    const company = await createTestCompanyMinimal();
    const outlet = await createTestOutletMinimal(company.id);
    companyId = company.id;
    outletId = outlet.id;

    const table = await createOutletTable(getTestDb(), {
      company_id: companyId,
      outlet_id: outletId,
      code: `T-${makeTag('52-2', 12)}`,
      name: 'Story 52-2 Table',
      zone: 'MAIN',
      capacity: 4,
      status: 'AVAILABLE',
      actor: {
        userId: 1,
        outletId,
      },
    });

    tableId = table.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it('creates reservation using canonical *_ts fields and derives reservation_at in output', async () => {
    const reservationTime = new Date('2026-05-01T10:00:00.000Z');

    const created = await createReservationV2({
      companyId: BigInt(companyId),
      outletId: BigInt(outletId),
      partySize: 2,
      customerName: 'Story 52-2 Customer',
      customerPhone: '+620000000001',
      reservationTime,
      durationMinutes: 90,
      tableId: BigInt(tableId),
      notes: 'canonical-ts',
      createdBy: 'story-52-2',
    });

    const row = await sql<{
      reservation_start_ts: number;
      reservation_end_ts: number;
      reservation_at: string | null;
    }>`
      SELECT reservation_start_ts, reservation_end_ts, reservation_at
      FROM reservations
      WHERE id = ${Number(created.id)}
      LIMIT 1
    `.execute(getTestDb());

    expect(row.rows.length).toBe(1);
    const dbRow = row.rows[0]!;

    expect(Number(dbRow.reservation_start_ts)).toBe(reservationTime.getTime());
    expect(Number(dbRow.reservation_end_ts)).toBe(reservationTime.getTime() + 90 * 60_000);
    expect(dbRow.reservation_at).toBeNull();

    const listed = await listReservations(companyId, {
      outlet_id: outletId,
      limit: 10,
      offset: 0,
      from: reservationTime.toISOString(),
      to: reservationTime.toISOString(),
      overlap_filter: false,
    });

    const found = listed.find((r) => Number(r.reservation_id) === Number(created.id));
    expect(found).toBeDefined();
    expect(found?.reservation_at).toBe(reservationTime.toISOString());
  });

  it('enforces non-overlap when end equals next start (a_end == b_start)', async () => {
    const firstStart = new Date('2026-05-01T13:00:00.000Z');

    await createReservationV2({
      companyId: BigInt(companyId),
      outletId: BigInt(outletId),
      partySize: 2,
      customerName: 'Overlap Boundary Customer',
      customerPhone: '+620000000002',
      reservationTime: firstStart,
      durationMinutes: 60,
      tableId: BigInt(tableId),
      notes: 'overlap-boundary',
      createdBy: 'story-52-2',
    });

    const nextStartAtBoundary = new Date(firstStart.getTime() + 60 * 60_000); // exact end boundary
    const overlapAtBoundary = await checkReservationOverlap(
      getTestDb(),
      BigInt(companyId),
      BigInt(outletId),
      BigInt(tableId),
      nextStartAtBoundary,
      30
    );
    expect(overlapAtBoundary).toBe(false);

    const nextStartBeforeBoundary = new Date(nextStartAtBoundary.getTime() - 60_000); // overlap by 1 minute
    const overlapBeforeBoundary = await checkReservationOverlap(
      getTestDb(),
      BigInt(companyId),
      BigInt(outletId),
      BigInt(tableId),
      nextStartBeforeBoundary,
      30
    );
    expect(overlapBeforeBoundary).toBe(true);
  });
});
