// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for SyncVersionManager
 * 
 * Tests for tier-based version management and caching
 */

import { describe, test, expect, beforeEach, afterAll, vi } from "vitest";
import { SyncVersionManager, syncVersionManager, type VersionInfo } from "./version-manager.js";
import type { SyncTier } from "../types/index.js";
import type { Pool, PoolConnection } from "mysql2/promise";

// Mock the database module
const mockExecute = vi.fn();
const mockGetConnection = vi.fn();
const mockBeginTransaction = vi.fn();
const mockCommit = vi.fn();
const mockRollback = vi.fn();
const mockRelease = vi.fn();
const mockEnd = vi.fn();

const mockPool = {
  execute: mockExecute,
  getConnection: mockGetConnection,
  end: mockEnd
} as unknown as Pool;

const mockConnection = {
  execute: mockExecute,
  beginTransaction: mockBeginTransaction,
  commit: mockCommit,
  rollback: mockRollback,
  release: mockRelease
} as unknown as PoolConnection;

// Mock the database module
vi.mock("@/lib/db", () => ({
  getDbPool: vi.fn(() => mockPool),
  closeDbPool: vi.fn(async () => {
    await mockEnd();
  })
}));

describe("SyncVersionManager", () => {
  const TEST_COMPANY_ID = 123;
  const TEST_TIER: SyncTier = "MASTER";

  beforeEach(() => {
    // Reset the singleton's cache
    syncVersionManager.invalidateCache();
    
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset connection mock
    mockGetConnection.mockResolvedValue(mockConnection);
    mockBeginTransaction.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRelease.mockReturnValue(undefined);
  });

  afterAll(async () => {
    // Close database pool after all tests (CRITICAL - see AGENTS.md)
    await mockEnd();
  });

  describe("queryDatabaseVersion", () => {
    test("should return version from database when record exists", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([
        [{ current_version: 42 }],
        []
      ]);

      // Act
      const result = await (syncVersionManager as any).queryDatabaseVersion(
        TEST_COMPANY_ID,
        TEST_TIER
      );

      // Assert
      expect(result).toBe(42);
      expect(mockExecute).toHaveBeenCalledWith(
        "SELECT current_version FROM sync_tier_versions WHERE company_id = ? AND tier = ?",
        [TEST_COMPANY_ID, TEST_TIER]
      );
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    test("should create new record with version 1 when record doesn't exist", async () => {
      // Arrange - First query returns empty (record doesn't exist)
      mockExecute
        .mockResolvedValueOnce([[], []]) // SELECT returns empty
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // INSERT succeeds

      // Act
      const result = await (syncVersionManager as any).queryDatabaseVersion(
        TEST_COMPANY_ID,
        TEST_TIER
      );

      // Assert
      expect(result).toBe(1);
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        "SELECT current_version FROM sync_tier_versions WHERE company_id = ? AND tier = ?",
        [TEST_COMPANY_ID, TEST_TIER]
      );
      expect(mockExecute).toHaveBeenNthCalledWith(
        2,
        "INSERT INTO sync_tier_versions (company_id, tier, current_version, last_updated_at) VALUES (?, ?, 1, NOW())",
        [TEST_COMPANY_ID, TEST_TIER]
      );
    });

    test("should handle database errors gracefully", async () => {
      // Arrange
      const dbError = new Error("Connection lost");
      mockExecute.mockRejectedValueOnce(dbError);

      // Act & Assert
      await expect(
        (syncVersionManager as any).queryDatabaseVersion(TEST_COMPANY_ID, TEST_TIER)
      ).rejects.toThrow("Connection lost");
    });
  });

  describe("incrementDatabaseVersion", () => {
    test("should atomically increment version by 1", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // UPDATE succeeds
        .mockResolvedValueOnce([[{ current_version: 43 }], []]); // SELECT returns new version

      // Act
      const result = await (syncVersionManager as any).incrementDatabaseVersion(
        TEST_COMPANY_ID,
        TEST_TIER
      );

      // Assert
      expect(result).toBe(43);
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        "UPDATE sync_tier_versions SET current_version = current_version + 1, last_updated_at = NOW() WHERE company_id = ? AND tier = ?",
        [TEST_COMPANY_ID, TEST_TIER]
      );
      expect(mockCommit).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
    });

    test("should create new record with version 1 when record doesn't exist", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }, []]) // UPDATE returns 0 rows (doesn't exist)
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // INSERT succeeds
        .mockResolvedValueOnce([[{ current_version: 1 }], []]); // SELECT returns version 1

      // Act
      const result = await (syncVersionManager as any).incrementDatabaseVersion(
        TEST_COMPANY_ID,
        TEST_TIER
      );

      // Assert
      expect(result).toBe(1);
      expect(mockExecute).toHaveBeenCalledTimes(3);
      expect(mockCommit).toHaveBeenCalled();
    });

    test("should handle concurrent increments safely with race condition retry", async () => {
      // Arrange
      const dupEntryError = new Error("Duplicate entry") as any;
      dupEntryError.code = "ER_DUP_ENTRY";

      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }, []]) // UPDATE returns 0 rows
        .mockRejectedValueOnce(dupEntryError) // INSERT fails with duplicate entry (race condition)
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Retry UPDATE succeeds
        .mockResolvedValueOnce([[{ current_version: 44 }], []]); // SELECT returns new version

      // Act
      const result = await (syncVersionManager as any).incrementDatabaseVersion(
        TEST_COMPANY_ID,
        TEST_TIER
      );

      // Assert
      expect(result).toBe(44);
      expect(mockExecute).toHaveBeenCalledTimes(4);
      expect(mockCommit).toHaveBeenCalled();
    });

    test("should throw on unexpected insert errors", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }, []]) // UPDATE returns 0 rows
        .mockRejectedValueOnce(new Error("Database constraint violation")); // Unexpected INSERT error

      // Act & Assert
      await expect(
        (syncVersionManager as any).incrementDatabaseVersion(TEST_COMPANY_ID, TEST_TIER)
      ).rejects.toThrow("Database constraint violation");
      expect(mockRollback).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
    });

    test("should return new version number", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ current_version: 100 }], []]);

      // Act
      const result = await (syncVersionManager as any).incrementDatabaseVersion(
        TEST_COMPANY_ID,
        TEST_TIER
      );

      // Assert
      expect(result).toBe(100);
      expect(typeof result).toBe("number");
    });
  });

  describe("getCurrentVersion", () => {
    test("should return cached version if available", async () => {
      // Arrange - Prime the cache
      mockExecute.mockResolvedValueOnce([[{ current_version: 50 }], []]);
      await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);
      
      vi.clearAllMocks();

      // Act - Should use cache, not query DB
      const result = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(result).toBe(50);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test("should query database if not cached", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 25 }], []]);

      // Act
      const result = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(result).toBe(25);
      expect(mockExecute).toHaveBeenCalledWith(
        "SELECT current_version FROM sync_tier_versions WHERE company_id = ? AND tier = ?",
        [TEST_COMPANY_ID, TEST_TIER]
      );
    });

    test("should cache the result for subsequent calls", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 75 }], []]);

      // Act
      const result1 = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);
      const result2 = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);
      const result3 = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(result1).toBe(75);
      expect(result2).toBe(75);
      expect(result3).toBe(75);
      expect(mockExecute).toHaveBeenCalledTimes(1); // Only queried once
    });

    test("should invalidate cache when explicitly called", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 30 }], []]);
      await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);
      
      // Invalidate cache
      syncVersionManager.invalidateCache(TEST_COMPANY_ID, TEST_TIER);
      
      mockExecute.mockResolvedValueOnce([[{ current_version: 31 }], []]);

      // Act
      const result = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(result).toBe(31);
      expect(mockExecute).toHaveBeenCalledTimes(2); // Queried again after invalidation
    });
  });

  describe("incrementVersion", () => {
    test("should increment version in database", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ current_version: 51 }], []]);

      // Act
      const result = await syncVersionManager.incrementVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(result).toBe(51);
    });

    test("should update cache with new version", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ current_version: 99 }], []]);

      // Act
      await syncVersionManager.incrementVersion(TEST_COMPANY_ID, TEST_TIER);
      
      vi.clearAllMocks();
      
      // Should use cached value
      const cachedResult = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(cachedResult).toBe(99);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test("should return new version number", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ current_version: 200 }], []]);

      // Act
      const result = await syncVersionManager.incrementVersion(TEST_COMPANY_ID, TEST_TIER);

      // Assert
      expect(result).toBe(200);
      expect(typeof result).toBe("number");
    });
  });

  describe("getAllVersions", () => {
    test("should return versions for all tiers", async () => {
      // Arrange
      const testDate = new Date("2026-03-15T10:30:00Z");
      const tiers: SyncTier[] = ["REALTIME", "OPERATIONAL", "MASTER", "ADMIN", "ANALYTICS"];
      
      // Setup mock for each tier query
      tiers.forEach((tier, index) => {
        mockExecute.mockResolvedValueOnce([
          [{ current_version: index + 1, last_updated_at: testDate }],
          []
        ]);
      });

      // Act
      const result = await syncVersionManager.getAllVersions(TEST_COMPANY_ID);

      // Assert
      expect(result).toHaveLength(5);
      expect(result.map((v: VersionInfo) => v.tier)).toEqual(tiers);
      expect(result.map((v: VersionInfo) => v.current_version)).toEqual([1, 2, 3, 4, 5]);
    });

    test("should include actual last_updated_at from database", async () => {
      // Arrange
      const testDate = new Date("2026-03-15T14:22:33Z");
      mockExecute.mockResolvedValue([
        [{ current_version: 10, last_updated_at: testDate }],
        []
      ]);

      // Act
      const result = await syncVersionManager.getAllVersions(TEST_COMPANY_ID);

      // Assert
      expect(result[0].last_updated_at).toEqual(testDate);
    });

    test("should create missing records automatically", async () => {
      // Arrange
      const testDate = new Date();
      
      // First tier exists
      mockExecute
        .mockResolvedValueOnce([
          [{ current_version: 5, last_updated_at: testDate }],
          []
        ])
        // Second tier doesn't exist
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        // Third tier exists
        .mockResolvedValueOnce([
          [{ current_version: 3, last_updated_at: testDate }],
          []
        ])
        // Fourth tier doesn't exist
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        // Fifth tier exists
        .mockResolvedValueOnce([
          [{ current_version: 8, last_updated_at: testDate }],
          []
        ]);

      // Act
      const result = await syncVersionManager.getAllVersions(TEST_COMPANY_ID);

      // Assert
      expect(result).toHaveLength(5);
      expect(result[1].current_version).toBe(1); // Created new
      expect(result[3].current_version).toBe(1); // Created new
      expect(mockExecute).toHaveBeenCalledTimes(7); // 5 SELECTs + 2 INSERTs
    });
  });

  describe("isVersionCurrent", () => {
    test("should return true when version >= current", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 10 }], []]);

      // Act
      const result = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, 10);

      // Assert
      expect(result).toBe(true);
    });

    test("should return true when version > current", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 10 }], []]);

      // Act
      const result = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, 15);

      // Assert
      expect(result).toBe(true);
    });

    test("should return false when version < current", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 20 }], []]);

      // Act
      const result = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, 15);

      // Assert
      expect(result).toBe(false);
    });

    test("should return true for equal version edge case", async () => {
      // Arrange
      mockExecute.mockResolvedValueOnce([[{ current_version: 1 }], []]);

      // Act
      const result = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, 1);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("getAffectedTiers", () => {
    test("should return correct tiers for known data types", () => {
      // Test real-time data types
      expect(syncVersionManager.getAffectedTiers("active_orders")).toEqual([
        "REALTIME",
        "OPERATIONAL"
      ]);
      expect(syncVersionManager.getAffectedTiers("table_status")).toEqual([
        "REALTIME",
        "OPERATIONAL"
      ]);
      expect(syncVersionManager.getAffectedTiers("payment_processing")).toEqual(["REALTIME"]);

      // Test operational data types
      expect(syncVersionManager.getAffectedTiers("reservations")).toEqual(["OPERATIONAL"]);
      expect(syncVersionManager.getAffectedTiers("item_availability")).toEqual([
        "OPERATIONAL",
        "MASTER"
      ]);
      expect(syncVersionManager.getAffectedTiers("price_changes")).toEqual([
        "OPERATIONAL",
        "MASTER"
      ]);

      // Test master data types
      expect(syncVersionManager.getAffectedTiers("items")).toEqual(["MASTER"]);
      expect(syncVersionManager.getAffectedTiers("item_groups")).toEqual(["MASTER"]);
      expect(syncVersionManager.getAffectedTiers("tax_rates")).toEqual(["MASTER"]);
      expect(syncVersionManager.getAffectedTiers("payment_methods")).toEqual(["MASTER"]);

      // Test administrative data types
      expect(syncVersionManager.getAffectedTiers("user_permissions")).toEqual(["ADMIN"]);
      expect(syncVersionManager.getAffectedTiers("outlet_settings")).toEqual(["ADMIN"]);
      expect(syncVersionManager.getAffectedTiers("compliance_data")).toEqual(["ADMIN"]);

      // Test analytics data types
      expect(syncVersionManager.getAffectedTiers("financial_reports")).toEqual(["ANALYTICS"]);
      expect(syncVersionManager.getAffectedTiers("audit_logs")).toEqual(["ANALYTICS"]);
      expect(syncVersionManager.getAffectedTiers("reconciliation_data")).toEqual(["ANALYTICS"]);
    });

    test("should default to MASTER for unknown data types", () => {
      expect(syncVersionManager.getAffectedTiers("unknown_type")).toEqual(["MASTER"]);
      expect(syncVersionManager.getAffectedTiers("custom_entity")).toEqual(["MASTER"]);
      expect(syncVersionManager.getAffectedTiers("random_string")).toEqual(["MASTER"]);
    });
  });

  describe("invalidateCache", () => {
    test("should invalidate specific company+tier", async () => {
      // Arrange - Prime cache for multiple companies/tiers
      mockExecute
        .mockResolvedValueOnce([[{ current_version: 10 }], []])
        .mockResolvedValueOnce([[{ current_version: 20 }], []]);
      
      await syncVersionManager.getCurrentVersion(1, "MASTER");
      await syncVersionManager.getCurrentVersion(2, "OPERATIONAL");
      
      vi.clearAllMocks();

      // Act - Invalidate only company 1, MASTER tier
      syncVersionManager.invalidateCache(1, "MASTER");
      
      // Company 1, MASTER should query again
      mockExecute.mockResolvedValueOnce([[{ current_version: 11 }], []]);
      const result1 = await syncVersionManager.getCurrentVersion(1, "MASTER");
      
      // Company 2, OPERATIONAL should still be cached
      const result2 = await syncVersionManager.getCurrentVersion(2, "OPERATIONAL");

      // Assert
      expect(result1).toBe(11);
      expect(result2).toBe(20);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    test("should invalidate all tiers for a company", async () => {
      // Arrange - Prime cache for multiple tiers
      mockExecute
        .mockResolvedValueOnce([[{ current_version: 1 }], []])
        .mockResolvedValueOnce([[{ current_version: 2 }], []])
        .mockResolvedValueOnce([[{ current_version: 3 }], []]);
      
      await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, "REALTIME");
      await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, "OPERATIONAL");
      await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, "MASTER");
      
      vi.clearAllMocks();

      // Act - Invalidate all tiers for company
      syncVersionManager.invalidateCache(TEST_COMPANY_ID);
      
      // All should query again
      mockExecute
        .mockResolvedValueOnce([[{ current_version: 10 }], []])
        .mockResolvedValueOnce([[{ current_version: 20 }], []])
        .mockResolvedValueOnce([[{ current_version: 30 }], []]);
      
      const realtime = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, "REALTIME");
      const operational = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, "OPERATIONAL");
      const master = await syncVersionManager.getCurrentVersion(TEST_COMPANY_ID, "MASTER");

      // Assert
      expect(realtime).toBe(10);
      expect(operational).toBe(20);
      expect(master).toBe(30);
      expect(mockExecute).toHaveBeenCalledTimes(3);
    });

    test("should invalidate all cached versions", async () => {
      // Arrange - Prime cache for multiple companies
      mockExecute
        .mockResolvedValueOnce([[{ current_version: 1 }], []])
        .mockResolvedValueOnce([[{ current_version: 2 }], []]);
      
      await syncVersionManager.getCurrentVersion(1, "MASTER");
      await syncVersionManager.getCurrentVersion(2, "MASTER");
      
      vi.clearAllMocks();

      // Act - Invalidate all
      syncVersionManager.invalidateCache();
      
      // Both should query again
      mockExecute
        .mockResolvedValueOnce([[{ current_version: 100 }], []])
        .mockResolvedValueOnce([[{ current_version: 200 }], []]);
      
      const result1 = await syncVersionManager.getCurrentVersion(1, "MASTER");
      const result2 = await syncVersionManager.getCurrentVersion(2, "MASTER");

      // Assert
      expect(result1).toBe(100);
      expect(result2).toBe(200);
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    test("should not throw when invalidating non-existent cache entries", () => {
      // Act & Assert - Should not throw
      expect(() => {
        syncVersionManager.invalidateCache(999, "MASTER");
      }).not.toThrow();
      
      expect(() => {
        syncVersionManager.invalidateCache(999);
      }).not.toThrow();
      
      expect(() => {
        syncVersionManager.invalidateCache();
      }).not.toThrow();
    });
  });

  describe("incrementMultipleTiers", () => {
    test("should increment versions for multiple tiers", async () => {
      // Arrange
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ current_version: 11 }], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([[{ current_version: 22 }], []]);

      // Act
      const result = await syncVersionManager.incrementMultipleTiers(TEST_COMPANY_ID, [
        "MASTER",
        "OPERATIONAL"
      ]);

      // Assert
      expect(result.MASTER).toBe(11);
      expect(result.OPERATIONAL).toBe(22);
    });

    test("should handle empty tier array", async () => {
      // Act
      const result = await syncVersionManager.incrementMultipleTiers(TEST_COMPANY_ID, []);

      // Assert
      expect(result).toEqual({});
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test("should handle all five tiers", async () => {
      // Arrange
      const versions = [10, 20, 30, 40, 50];
      versions.forEach((v) => {
        mockExecute
          .mockResolvedValueOnce([{ affectedRows: 1 }, []])
          .mockResolvedValueOnce([[{ current_version: v }], []]);
      });

      // Act
      const result = await syncVersionManager.incrementMultipleTiers(TEST_COMPANY_ID, [
        "REALTIME",
        "OPERATIONAL",
        "MASTER",
        "ADMIN",
        "ANALYTICS"
      ]);

      // Assert
      expect(result.REALTIME).toBe(10);
      expect(result.OPERATIONAL).toBe(20);
      expect(result.MASTER).toBe(30);
      expect(result.ADMIN).toBe(40);
      expect(result.ANALYTICS).toBe(50);
    });
  });
});

