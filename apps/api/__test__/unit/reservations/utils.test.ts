import { describe, it, expect } from 'vitest';
import { toIso, toUnixMs, mapDbRowToReservation } from '@/lib/reservations/utils';
import { ReservationValidationError } from '@/lib/reservations/types';
import type { ReservationDbRow } from '@/lib/reservations/types';

// ============================================================================
// Test constants — computed dynamically to avoid timezone assumptions
// ============================================================================

// ISO 8601 string — always parsed as UTC per spec
const VALID_ISO = '2026-05-01T12:00:00.000Z';
const VALID_ISO_OFFSET = '2026-05-01T19:00:00+07:00';
const EPOCH_MS_UTC = new Date(VALID_ISO).getTime(); // UTC-based, timezone-independent

// MySQL DATETIME string — implementation-defined: interpreted as local time in
// this environment. Node.js 22 interprets it as local time when no TZ is given.
const VALID_MYSQL = '2026-05-01 12:00:00';
const EPOCH_MS_MYSQL = new Date(VALID_MYSQL).getTime(); // local-timezone dependent

// ============================================================================
// toIso tests
// ============================================================================

describe('toIso', () => {
  it('returns null for null input', () => {
    expect(toIso(null)).toBeNull();
  });

  it('converts valid Date to ISO string', () => {
    const date = new Date(VALID_ISO);
    const result = toIso(date);
    // Convert back to epoch ms to verify it represents the same instant
    expect(new Date(result as string).getTime()).toBe(EPOCH_MS_UTC);
  });

  it('converts valid ISO string to ISO string', () => {
    const result = toIso(VALID_ISO);
    expect(new Date(result as string).getTime()).toBe(EPOCH_MS_UTC);
  });

  it('converts ISO string with offset to Z-normalised ISO string', () => {
    const result = toIso(VALID_ISO_OFFSET);
    // +07:00 offset at 19:00 = 12:00 UTC → same epoch ms
    expect(new Date(result as string).getTime()).toBe(EPOCH_MS_UTC);
  });

  it('converts MySQL datetime string to ISO string', () => {
    const result = toIso(VALID_MYSQL);
    // MySQL datetime is interpreted as local time — the epoch ms matches that interpretation
    expect(new Date(result as string).getTime()).toBe(EPOCH_MS_MYSQL);
    // Verify it's an ISO Z string (not bare datetime)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('throws ReservationValidationError on invalid string', () => {
    expect(() => toIso('not-a-date')).toThrow(ReservationValidationError);
  });

  it('throws ReservationValidationError on empty string', () => {
    expect(() => toIso('')).toThrow(ReservationValidationError);
  });

  it('throws ReservationValidationError on invalid Date (NaN)', () => {
    expect(() => toIso(new Date('invalid'))).toThrow(ReservationValidationError);
  });
});

// ============================================================================
// toUnixMs tests
// ============================================================================

describe('toUnixMs', () => {
  it('converts valid Date to epoch ms', () => {
    const date = new Date(VALID_ISO);
    expect(toUnixMs(date)).toBe(EPOCH_MS_UTC);
  });

  it('converts valid ISO string to epoch ms', () => {
    expect(toUnixMs(VALID_ISO)).toBe(EPOCH_MS_UTC);
  });

  it('converts ISO string with offset to epoch ms', () => {
    expect(toUnixMs(VALID_ISO_OFFSET)).toBe(EPOCH_MS_UTC);
  });

  it('converts MySQL datetime string to epoch ms', () => {
    const ms = toUnixMs(VALID_MYSQL);
    expect(ms).toBe(EPOCH_MS_MYSQL);
  });

  it('throws ReservationValidationError on invalid string', () => {
    expect(() => toUnixMs('not-a-date')).toThrow(ReservationValidationError);
  });

  it('throws ReservationValidationError on empty string', () => {
    expect(() => toUnixMs('')).toThrow(ReservationValidationError);
  });

  it('throws ReservationValidationError on invalid Date', () => {
    expect(() => toUnixMs(new Date('invalid'))).toThrow(ReservationValidationError);
  });

  it('reports type=Date in error for invalid Date NaN', () => {
    const invalidDate = new Date('invalid');
    expect(() => toUnixMs(invalidDate)).toThrow(/type=Date/);
  });

  it('throws with descriptive error for invalid string', () => {
    expect(() => toUnixMs('not-a-date')).toThrow(/Invalid datetime string/);
  });
});

