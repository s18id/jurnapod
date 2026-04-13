// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for permission test fixtures
 * 
 * Tests the permission mask building and helper functions.
 */

import { describe, it, expect } from 'vitest';
import { buildPermissionMask, buildPermissionMaskFromArray, PERMISSION_BITS, PERMISSION_MASK } from '../../test/fixtures/permissions.js';

describe('Permission Fixtures', () => {
  describe('buildPermissionMask', () => {
    it('should return 0 for empty permissions', () => {
      const mask = buildPermissionMask({});
      expect(mask).toBe(0);
    });

    it('should set READ bit correctly', () => {
      const mask = buildPermissionMask({ read: true });
      expect(mask).toBe(PERMISSION_BITS.READ);
      expect(mask).toBe(1);
    });

    it('should set CREATE bit correctly', () => {
      const mask = buildPermissionMask({ create: true });
      expect(mask).toBe(PERMISSION_BITS.CREATE);
      expect(mask).toBe(2);
    });

    it('should set UPDATE bit correctly', () => {
      const mask = buildPermissionMask({ update: true });
      expect(mask).toBe(PERMISSION_BITS.UPDATE);
      expect(mask).toBe(4);
    });

    it('should set DELETE bit correctly', () => {
      const mask = buildPermissionMask({ delete: true });
      expect(mask).toBe(PERMISSION_BITS.DELETE);
      expect(mask).toBe(8);
    });

    it('should set ANALYZE bit correctly', () => {
      const mask = buildPermissionMask({ analyze: true });
      expect(mask).toBe(PERMISSION_BITS.ANALYZE);
      expect(mask).toBe(16);
    });

    it('should set MANAGE bit correctly', () => {
      const mask = buildPermissionMask({ manage: true });
      expect(mask).toBe(PERMISSION_BITS.MANAGE);
      expect(mask).toBe(32);
    });

    it('should combine multiple bits correctly', () => {
      const mask = buildPermissionMask({ read: true, create: true, update: true, delete: true });
      expect(mask).toBe(PERMISSION_MASK.CRUD);
      expect(mask).toBe(15); // 1 + 2 + 4 + 8
    });

    it('should build CRUDA mask correctly', () => {
      const mask = buildPermissionMask({ read: true, create: true, update: true, delete: true, analyze: true });
      expect(mask).toBe(PERMISSION_MASK.CRUDA);
      expect(mask).toBe(31); // 1 + 2 + 4 + 8 + 16
    });

    it('should build CRUDAM mask correctly', () => {
      const mask = buildPermissionMask({ read: true, create: true, update: true, delete: true, analyze: true, manage: true });
      expect(mask).toBe(PERMISSION_MASK.CRUDAM);
      expect(mask).toBe(63); // 1 + 2 + 4 + 8 + 16 + 32
    });

    it('should ignore undefined permissions', () => {
      const mask = buildPermissionMask({ read: true, create: undefined as any });
      expect(mask).toBe(PERMISSION_BITS.READ);
    });
  });

  describe('buildPermissionMaskFromArray', () => {
    it('should return 0 for empty array', () => {
      const mask = buildPermissionMaskFromArray([]);
      expect(mask).toBe(0);
    });

    it('should build mask from single permission string', () => {
      const mask = buildPermissionMaskFromArray(['read']);
      expect(mask).toBe(PERMISSION_BITS.READ);
    });

    it('should build mask from multiple permission strings', () => {
      const mask = buildPermissionMaskFromArray(['read', 'create', 'update']);
      expect(mask).toBe(7); // 1 + 2 + 4
    });

    it('should be case insensitive', () => {
      const mask1 = buildPermissionMaskFromArray(['READ', 'CREATE']);
      const mask2 = buildPermissionMaskFromArray(['read', 'create']);
      expect(mask1).toBe(mask2);
    });

    it('should ignore unknown permission strings', () => {
      const mask = buildPermissionMaskFromArray(['read', 'unknown', 'create']);
      expect(mask).toBe(3); // Only read + create
    });

    it('should handle all canonical permissions', () => {
      const mask = buildPermissionMaskFromArray(['read', 'create', 'update', 'delete', 'analyze', 'manage']);
      expect(mask).toBe(63);
    });
  });

  describe('Canonical Permission Bits', () => {
    it('should have correct READ bit value', () => {
      expect(PERMISSION_BITS.READ).toBe(1);
    });

    it('should have correct CREATE bit value', () => {
      expect(PERMISSION_BITS.CREATE).toBe(2);
    });

    it('should have correct UPDATE bit value', () => {
      expect(PERMISSION_BITS.UPDATE).toBe(4);
    });

    it('should have correct DELETE bit value', () => {
      expect(PERMISSION_BITS.DELETE).toBe(8);
    });

    it('should have correct ANALYZE bit value', () => {
      expect(PERMISSION_BITS.ANALYZE).toBe(16);
    });

    it('should have correct MANAGE bit value', () => {
      expect(PERMISSION_BITS.MANAGE).toBe(32);
    });
  });

  describe('Canonical Permission Masks', () => {
    it('should have correct CRUD mask value', () => {
      expect(PERMISSION_MASK.CRUD).toBe(15); // 1 + 2 + 4 + 8
    });

    it('should have correct CRUDA mask value', () => {
      expect(PERMISSION_MASK.CRUDA).toBe(31); // 1 + 2 + 4 + 8 + 16
    });

    it('should have correct CRUDAM mask value', () => {
      expect(PERMISSION_MASK.CRUDAM).toBe(63); // 1 + 2 + 4 + 8 + 16 + 32
    });
  });
});
