// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for date-helpers UTC ISO Z-string conversion functions
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import { toUtcIso, fromUtcIso } from '../../../src/lib/date-helpers';

describe('toUtcIso.dateLike (nullable — replaces toRfc3339)', () => {
  it('converts Date to Z string', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    const result = toUtcIso.dateLike(date);
    expect(result).toBe('2024-03-15T10:30:00.000Z');
  });

  it('handles ISO datetime string', () => {
    const result = toUtcIso.dateLike('2024-03-15T10:30:00Z');
    expect(result).toMatch(/^2024-03-15T10:30:00/);
  });

  it('handles MySQL datetime format', () => {
    const result = toUtcIso.dateLike('2024-03-15 10:30:00');
    expect(result).toMatch(/^2024-03-15/);
  });

  it('returns null for null input with { nullable: true }', () => {
    const result = toUtcIso.dateLike(null, { nullable: true });
    expect(result).toBeNull();
  });

  it('returns null for undefined input with { nullable: true }', () => {
    const result = toUtcIso.dateLike(undefined, { nullable: true });
    expect(result).toBeNull();
  });

  it('throws for null input without nullable', () => {
    expect(() => toUtcIso.dateLike(null)).toThrow();
  });

  it('throws for undefined input without nullable', () => {
    expect(() => toUtcIso.dateLike(undefined)).toThrow();
  });

  it('throws for invalid date string', () => {
    expect(() => toUtcIso.dateLike('not-a-date')).toThrow();
  });

  it('throws for invalid numeric value', () => {
    expect(() => toUtcIso.dateLike(12345 as any)).toThrow();
  });
});

describe('toUtcIso.dateLike with non-null input (replaces toRfc3339Required)', () => {
  it('converts valid Date object', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    const result = toUtcIso.dateLike(date) as string;
    expect(result).toBe('2024-03-15T10:30:00.000Z');
  });

  it('converts valid string', () => {
    const result = toUtcIso.dateLike('2024-03-15T10:30:00Z') as string;
    expect(result).toBe('2024-03-15T10:30:00.000Z');
  });

  it('throws for null without nullable (required behavior)', () => {
    expect(() => toUtcIso.dateLike(null as any)).toThrow();
  });

  it('throws for undefined without nullable (required behavior)', () => {
    expect(() => toUtcIso.dateLike(undefined as any)).toThrow();
  });

  it('throws for invalid date string', () => {
    expect(() => toUtcIso.dateLike('invalid')).toThrow();
  });
});

describe('toUtcIso.epochMs (replaces fromEpochMs)', () => {
  it('converts epoch ms to Z string', () => {
    const epoch = new Date('2024-03-15T10:30:00.000Z').getTime();
    expect(toUtcIso.epochMs(epoch)).toBe('2024-03-15T10:30:00.000Z');
  });

  it('throws for NaN', () => {
    expect(() => toUtcIso.epochMs(NaN)).toThrow();
  });

  it('throws for Infinity', () => {
    expect(() => toUtcIso.epochMs(Infinity)).toThrow();
  });
});

describe('fromUtcIso.epochMs (replaces toEpochMs)', () => {
  it('converts Z string to epoch ms', () => {
    const expected = new Date('2024-03-15T10:30:00.000Z').getTime();
    expect(fromUtcIso.epochMs('2024-03-15T10:30:00.000Z')).toBe(expected);
  });

  it('throws for invalid input', () => {
    expect(() => fromUtcIso.epochMs('not-a-date')).toThrow();
  });
});

describe('fromUtcIso.mysql (replaces toMysqlDateTime)', () => {
  it('converts Z string to MySQL DATETIME format', () => {
    expect(fromUtcIso.mysql('2024-03-15T10:30:00.000Z')).toBe('2024-03-15 10:30:00');
  });

  it('throws for invalid input', () => {
    expect(() => fromUtcIso.mysql('not-a-date')).toThrow();
  });
});

describe('fromUtcIso.dateOnly (replaces toDateOnly)', () => {
  it('extracts YYYY-MM-DD from Z string', () => {
    expect(fromUtcIso.dateOnly('2024-03-15T10:30:00.000Z')).toBe('2024-03-15');
  });

  it('throws for invalid input', () => {
    expect(() => fromUtcIso.dateOnly('not-a-date')).toThrow();
  });
});
