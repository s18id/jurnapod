// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets DB Adapter for API
 * 
 * Implements the FixedAssetRepository interface from modules-accounting
 * using the API's database infrastructure.
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { FixedAssetRepository } from "@jurnapod/modules-accounting";

/**
 * Create a FixedAssetRepository instance using the API's database.
 */
export function createFixedAssetRepository(db?: KyselySchema): FixedAssetRepository {
  return new FixedAssetRepository(db ?? getDb());
}

// Singleton instance for consistent reuse across the API
let _repository: FixedAssetRepository | null = null;

export function getFixedAssetRepository(): FixedAssetRepository {
  if (!_repository) {
    _repository = createFixedAssetRepository();
  }
  return _repository;
}
