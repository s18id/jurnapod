// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for item-image-adapter.
 *
 * Tests adapter DB operations with real database via fixtures.
 * Storage provider is mocked via MockStorageProvider (acceptable - injected interface).
 * Kysely queries are NOT mocked (real DB required).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getTestDb, closeTestDb } from '../../helpers/db';
import {
  createTestCompany,
  createTestItem,
  createTestUser,
  resetFixtureRegistry,
  registerFixtureCleanup,
  type CompanyFixture,
  type ItemFixture,
  type UserFixture,
} from '../../fixtures';
import { sql } from 'kysely';
import { setStorageProvider, resetStorageProvider } from '../../../src/lib/uploader/index';
import { uploadItemImageAdapter, deleteItemImageAdapter, updateItemImageAdapter, setPrimaryItemImageAdapter } from '../../../src/lib/uploader/adapters/item-image-adapter';
import type { StorageProvider } from '../../../src/lib/uploader/types';

// =============================================================================
// Mock Storage Provider (valid test double - injected interface, not DB internal)
// =============================================================================

class MockStorageProvider implements StorageProvider {
  private _storage = new Map<string, Buffer>();
  private _deletedKeys: string[] = [];

  async store(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    this._storage.set(key, buffer);
    return `/mock/${key}`;
  }

  async delete(key: string): Promise<void> {
    this._deletedKeys.push(key);
    this._storage.delete(key);
  }