// ============================================================================
// mapDbRowToReservation tests
// ============================================================================

const makeValidRow = (overrides?: Partial<ReservationDbRow>): ReservationDbRow => ({
  id: 1,
  company_id: 1,
  outlet_id: 1,
  table_id: null,
  table_code: null,
  table_name: null,
  reservation_code: 'RES-ABC123',
  status_id: 1, // PENDING
  status: null,
  party_size: null,
  guest_count: 4,
  customer_name: 'Test Customer',
  customer_phone: null,
  customer_email: null,
  reservation_time: null,
  reservation_at: null,
  reservation_start_ts: EPOCH_MS_UTC,
  reservation_end_ts: EPOCH_MS_UTC + 3600000,
  duration_minutes: 60,
  notes: null,
  cancellation_reason: null,
  created_by: 'test-user',
  updated_by: null,
  created_at: VALID_ISO,
  updated_at: VALID_ISO,
  arrived_at: null,
  seated_at: null,
  cancelled_at: null,
  linked_order_id: null,
  ...overrides,
});

describe('mapDbRowToReservation', () => {
  it('returns Reservation with Date objects from valid row', () => {
    const result = mapDbRowToReservation(makeValidRow());
    expect(result.reservationTime instanceof Date).toBe(true);
    expect(result.createdAt instanceof Date).toBe(true);
    expect(result.updatedAt instanceof Date).toBe(true);
  });

  it('creates reservationTime from validated timestamp-ms', () => {
    const result = mapDbRowToReservation(makeValidRow());
    expect(result.reservationTime.getTime()).toBe(EPOCH_MS_UTC);
  });

  it('creates createdAt from validated timestamp-ms', () => {
    const result = mapDbRowToReservation(makeValidRow({ created_at: VALID_ISO }));
    expect(result.createdAt.getTime()).toBe(EPOCH_MS_UTC);
  });

  it('creates updatedAt from validated timestamp-ms', () => {
    const result = mapDbRowToReservation(makeValidRow({ updated_at: VALID_ISO }));
    expect(result.updatedAt.getTime()).toBe(EPOCH_MS_UTC);
  });

  it('handles MySQL datetime format in created_at/updated_at', () => {
    const result = mapDbRowToReservation(makeValidRow({
      created_at: VALID_MYSQL,
      updated_at: VALID_MYSQL,
    }));
    // MySQL datetime is interpreted as local time
    expect(result.createdAt.getTime()).toBe(EPOCH_MS_MYSQL);
    expect(result.updatedAt.getTime()).toBe(EPOCH_MS_MYSQL);
  });

  it('throws when reservation_start_ts is null', () => {
    expect(() => mapDbRowToReservation(makeValidRow({ reservation_start_ts: null })))
      .toThrow(ReservationValidationError);
  });

  it('throws when reservation_start_ts is invalid', () => {
    expect(() => mapDbRowToReservation(makeValidRow({ reservation_start_ts: 'invalid' as any })))
      .toThrow(ReservationValidationError);
  });

  it('throws when created_at is null', () => {
    const row = makeValidRow({ created_at: null as any });
    expect(() => mapDbRowToReservation(row)).toThrow(ReservationValidationError);
  });

  it('throws when updated_at is null', () => {
    const row = makeValidRow({ updated_at: null as any });
    expect(() => mapDbRowToReservation(row)).toThrow(ReservationValidationError);
  });

  it('throws when created_at is invalid', () => {
    expect(() => mapDbRowToReservation(makeValidRow({ created_at: 'not-a-date' })))
      .toThrow(ReservationValidationError);
  });

  it('throws when updated_at is invalid', () => {
    expect(() => mapDbRowToReservation(makeValidRow({ updated_at: 'not-a-date' })))
      .toThrow(ReservationValidationError);
  });

  it('throws when created_at is empty string', () => {
    // toIso('') throws because parseIsoToTimestampMs rejects empty string
    expect(() => mapDbRowToReservation(makeValidRow({ created_at: '' })))
      .toThrow(ReservationValidationError);
  });

  it('throws when updated_at is empty string', () => {
    expect(() => mapDbRowToReservation(makeValidRow({ updated_at: '' })))
      .toThrow(ReservationValidationError);
  });
});