describe("SyncVersionManager - Edge Cases", () => {
  const TEST_COMPANY_ID = 123;
  const TEST_TIER: SyncTier = "MASTER";

  beforeEach(() => {
    syncVersionManager.invalidateCache();
    vi.clearAllMocks();
    mockGetConnection.mockResolvedValue(mockConnection);
    mockBeginTransaction.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRelease.mockReturnValue(undefined);
  });

  test("should handle concurrent cache reads", async () => {
    // Arrange
    mockExecute.mockResolvedValueOnce([[{ current_version: 42 }], []]);

    // Act - Multiple concurrent reads
    const [result1, result2, result3] = await Promise.all([
      syncVersionManager.getCurrentVersion(1, "MASTER"),
      syncVersionManager.getCurrentVersion(1, "MASTER"),
      syncVersionManager.getCurrentVersion(1, "MASTER")
    ]);

    // Assert - All should get same result, DB queried only once
    expect(result1).toBe(42);
    expect(result2).toBe(42);
    expect(result3).toBe(42);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test("should handle negative version numbers from DB", async () => {
    // Arrange - Edge case: negative version (shouldn't happen but code should handle)
    mockExecute.mockResolvedValueOnce([[{ current_version: -5 }], []]);

    // Act
    const result = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, 0);

    // Assert - 0 >= -5 should be true
    expect(result).toBe(true);
  });

  test("should handle transaction rollback on error", async () => {
    // Arrange
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockRejectedValueOnce(new Error("Select failed"));

    // Act & Assert
    await expect(
      syncVersionManager.incrementVersion(TEST_COMPANY_ID, TEST_TIER)
    ).rejects.toThrow("Select failed");
    
    expect(mockRollback).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
  });

  test("should handle multiple companies independently", async () => {
    // Arrange
    mockExecute
      .mockResolvedValueOnce([[{ current_version: 100 }], []])
      .mockResolvedValueOnce([[{ current_version: 200 }], []]);

    // Act
    const result1 = await syncVersionManager.getCurrentVersion(1, "MASTER");
    const result2 = await syncVersionManager.getCurrentVersion(2, "MASTER");

    // Assert
    expect(result1).toBe(100);
    expect(result2).toBe(200);
  });

  test("should handle version 0 correctly", async () => {
    // Arrange
    mockExecute.mockResolvedValueOnce([[{ current_version: 0 }], []]);

    // Act & Assert
    const isCurrent = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, 0);
    expect(isCurrent).toBe(true);

    const isBehind = await syncVersionManager.isVersionCurrent(TEST_COMPANY_ID, TEST_TIER, -1);
    expect(isBehind).toBe(false);
  });
});
