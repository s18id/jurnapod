// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for pagination.build
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import { buildPaginatedResponse, buildPaginationMeta } from '../../../src/lib/pagination';

describe('pagination.build', () => {
  describe('buildPaginatedResponse', () => {
    it('builds paginated response with data', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = buildPaginatedResponse(data, 100, 10);
      
      expect(result.data).toEqual(data);
      expect(result.total).toBe(100);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(10);
    });

    it('calculates page from data length and total', () => {
      const data = [{ id: 11 }, { id: 12 }, { id: 13 }];
      const result = buildPaginatedResponse(data, 50, 10);
      
      expect(result.page).toBeGreaterThan(1);
    });

    it('handles empty data array', () => {
      const result = buildPaginatedResponse([], 0, 10);
      
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(0);
    });

    it('calculates correct totalPages', () => {
      const result = buildPaginatedResponse([{ id: 1 }], 25, 10);
      expect(result.totalPages).toBe(3); // ceil(25/10)
    });
  });

  describe('buildPaginationMeta', () => {
    it('builds pagination meta with has_next and has_prev', () => {
      const meta = buildPaginationMeta(100, 10, 20);
      
      expect(meta.total).toBe(100);
      expect(meta.page_size).toBe(10);
      expect(meta.offset).toBe(20);
      expect(meta.page).toBe(3); // floor(20/10) + 1
      expect(meta.total_pages).toBe(10);
      expect(meta.has_next).toBe(true);
      expect(meta.has_prev).toBe(true);
    });

    it('has_next is false on last page', () => {
      const meta = buildPaginationMeta(100, 10, 90);
      
      expect(meta.has_next).toBe(false);
      expect(meta.has_prev).toBe(true);
    });

    it('has_prev is false on first page', () => {
      const meta = buildPaginationMeta(100, 10, 0);
      
      expect(meta.has_prev).toBe(false);
      expect(meta.has_next).toBe(true);
    });

    it('both has_next and has_prev false on single page', () => {
      const meta = buildPaginationMeta(5, 10, 0);
      
      expect(meta.has_next).toBe(false);
      expect(meta.has_prev).toBe(false);
    });

    it('calculates page correctly for offset 0', () => {
      const meta = buildPaginationMeta(50, 25, 0);
      
      expect(meta.page).toBe(1);
      expect(meta.total_pages).toBe(2);
    });
  });
});
