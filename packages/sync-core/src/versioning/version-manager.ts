// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { SyncTier } from "../types/index.js";

export interface VersionInfo {
  company_id: number;
  tier: SyncTier;
  current_version: number;
  last_updated_at: Date;
}

export class SyncVersionManager {
  private versions = new Map<string, number>();

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

    // TODO: Query database for current version
    const version = await this.queryDatabaseVersion(companyId, tier);
    this.versions.set(key, version);
    
    return version;
  }

  /**
   * Increment version for a company and tier
   */
  async incrementVersion(companyId: number, tier: SyncTier): Promise<number> {
    const key = this.getVersionKey(companyId, tier);
    
    // TODO: Atomically increment in database
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
    // TODO: Query database for all tier versions
    const tiers: SyncTier[] = ['REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS'];
    const versions: VersionInfo[] = [];
    
    for (const tier of tiers) {
      const version = await this.getCurrentVersion(companyId, tier);
      versions.push({
        company_id: companyId,
        tier,
        current_version: version,
        last_updated_at: new Date() // TODO: Get actual last updated time from DB
      });
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
   * TODO: Implement actual database query
   */
  private async queryDatabaseVersion(companyId: number, tier: SyncTier): Promise<number> {
    // TODO: SELECT current_version FROM sync_tier_versions WHERE company_id = ? AND tier = ?
    // If no record exists, INSERT with version 1
    return 1; // Placeholder
  }

  /**
   * Atomically increment version in database
   * TODO: Implement actual database update
   */
  private async incrementDatabaseVersion(companyId: number, tier: SyncTier): Promise<number> {
    // TODO: UPDATE sync_tier_versions SET current_version = current_version + 1, last_updated_at = NOW() 
    //       WHERE company_id = ? AND tier = ?
    // If no record exists, INSERT with version 1
    return 2; // Placeholder
  }
}

export const syncVersionManager = new SyncVersionManager();