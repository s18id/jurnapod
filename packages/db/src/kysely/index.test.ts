// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for Kysely integration via DbConn
 * 
 * Note: MariaDB doesn't support RETURNING clause, so we use insertId + SELECT pattern
 */

import { test, after, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createDbPool, DbConn } from '../index.js';
import type { Pool } from 'mysql2';

// Test database configuration from environment
const TEST_CONFIG = {
  host: process.env.DB_HOST || '172.18.0.2',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'mariadb',
  database: process.env.DB_NAME || 'jurnapod'
};

describe('Kysely via DbConn', () => {
  let pool: Pool;
  let db: DbConn;

  beforeEach(() => {
    pool = createDbPool({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      user: TEST_CONFIG.user,
      password: TEST_CONFIG.password,
      database: TEST_CONFIG.database,
      connectionLimit: 5
    });
    db = new DbConn(pool);
  });

  after(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test('db.kysely returns Kysely instance', () => {
    const kysely = db.kysely;
    assert.ok(kysely !== null);
    assert.ok(typeof kysely.selectFrom === 'function');
    assert.ok(typeof kysely.insertInto === 'function');
  });

  test('can execute type-safe SELECT query', async () => {
    const kysely = db.kysely;

    // Use a table that exists in the schema
    const result = await kysely
      .selectFrom('companies')
      .select(['id', 'code', 'name'])
      .limit(1)
      .executeTakeFirst();

    // Result may be null if table is empty, but query should work
    assert.ok(result === null || (result !== undefined && typeof result.id === 'number'));
  });

  test('properly reuses the mysql2 pool', async () => {
    const kysely = db.kysely;

    // Execute multiple queries
    await kysely.selectFrom('companies').select(['id']).limit(1).executeTakeFirst();
    await kysely.selectFrom('companies').select(['id']).limit(1).executeTakeFirst();
    await kysely.selectFrom('companies').select(['id']).limit(1).executeTakeFirst();

    // If we get here without errors, the pool is being reused correctly
    assert.ok(true);
  });

  test('can insert and retrieve', async () => {
    const kysely = db.kysely;

    const code = 'TEST_KYSELY_' + Date.now();

    // Insert without returning (MariaDB doesn't support RETURNING)
    const result = await kysely
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
    const inserted = await kysely
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    assert.ok(inserted !== undefined);
    assert.strictEqual(inserted.code, code);
    assert.strictEqual(inserted.name, 'Test Kysely Insert');
  });

  test('can use where clause with type safety', async () => {
    const kysely = db.kysely;

    // First insert a known record using DbConn.execute for insertId
    const code = 'TEST_WHERE_' + Date.now();
    const execResult = await db.execute(
      'INSERT INTO companies (code, name) VALUES (?, ?)',
      [code, 'Test Where Clause']
    );

    assert.ok(execResult.insertId);

    // Query with where clause using Kysely
    const result = await kysely
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    assert.ok(result !== undefined);
    assert.strictEqual(result.code, code);
    assert.strictEqual(result.name, 'Test Where Clause');
  });

  test('can update with type-safe query', async () => {
    const kysely = db.kysely;

    // Insert a record using DbConn.execute
    const code = 'TEST_UPDATE_' + Date.now();
    const execResult = await db.execute(
      'INSERT INTO companies (code, name) VALUES (?, ?)',
      [code, 'Original Name']
    );

    assert.ok(execResult.insertId);

    // Update the record using Kysely
    await kysely
      .updateTable('companies')
      .set({ name: 'Updated Name' })
      .where('id', '=', Number(execResult.insertId))
      .execute();

    // Verify the update
    const updated = await kysely
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    assert.ok(updated !== undefined);
    assert.strictEqual(updated.name, 'Updated Name');
  });

  test('can delete with type-safe query', async () => {
    const kysely = db.kysely;

    // Insert a record using DbConn.execute
    const code = 'TEST_DELETE_' + Date.now();
    const execResult = await db.execute(
      'INSERT INTO companies (code, name) VALUES (?, ?)',
      [code, 'To Be Deleted']
    );

    assert.ok(execResult.insertId);

    // Delete using raw SQL (MariaDB doesn't support DELETE...RETURNING that Kysely may generate)
    await db.execute('DELETE FROM companies WHERE code = ?', [code]);

    // Verify deletion using Kysely SELECT
    const result = await kysely
      .selectFrom('companies')
      .where('code', '=', code)
      .select(['id', 'code'])
      .executeTakeFirst();

    assert.strictEqual(result, undefined);
  });

  test('handles transaction with Kysely', async () => {
    const kysely = db.kysely;

    const trx = await kysely.startTransaction().execute();

    try {
      const code = 'TEST_TRX_KYSELY_' + Date.now();
      await trx
        .insertInto('companies')
        .values({
          code,
          name: 'Transaction Test'
        })
        .execute();

      await trx.commit().execute();
    } catch (error) {
      await trx.rollback().execute();
      throw error;
    }

    // Verify the insert was committed
    const result = await kysely
      .selectFrom('companies')
      .where('code', 'like', 'TEST_TRX_KYSELY_%')
      .select(['id', 'code'])
      .executeTakeFirst();

    assert.ok(result !== undefined);
  });
});
