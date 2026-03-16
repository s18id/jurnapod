// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { SyncTier } from "../types/index.js";
import type { Pool, Connection } from "mysql2/promise";

export interface VersionInfo {
  company_id: number;
  tier: SyncTier;
  current_version: number;
  last_updated_at: Date;
}

export class SyncVersionManager {
  private pool: Pool;
  private versions = new Map<string, number>();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get current version for a company and tier
   */
  async getCurrentVersion(companyId: number, tier: SyncTier): Promise<number> {
    const key = this.getVersionKey(companyId, tier);
    
    // Check memory cache first
    const cached = this.versions.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Query database for current version
    const version = await this.queryDatabaseVersion(companyId, tier);
    this.versions.set(key, version);
    
    return version;
  }

  /**
   * Increment version for a company and tier
   */
  async incrementVersion(companyId: number, tier: SyncTier): Promise<number> {
    const key = this.getVersionKey(companyId, tier);
    
    // Atomically increment in database
    const newVersion = await this.incrementDatabaseVersion(companyId, tier);
    this.versions.set(key, newVersion);
    
    return newVersion;
  }

  /**
   * Increment versions for multiple tiers (when data affects multiple tiers)
   */
  async incrementMultipleTiers(companyId: number, tiers: SyncTier[]): Promise<Record<SyncTier, number>> {
    const results: Record<string, number> = {};
    
    // TODO: Use database transaction to atomically update all tiers
    for (const tier of tiers) {
      results[tier] = await this.incrementVersion(companyId, tier);
    }
    
    return results as Record<SyncTier, number>;
  }

  /**
   * Get version info for all tiers for a company
   */
  async getAllVersions(companyId: number): Promise<VersionInfo[]> {
    const tiers: SyncTier[] = ['REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS'];
    const versions: VersionInfo[] = [];

    for (const tier of tiers) {
      const [rows] = await this.pool.execute(
        'SELECT current_version, last_updated_at FROM sync_tier_versions WHERE company_id = ? AND tier = ?',
        [companyId, tier]
      );

      const result = rows as Array<{ current_version: number; last_updated_at: Date }>;

      if (result.length > 0) {
        versions.push({
          company_id: companyId,
          tier,
          current_version: result[0].current_version,
          last_updated_at: result[0].last_updated_at
        });
      } else {
        // Record doesn't exist - insert with version 1
        await this.pool.execute(
          'INSERT INTO sync_tier_versions (company_id, tier, current_version, last_updated_at) VALUES (?, ?, 1, NOW())',
          [companyId, tier]
        );

        versions.push({
          company_id: companyId,
          tier,
          current_version: 1,
          last_updated_at: new Date()
        });
      }
    }

    return versions;
  }

  /**
   * Check if a version is current (not behind)
   */
  async isVersionCurrent(companyId: number, tier: SyncTier, version: number): Promise<boolean> {
    const currentVersion = await this.getCurrentVersion(companyId, tier);
    return version >= currentVersion;
  }

  /**
   * Determine which tiers are affected by a data change
   */
  getAffectedTiers(dataType: string): SyncTier[] {
    // Define which data types affect which tiers
    const tierMappings: Record<string, SyncTier[]> = {
      // Real-time data
      'active_orders': ['REALTIME', 'OPERATIONAL'],
      'table_status': ['REALTIME', 'OPERATIONAL'],
      'payment_processing': ['REALTIME'],
      
      // Operational data
      'reservations': ['OPERATIONAL'],
      'item_availability': ['OPERATIONAL', 'MASTER'],
      'price_changes': ['OPERATIONAL', 'MASTER'],
      
      // Master data
      'items': ['MASTER'],
      'item_groups': ['MASTER'],
      'tax_rates': ['MASTER'],
      'payment_methods': ['MASTER'],
      
      // Administrative data
      'user_permissions': ['ADMIN'],
      'outlet_settings': ['ADMIN'],
      'compliance_data': ['ADMIN'],
      
      // Analytics data
      'financial_reports': ['ANALYTICS'],
      'audit_logs': ['ANALYTICS'],
      'reconciliation_data': ['ANALYTICS']
    };

    return tierMappings[dataType] || ['MASTER']; // Default to MASTER if unknown
  }

  /**
   * Invalidate cached versions (call when database is updated externally)
   */
  invalidateCache(companyId?: number, tier?: SyncTier): void {
    if (companyId && tier) {
      const key = this.getVersionKey(companyId, tier);
      this.versions.delete(key);
    } else if (companyId) {
      // Invalidate all tiers for company
      const tiers: SyncTier[] = ['REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS'];
      for (const t of tiers) {
        const key = this.getVersionKey(companyId, t);
        this.versions.delete(key);
      }
    } else {
      // Invalidate all
      this.versions.clear();
    }
  }