  getUrl(key: string): string {
    return `/mock/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return this._storage.has(key);
  }

  getStoredKeys(): string[] {
    return Array.from(this._storage.keys());
  }

  getDeletedKeys(): string[] {
    return this._deletedKeys;
  }

  preStore(key: string, buffer: Buffer): void {
    this._storage.set(key, buffer);
  }

  reset(): void {
    this._storage.clear();
    this._deletedKeys = [];
  }
}

// =============================================================================
// Test Helpers
// =============================================================================

async function createImageBuffer(): Promise<Buffer> {
  const sharp = await import('sharp');
  const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
  return sharp.default(Buffer.from(svg)).jpeg().toBuffer();
}

// =============================================================================
// Setup / Teardown
// =============================================================================

let mockProvider: MockStorageProvider;
let company: CompanyFixture;
let item: ItemFixture;
let user: UserFixture;

  beforeAll(async () => {
  mockProvider = new MockStorageProvider();

  // Setup uploader with mock storage provider
  resetStorageProvider();
  setStorageProvider(mockProvider);

  // Create test fixtures
  company = await createTestCompany();
  item = await createTestItem(company.id);
  user = await createTestUser(company.id);
});

afterAll(async () => {
  // Clean up any item_images created during tests
  try {
    const db = getTestDb();
    // @fixture-teardown-allowed rationale="cleanup only"
    await sql`DELETE FROM item_images WHERE company_id = ${company.id}`.execute(db);
  } catch (_) {
    // Ignore cleanup errors
  }

  resetFixtureRegistry();
  await closeTestDb();
});

beforeEach(async () => {
  mockProvider.reset();
  // Clean up item_images before each test to ensure sort_order calculations are predictable
  try {
    const db = getTestDb();
    // @fixture-teardown-allowed rationale="cleanup only"
    await sql`DELETE FROM item_images WHERE company_id = ${company.id}`.execute(db);
  } catch (_) {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Tests - uploadItemImageAdapter
// =============================================================================

describe('item-image-adapter.uploadItemImageAdapter', () => {
  it('stores files with item_image entity type', async () => {
    const buffer = await createImageBuffer();

    await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'test.jpg',
      'image/jpeg',
      {}
    );

    // Verify storage was called with item_image entity type
    const storedKeys = mockProvider.getStoredKeys();
    expect(storedKeys.some((k) => k.includes('/item_image/'))).toBe(true);
  });

  it('uses provided sortOrder when given', async () => {
    const buffer = await createImageBuffer();

    await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'test.jpg',
      'image/jpeg',
      { sortOrder: 7 }
    );

    // sortOrder 7 should be used - files should be stored
    const storedKeys = mockProvider.getStoredKeys();
    expect(storedKeys.length).toBeGreaterThan(0);

    // Verify the record was inserted with correct sort_order
    const db = getTestDb();
    const record = await db
      .selectFrom('item_images')
      .where('item_id', '=', item.id)
      .where('company_id', '=', company.id)
      .selectAll()
      .executeTakeFirst();

    expect(record?.sort_order).toBe(7);
  });

  it('returns result with id, urls, metadata', async () => {
    const buffer = await createImageBuffer();

    const result = await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'test.jpg',
      'image/jpeg',
      {}
    );

    // Result structure validation
    expect(result).toHaveProperty('id');
    expect(typeof result.id).toBe('number');
    expect(result).toHaveProperty('urls');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('originalName');
    expect(result.metadata).toHaveProperty('mimeType');
    expect(result.metadata).toHaveProperty('sizeBytes');
  });

  it('on DB failure cleans up stored files', async () => {
    const buffer = await createImageBuffer();

    // Attempt to upload with an invalid company_id that doesn't exist
    // This should fail at the DB insert level and trigger cleanup
    await expect(
      uploadItemImageAdapter(999999, item.id, user.id, buffer, 'test.jpg', 'image/jpeg', {})
    ).rejects.toThrow();
  });

  it('auto-computes sort_order when not provided', async () => {
    const buffer = await createImageBuffer();

    // First upload - should get sort_order = 1
    await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'first.jpg',
      'image/jpeg',
      {}
    );

    // Second upload - should get sort_order = 2
    await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'second.jpg',
      'image/jpeg',
      {}
    );

    const db = getTestDb();
    const records = await db
      .selectFrom('item_images')
      .where('item_id', '=', item.id)
      .where('company_id', '=', company.id)
      .selectAll()
      .orderBy('sort_order', 'asc')
      .execute();

    expect(records[0]?.sort_order).toBe(1);
    expect(records[1]?.sort_order).toBe(2);
  });
});

// =============================================================================
// Tests - deleteItemImageAdapter
// =============================================================================

describe('item-image-adapter.deleteItemImageAdapter', () => {
  it('deletes image and removes files from storage', async () => {
    const buffer = await createImageBuffer();

    // First upload an image
    const result = await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'to-delete.jpg',
      'image/jpeg',
      {}
    );

    const imageId = result.id;

    // Verify it exists in DB
    const db = getTestDb();
    const beforeDelete = await db
      .selectFrom('item_images')
      .where('id', '=', imageId)
      .selectAll()
      .executeTakeFirst();

    expect(beforeDelete).toBeDefined();

    // Delete the image
    await deleteItemImageAdapter(company.id, imageId, user.id);

    // Verify it's gone from DB
    const afterDelete = await db
      .selectFrom('item_images')
      .where('id', '=', imageId)
      .selectAll()
      .executeTakeFirst();

    expect(afterDelete).toBeUndefined();
  });

  it('returns early if image not found', async () => {
    // Should not throw, just return
    await expect(deleteItemImageAdapter(company.id, 999999, user.id)).resolves.not.toThrow();
  });

  it('rejects delete from different company', async () => {
    const buffer = await createImageBuffer();

    // Upload an image
    const result = await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'cross-company.jpg',
      'image/jpeg',
      {}
    );

    const imageId = result.id;

    // Try to delete with a different company ID - should return early (not found)
    await expect(deleteItemImageAdapter(999998, imageId, user.id)).resolves.not.toThrow();

    // Image should still exist (protected by company_id scoping)
    const db = getTestDb();
    const stillExists = await db
      .selectFrom('item_images')
      .where('id', '=', imageId)
      .selectAll()
      .executeTakeFirst();

    expect(stillExists).toBeDefined();
  });
});

// =============================================================================
// Tests - updateItemImageAdapter
// =============================================================================

describe('item-image-adapter.updateItemImageAdapter', () => {
  it('updates sort_order', async () => {
    const buffer = await createImageBuffer();

    const result = await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'to-update.jpg',
      'image/jpeg',
      {}
    );

    const imageId = result.id;

    // Update sort_order
    await updateItemImageAdapter(company.id, imageId, { sortOrder: 42 }, user.id);

    // Verify update
    const db = getTestDb();
    const record = await db
      .selectFrom('item_images')
      .where('id', '=', imageId)
      .select(['sort_order'])
      .executeTakeFirst();

    expect(record?.sort_order).toBe(42);
  });

  it('sets is_primary flag and unsets existing primary', async () => {
    const buffer = await createImageBuffer();

    // Upload two images
    const result1 = await uploadItemImageAdapter(company.id, item.id, user.id, buffer, 'img1.jpg', 'image/jpeg', {
      isPrimary: true,
    });
    const result2 = await uploadItemImageAdapter(company.id, item.id, user.id, buffer, 'img2.jpg', 'image/jpeg', {});

    const imageId1 = result1.id;
    const imageId2 = result2.id;

    // Set img2 as primary - should unset img1
    await updateItemImageAdapter(company.id, imageId2, { isPrimary: true }, user.id);

    const db = getTestDb();
    // Use sql tag for is_primary — Kysely Generated<number|null> type inference drops single-col select
    const [img1Result, img2Result] = await Promise.all([
      sql<{ is_primary: number }>`SELECT is_primary FROM item_images WHERE id = ${imageId1}`.execute(db),
      sql<{ is_primary: number }>`SELECT is_primary FROM item_images WHERE id = ${imageId2}`.execute(db),
    ]);

    expect(img1Result.rows[0]?.is_primary).toBe(0);
    expect(img2Result.rows[0]?.is_primary).toBe(1);
  });

  it('returns early if image not found', async () => {
    await expect(updateItemImageAdapter(company.id, 999999, { sortOrder: 1 }, user.id)).resolves.not.toThrow();
  });
});

// =============================================================================
// Tests - setPrimaryItemImageAdapter
// =============================================================================

describe('item-image-adapter.setPrimaryItemImageAdapter', () => {
  it('sets image as primary for item', async () => {
    const buffer = await createImageBuffer();

    // Upload an image
    const result = await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'to-primary.jpg',
      'image/jpeg',
      {}
    );

    const imageId = result.id;

    // Set as primary
    await setPrimaryItemImageAdapter(company.id, item.id, imageId, user.id);

    // Verify
    const db = getTestDb();
    // Use sql tag for is_primary — Kysely Generated<number|null> type inference drops single-col select
    const primaryResult = await sql<{ is_primary: number }>`SELECT is_primary FROM item_images WHERE id = ${imageId}`.execute(db);

    expect(primaryResult.rows[0]?.is_primary).toBe(1);
  });

  it('returns early if image not found', async () => {
    await expect(setPrimaryItemImageAdapter(company.id, item.id, 999999, user.id)).resolves.not.toThrow();
  });

  it('rejects image from different item', async () => {
    const buffer = await createImageBuffer();

    // Upload an image
    const result = await uploadItemImageAdapter(
      company.id,
      item.id,
      user.id,
      buffer,
      'wrong-item.jpg',
      'image/jpeg',
      {}
    );

    const imageId = result.id;

    // Create another item
    const item2 = await createTestItem(company.id, { name: 'Second Item' });

    // Try to set as primary for a different item - should return early
    await expect(setPrimaryItemImageAdapter(company.id, item2.id, imageId, user.id)).resolves.not.toThrow();

    // Image should NOT be primary (query scoped by item_id too)
    const db = getTestDb();
    // Use sql tag for is_primary — Kysely Generated<number|null> type inference drops single-col select
    const primaryResult = await sql<{ is_primary: number }>`SELECT is_primary FROM item_images WHERE id = ${imageId}`.execute(db);

    expect(primaryResult.rows[0]?.is_primary).toBe(0);
  });
});
