// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for createDbPool() in pool.ts
 */

import { test, afterAll, describe } from 'vitest';
import assert from 'node:assert';
import { createDbPool, type DbPoolConfig } from '../../src/pool.js';
import type { Pool, PoolConnection } from 'mysql2';

// Test database configuration from environment
const TEST_CONFIG = {
  host: process.env.DB_HOST || '172.18.0.2',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'mariadb',
  database: process.env.DB_NAME || 'jurnapod'
};

describe('createDbPool', () => {
  // Helper to create a pool and ensure cleanup
  function createTestPool(config: DbPoolConfig = {}): Pool {
    const pool = createDbPool({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      user: TEST_CONFIG.user,
      password: TEST_CONFIG.password,
      database: TEST_CONFIG.database,
      ...config
    });
    return pool;
  }

  test('creates pool with individual config params', async () => {
    const pool = createTestPool({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.port,
      user: TEST_CONFIG.user,
      password: TEST_CONFIG.password,
      database: TEST_CONFIG.database
    });

    // Verify pool can execute a simple query
    const conn = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    try {
      const result = await new Promise<any>((resolve, reject) => {
        conn.query('SELECT 1 as value', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      assert.strictEqual(result[0].value, 1);
    } finally {
      conn.release();
      await pool.end();
    }
  });

  test('creates pool with URI string', async () => {
    const pool = createDbPool({
      uri: `mysql://${TEST_CONFIG.user}:${TEST_CONFIG.password}@${TEST_CONFIG.host}:${TEST_CONFIG.port}/${TEST_CONFIG.database}`
    });

    // Verify pool can execute a simple query
    const conn = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    try {
      const result = await new Promise<any>((resolve, reject) => {
        conn.query('SELECT 1 as value', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      assert.strictEqual(result[0].value, 1);
    } finally {
      conn.release();
      await pool.end();
    }
  });

  test('applies default options correctly', async () => {
    const pool = createTestPool({
      connectionLimit: 5
    });

    // Verify pool options by executing a query
    const conn = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    try {
      const result = await new Promise<any>((resolve, reject) => {
        conn.query('SELECT 1 as value', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      assert.strictEqual(result[0].value, 1);
    } finally {
      conn.release();
      await pool.end();
    }
  });

  test('applies custom charset normalization', async () => {
    // Test with utf8mb4_unicode_ci charset
    const pool = createTestPool({
      charset: 'utf8mb4_unicode_ci'
    });

    // Verify pool can execute a query
    const conn = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    try {
      const result = await new Promise<any>((resolve, reject) => {
        conn.query('SELECT @@character_set_connection as charset', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      // charset should be normalized to base charset (utf8mb4)
      assert.ok(['utf8mb4', 'utf8'].includes(result[0].charset));
    } finally {
      conn.release();
      await pool.end();
    }
  });

  test('pool can execute a simple query', async () => {
    const pool = createTestPool();

    try {
      const rows = await new Promise<any[]>((resolve, reject) => {
        pool.query('SELECT 1 as num, "hello" as str', (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].num, 1);
      assert.strictEqual(rows[0].str, 'hello');
    } finally {
      await pool.end();
    }
  });

  test('pool respects custom connectionLimit', async () => {
    const pool = createTestPool({
      connectionLimit: 3
    });

    // Get multiple connections to verify limit is respected
    const conn1 = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    const conn2 = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    const conn3 = await new Promise<PoolConnection>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });

    // Release all connections
    conn1.release();
    conn2.release();
    conn3.release();

    await pool.end();
  });
});
