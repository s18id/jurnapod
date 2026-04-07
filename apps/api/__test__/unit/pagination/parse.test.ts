// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for pagination.parse
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import { parsePagination } from '../../../src/lib/pagination';
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../../../src/lib/pagination';

describe('pagination.parse', () => {
  describe('limit parsing', () => {
    it('parses numeric limit', () => {
      const result = parsePagination({ limit: 25 });
      expect(result.limit).toBe(25);
    });

    it('parses string limit via Number conversion', () => {
      const result = parsePagination({ limit: '50' as any });
      expect(result.limit).toBe(50);
    });

    it('caps limit at MAX_PAGE_SIZE', () => {
      const result = parsePagination({ limit: 500 });
      expect(result.limit).toBe(MAX_PAGE_SIZE);
    });

    it('uses default for missing limit', () => {
      const result = parsePagination({});
      expect(result.limit).toBe(DEFAULT_PAGE_SIZE);
    });

    it('handles zero limit (defaults to page size)', () => {
      const result = parsePagination({ limit: 0 });
      expect(result.limit).toBe(DEFAULT_PAGE_SIZE); // 0 is falsy, uses default
    });

    it('handles negative limit', () => {
      const result = parsePagination({ limit: -5 });
      expect(result.limit).toBe(1); // min is 1
    });
  });

  describe('offset parsing', () => {
    it('parses numeric offset', () => {
      const result = parsePagination({ offset: 50 });
      expect(result.offset).toBe(50);
    });

    it('uses default for missing offset', () => {
      const result = parsePagination({});
      expect(result.offset).toBe(0);
    });

    it('handles negative offset', () => {
      const result = parsePagination({ offset: -10 });
      expect(result.offset).toBe(0); // min is 0
    });
  });

  describe('page parsing', () => {
    it('calculates offset from page number', () => {
      const result = parsePagination({ page: 3, page_size: 20 });
      expect(result.offset).toBe(40); // (3-1) * 20
    });

    it('handles page 1', () => {
      const result = parsePagination({ page: 1, page_size: 25 });
      expect(result.offset).toBe(0);
    });
  });

  describe('page_size alias', () => {
    it('accepts page_size as alias for limit', () => {
      const result = parsePagination({ page_size: 30 });
      expect(result.limit).toBe(30);
    });

    it('caps page_size at MAX_PAGE_SIZE', () => {
      const result = parsePagination({ page_size: 300 });
      expect(result.limit).toBe(MAX_PAGE_SIZE);
    });
  });

  describe('combined parameters', () => {
    it('uses page to calculate offset when provided', () => {
      const result = parsePagination({ page: 2, limit: 10, offset: 5 });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(10); // page=2, pageSize=10 -> (2-1)*10 = 10
    });

    it('uses offset when page is not provided', () => {
      const result = parsePagination({ limit: 10, offset: 5 });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });
  });
});
