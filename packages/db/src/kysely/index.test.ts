// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for Kysely factory functions.
 * 
 * Note: MariaDB doesn't support RETURNING clause, so we use insertId + SELECT pattern
 */

import { test, after, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createKysely, getKysely, KyselySchema } from './index.js';
import type { Kysely } from 'kysely';
import type { DB } from './schema.js';

// Test database configuration from environment
const TEST_CONFIG = {
  host: process.env.DB_HOST || '172.18.0.2',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'mariadb',
  database: process.env.DB_NAME || 'jurnapod'
};

describe('createKysely', () => {
  let db: KyselySchema;

  after(async () => {
    if (db) {
      await db.destroy();
    }
  });

  test('creates Kysely instance with connection params', async () => {
    db = createKysely({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      user: TEST_CONFIG.user,
      password: TEST_CONFIG.password,
      database: TEST_CONFIG.database,
      connectionLimit: 5
    });

    const result = await db
      .selectFrom('companies')
      .select(['id', 'code', 'name'])
      .limit(1)
      .executeTakeFirst();

    // Result may be null if table is empty, but query should work
    assert.ok(result === null || (result !== undefined && typeof result.id === 'number'));
  });

  test('can execute type-safe SELECT query', async () => {
    const result = await db
      .selectFrom('companies')
      .select(['id', 'code', 'name'])
      .limit(1)
      .executeTakeFirst();

    // Result may be null if table is empty, but query should work
    assert.ok(result === null || (result !== undefined && typeof result.id === 'number'));
  });

  test('properly reuses the mysql2 pool', async () => {
    // Execute multiple queries
    await db.selectFrom('companies').select(['id']).limit(1).executeTakeFirst();
    await db.selectFrom('companies').select(['id']).limit(1).executeTakeFirst();
    await db.selectFrom('companies').select(['id']).limit(1).executeTakeFirst();

    // If we get here without errors, the pool is being reused correctly
    assert.ok(true);
  });

  test('can insert and retrieve', async () => {
    const code = 'TEST_KYSELY_' + Date.now();

    // Insert without returning (MariaDB doesn't support RETURNING)
    const result = await db
      .insertInto('companies')
      .values({
        code,
        name: 'Test Kysely Insert'
      })
      .executeTakeFirst();

    // MySQL driver returns insertId in result
    assert.ok(result);
    assert.ok(typeof result.insertId === 'bigint' || typeof result.insertId === 'number');

    // Verify by querying
    const inserted = await db
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    assert.ok(inserted !== undefined);
    assert.strictEqual(inserted.code, code);
    assert.strictEqual(inserted.name, 'Test Kysely Insert');
  });

  test('can use where clause with type safety', async () => {
    const code = 'TEST_WHERE_' + Date.now();

    // Insert using Kysely
    const execResult = await db
      .insertInto('companies')
      .values({
        code,
        name: 'Test Where Clause'
      })
      .executeTakeFirst();

    assert.ok(execResult);
    const insertId = Number(execResult.insertId);

    // Query with where clause using Kysely
    const result = await db
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    assert.ok(result !== undefined);
    assert.strictEqual(result.code, code);
    assert.strictEqual(result.name, 'Test Where Clause');
  });

  test('can update with type-safe query', async () => {
    const code = 'TEST_UPDATE_' + Date.now();

    // Insert a record using Kysely
    const execResult = await db
      .insertInto('companies')
      .values({
        code,
        name: 'Original Name'
      })
      .executeTakeFirst();

    assert.ok(execResult);
    const insertId = Number(execResult.insertId);

    // Update the record using Kysely
    await db
      .updateTable('companies')
      .set({ name: 'Updated Name' })
      .where('id', '=', insertId)
      .execute();

    // Verify the update
    const updated = await db
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    assert.ok(updated !== undefined);
    assert.strictEqual(updated.name, 'Updated Name');
  });

  test('can delete with type-safe query', async () => {
    const code = 'TEST_DELETE_' + Date.now();

    // Insert a record using Kysely
    const execResult = await db
      .insertInto('companies')
      .values({
        code,
        name: 'To Be Deleted'
      })
      .executeTakeFirst();

    assert.ok(execResult);

    // Delete using Kysely
    await db
      .deleteFrom('companies')
      .where('code', '=', code)
      .execute();

    // Verify deletion using Kysely SELECT
    const result = await db
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code'])
      .executeTakeFirst();

    assert.strictEqual(result, undefined);
  });

  test('handles transaction with Kysely', async () => {
    const code = 'TEST_TRX_KYSELY_' + Date.now();

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('companies')
        .values({
          code,
          name: 'Transaction Test'
        })
        .execute();
    });

    // Verify the insert was committed
    const result = await db
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code'])
      .executeTakeFirst();

    assert.ok(result !== undefined);
  });

  test('destroy() closes pool', async () => {
    const testDb = createKysely({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      user: TEST_CONFIG.user,
      password: TEST_CONFIG.password,
      database: TEST_CONFIG.database,
      connectionLimit: 5
    });

    // Should work before destroy
    await testDb.selectFrom('companies').selectAll().execute();

    await testDb.destroy();

    // Should fail after destroy
    await assert.rejects(
      async () => {
        await testDb.selectFrom('companies').selectAll().execute();
      },
      { name: 'Error' }
    );
  });
});

describe('getKysely', () => {
  let db: KyselySchema;

  after(async () => {
    if (db) {
      await db.destroy();
    }
  });

  test('returns same instance for same config', () => {
    const db1 = getKysely({ uri: 'mysql://test-singleton-1' });
    const db2 = getKysely({ uri: 'mysql://test-singleton-1' });

    // Should be the same instance (singleton)
    assert.ok(db1 === db2);
    db = db1;
  });

  test('returns different instance for different config', () => {
    const db1 = getKysely({ uri: 'mysql://test-singleton-2' });
    const db2 = getKysely({ uri: 'mysql://test-singleton-3' });

    // Should be different instances
    assert.ok(db1 !== db2);

    // Cleanup
    db1.destroy();
    db2.destroy();
  });
});