  /**
   * Generate cache key for version storage
   */
  private getVersionKey(companyId: number, tier: SyncTier): string {
    return `${companyId}:${tier}`;
  }

  /**
   * Query database for current version
   */
  private async queryDatabaseVersion(companyId: number, tier: SyncTier): Promise<number> {
    // Query existing version
    const [rows] = await this.pool.execute(
      'SELECT current_version FROM sync_tier_versions WHERE company_id = ? AND tier = ?',
      [companyId, tier]
    );
    
    const result = rows as Array<{ current_version: number }>;
    
    if (result.length > 0) {
      return result[0].current_version;
    }
    
    // Record doesn't exist - insert with version 1
    await this.pool.execute(
      'INSERT INTO sync_tier_versions (company_id, tier, current_version, last_updated_at) VALUES (?, ?, 1, NOW())',
      [companyId, tier]
    );
    
    return 1;
  }

  /**
   * Atomically increment version in database
   */
  private async incrementDatabaseVersion(companyId: number, tier: SyncTier): Promise<number> {
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Try atomic update first
      const [updateResult] = await connection.execute(
        'UPDATE sync_tier_versions SET current_version = current_version + 1, last_updated_at = NOW() WHERE company_id = ? AND tier = ?',
        [companyId, tier]
      );
      
      const updateInfo = updateResult as { affectedRows: number };
      
      if (updateInfo.affectedRows === 0) {
        // Record doesn't exist - insert with version 1
        try {
          await connection.execute(
            'INSERT INTO sync_tier_versions (company_id, tier, current_version, last_updated_at) VALUES (?, ?, 1, NOW())',
            [companyId, tier]
          );
          await connection.commit();
          return 1;
        } catch (insertError: any) {
          // Handle race condition: another process may have inserted
          if (insertError.code === 'ER_DUP_ENTRY') {
            // Retry the update
            await connection.execute(
              'UPDATE sync_tier_versions SET current_version = current_version + 1, last_updated_at = NOW() WHERE company_id = ? AND tier = ?',
              [companyId, tier]
            );
          } else {
            throw insertError;
          }
        }
      }
      
      // Get the new version
      const [rows] = await connection.execute(
        'SELECT current_version FROM sync_tier_versions WHERE company_id = ? AND tier = ?',
        [companyId, tier]
      );
      
      await connection.commit();
      
      const result = rows as Array<{ current_version: number }>;
      return result[0]?.current_version ?? 1;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

// Singleton instance - must be initialized with setSyncVersionManagerPool before use
let _syncVersionManager: SyncVersionManager | null = null;

/**
 * Get the singleton SyncVersionManager instance
 * Must be initialized with setSyncVersionManagerPool before use
 */
export function getSyncVersionManager(): SyncVersionManager {
  if (!_syncVersionManager) {
    throw new Error(
      "SyncVersionManager not initialized. Call setSyncVersionManagerPool(pool) first."
    );
  }
  return _syncVersionManager;
}

/**
 * Initialize the SyncVersionManager singleton with a database pool
 * Should be called once during application startup
 */
export function setSyncVersionManagerPool(pool: Pool): void {
  _syncVersionManager = new SyncVersionManager(pool);
}

// Legacy export for backward compatibility - prefer using getSyncVersionManager()
export const syncVersionManager = {
  getCurrentVersion: (companyId: number, tier: SyncTier) =>
    getSyncVersionManager().getCurrentVersion(companyId, tier),
  incrementVersion: (companyId: number, tier: SyncTier) =>
    getSyncVersionManager().incrementVersion(companyId, tier),
  incrementMultipleTiers: (companyId: number, tiers: SyncTier[]) =>
    getSyncVersionManager().incrementMultipleTiers(companyId, tiers),
  getAllVersions: (companyId: number) =>
    getSyncVersionManager().getAllVersions(companyId),
  isVersionCurrent: (companyId: number, tier: SyncTier, version: number) =>
    getSyncVersionManager().isVersionCurrent(companyId, tier, version),
  getAffectedTiers: (dataType: string) =>
    getSyncVersionManager().getAffectedTiers(dataType),
  invalidateCache: (companyId?: number, tier?: SyncTier) =>
    getSyncVersionManager().invalidateCache(companyId, tier),
};
