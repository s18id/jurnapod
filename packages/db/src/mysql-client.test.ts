// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for DbConn class in mysql-client.ts
 */

import { test, after, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createDbPool, DbConn } from './index.js';
import type { Pool } from 'mysql2';

// Test database configuration from environment
const TEST_CONFIG = {
  host: process.env.DB_HOST || '172.18.0.2',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'mariadb',
  database: process.env.DB_NAME || 'jurnapod'
};

describe('DbConn', () => {
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

  test('query() - SELECT returns rows', async () => {
    const rows = await db.query<{ value: number }>('SELECT 1 as value');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].value, 1);
  });

  test('querySingle() - returns first row or null', async () => {
    // Returns null when no rows
    const nullResult = await db.querySingle<{ value: number }>('SELECT 1 as value WHERE 1 = 0');
    assert.strictEqual(nullResult, null);

    // Returns first row when rows exist
    const result = await db.querySingle<{ value: number }>('SELECT 1 as value UNION SELECT 2 as value');
    assert.ok(result !== null);
    assert.strictEqual(result.value, 1);
  });

  test('execute() - INSERT returns affectedRows and insertId', async () => {
    // Use a test table that exists in the schema
    const result = await db.execute(
      'INSERT INTO companies (code, name) VALUES (?, ?)',
      ['TEST_' + Date.now(), 'Test Company']
    );

    assert.ok(result.insertId !== undefined);
    assert.ok(result.insertId > 0);
    assert.strictEqual(result.affectedRows, 1);

    // Cleanup - rollback via transaction since we need insertId for cleanup
    // Actually we can't rollback an INSERT. Let's just use transactions in the actual test.
  });

  test('execute() - UPDATE returns affectedRows', async () => {
    // First insert a test record
    const insertResult = await db.execute(
      'INSERT INTO companies (code, name) VALUES (?, ?)',
      ['TEST_UPDATE_' + Date.now(), 'Test Company for Update']
    );

    const updateResult = await db.execute(
      'UPDATE companies SET name = ? WHERE id = ?',
      ['Updated Name', insertResult.insertId]
    );

    assert.ok(updateResult.affectedRows >= 1);
  });

  test('begin()/commit() - transaction commits successfully', async () => {
    await db.begin();
    try {
      await db.execute(
        'INSERT INTO companies (code, name) VALUES (?, ?)',
        ['TEST_COMMIT_' + Date.now(), 'Test Company Commit']
      );
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }

    // Verify the insert was committed
    const rows = await db.query<{ id: number }>(
      'SELECT id FROM companies WHERE code LIKE ? ORDER BY id DESC LIMIT 1',
      ['TEST_COMMIT_%']
    );
    assert.ok(rows.length > 0);
  });

  test('begin()/rollback() - transaction rolls back successfully', async () => {
    // Use unique identifier for this test run (keep under 32 chars for companies.code)
    const uniqueCode = 'RB_' + Date.now().toString(36).toUpperCase();

    await db.begin();
    try {
      await db.execute(
        'INSERT INTO companies (code, name) VALUES (?, ?)',
        [uniqueCode, 'Test Company Rollback']
      );
      await db.rollback();
    } catch (error) {
      await db.rollback();
      throw error;
    }

    // Verify the specific insert was rolled back - record should not exist
    const result = await db.querySingle<{ count: number }>(
      'SELECT COUNT(*) as count FROM companies WHERE code = ?',
      [uniqueCode]
    );
    assert.strictEqual(result?.count, 0);
  });

  test('begin() - transaction already in progress error', async () => {
    await db.begin();
    try {
      await assert.rejects(
        async () => {
          await db.begin();
        },
        {
          message: 'Transaction already in progress'
        }
      );
    } finally {
      await db.rollback();
    }
  });

  test('commit() - no transaction in progress error', async () => {
    await assert.rejects(
      async () => {
        await db.commit();
      },
      {
        message: 'No transaction in progress'
      }
    );
  });

  test('rollback() - no transaction in progress error', async () => {
    await assert.rejects(
      async () => {
        await db.rollback();
      },
      {
        message: 'No transaction in progress'
      }
    );
  });

  test('withTransaction() - executes query in transaction', async () => {
    const rows = await db.withTransaction<any[]>(
      'SELECT 1 as value'
    );

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].value, 1);
  });

  test('withTransaction() - rolls back on SQL error', async () => {
    // Get initial count
    const initialRows = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM companies WHERE code LIKE ?',
      ['TEST_WTX_%']
    );
    const initialCount = initialRows[0].count;

    // This SQL will fail (invalid column), triggering rollback
    await assert.rejects(
      async () => {
        await db.withTransaction(
          'INSERT INTO companies (nonexistent_column, name) VALUES (?, ?)',
          ['TEST_WTX_' + Date.now(), 'Test']
        );
      }
    );

    // Verify nothing was inserted
    const finalRows = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM companies WHERE code LIKE ?',
      ['TEST_WTX_%']
    );
    assert.strictEqual(finalRows[0].count, initialCount);
  });

  test('kysely getter - returns Kysely instance', () => {
    const kysely = db.kysely;
    assert.ok(kysely !== null);
    assert.ok(typeof kysely.selectFrom === 'function');
  });

  test('startTransaction() - returns ControlledTransactionBuilder', async () => {
    const trx = await db.startTransaction().execute();

    try {
      // Use the transaction
      await trx.insertInto('companies').values({
        code: 'TEST_TRX_' + Date.now(),
        name: 'Test Transaction'
      }).execute();

      await trx.commit().execute();
    } catch (error) {
      await trx.rollback().execute();
      throw error;
    }

    // Verify the insert was committed
    const rows = await db.query(
      'SELECT id FROM companies WHERE code LIKE ? ORDER BY id DESC LIMIT 1',
      ['TEST_TRX_%']
    );
    assert.ok(rows.length > 0);
  });

  test('getConnection() - returns raw connection', async () => {
    const conn = await db.getConnection();
    try {
      assert.ok(conn !== null);
      // Use the connection
      const rows = await new Promise<any[]>((resolve, reject) => {
        conn.query('SELECT 1 as value', (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      assert.strictEqual(rows[0].value, 1);
    } finally {
      conn.release();
    }
  });
});
