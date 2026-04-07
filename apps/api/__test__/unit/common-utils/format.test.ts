// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for common-utils format functions
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import { formatDateOnly, parseFeatureGateValue } from '../../../src/lib/shared/common-utils';

describe('common-utils.format', () => {
  describe('formatDateOnly', () => {
    it('formats Date object to YYYY-MM-DD', () => {
      const date = new Date('2024-03-15T10:30:00Z');
      const result = formatDateOnly(date);
      expect(result).toBe('2024-03-15');
    });

    it('handles string input', () => {
      const result = formatDateOnly('2024-12-25');
      expect(result).toBe('2024-12-25');
    });

    it('handles Date at midnight', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const result = formatDateOnly(date);
      expect(result).toBe('2024-01-01');
    });

    it('handles Date with timezone offset', () => {
      const date = new Date('2024-06-15T23:59:59+07:00');
      const result = formatDateOnly(date);
      expect(result).toMatch(/^2024-06-/);
    });
  });

  describe('parseFeatureGateValue', () => {
    // Note: This function returns boolean only - it converts all values to boolean

    it('parses "true" string as true', () => {
      expect(parseFeatureGateValue('true')).toBe(true);
    });

    it('parses "false" string as false', () => {
      expect(parseFeatureGateValue('false')).toBe(false);
    });

    it('parses "1" string as true', () => {
      expect(parseFeatureGateValue('1')).toBe(true);
    });

    it('parses "0" string as false', () => {
      expect(parseFeatureGateValue('0')).toBe(false);
    });

    it('parses numeric 1 as true', () => {
      expect(parseFeatureGateValue(1)).toBe(true);
    });

    it('parses numeric 0 as false', () => {
      expect(parseFeatureGateValue(0)).toBe(false);
    });

    it('parses boolean true as true', () => {
      expect(parseFeatureGateValue(true)).toBe(true);
    });

    it('parses boolean false as false', () => {
      expect(parseFeatureGateValue(false)).toBe(false);
    });

    it('parses null as false', () => {
      expect(parseFeatureGateValue(null)).toBe(false);
    });

    it('parses undefined as false', () => {
      expect(parseFeatureGateValue(undefined)).toBe(false);
    });

    it('treats unknown strings as false', () => {
      // Any string not "true" or "1" becomes false
      expect(parseFeatureGateValue('enabled')).toBe(false);
      expect(parseFeatureGateValue('some-feature')).toBe(false);
      expect(parseFeatureGateValue('42')).toBe(false);
    });

    it('treats empty string as false', () => {
      expect(parseFeatureGateValue('')).toBe(false);
    });
  });
});
