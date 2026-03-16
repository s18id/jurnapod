// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Fixture Utilities
 * 
 * Centralized test fixture creation for API integration tests.
 * Creates isolated test data (company, outlet, user) with proper cleanup.
 */

import type { Pool } from "mysql2/promise";
import { randomUUID } from "crypto";

export interface TestCompany {
  id: number;
  name: string;
  code: string;
}

export interface TestOutlet {
  id: number;
  companyId: number;
  name: string;
  code: string;
}

export interface TestUser {
  id: number;
  companyId: number;
  email: string;
  name: string;
}

export interface TestFixtureContext {
  company: TestCompany;
  outlet: TestOutlet;
  user: TestUser;
  cleanup: () => Promise<void>;
}

/**
 * Creates a complete test fixture set (company + outlet + user)
 * Returns the created entities and a cleanup function
 */
export async function createTestFixture(
  dbPool: Pool,
  prefix: string = "test"
): Promise<TestFixtureContext> {
  const runId = Date.now().toString(36);
  const uuid = randomUUID().slice(0, 8);
  
  // Create company
  const [companyResult] = await dbPool.execute(
    `INSERT INTO companies (name, code, currency_code, timezone, created_at, updated_at) 
     VALUES (?, ?, 'IDR', 'Asia/Jakarta', NOW(), NOW())`,
    [`${prefix} Company ${runId}`, `${prefix.toUpperCase()}${uuid}`]
  );
  const companyId = Number((companyResult as any).insertId);
  
  // Create outlet
  const [outletResult] = await dbPool.execute(
    `INSERT INTO outlets (company_id, name, code, address, phone, email, is_active, created_at, updated_at) 
     VALUES (?, ?, ?, '', '', '', 1, NOW(), NOW())`,
    [companyId, `${prefix} Outlet ${runId}`, `${prefix.toUpperCase()}OUT${uuid}`]
  );
  const outletId = Number((outletResult as any).insertId);
  
  // Create user
  const [userResult] = await dbPool.execute(
    `INSERT INTO users (company_id, email, password_hash, name, is_active, created_at, updated_at) 
     VALUES (?, ?, 'test-hash', ?, 1, NOW(), NOW())`,
    [companyId, `test-${uuid}@example.com`, `Test User ${runId}`]
  );
  const userId = Number((userResult as any).insertId);
  
  // Assign user to outlet
  await dbPool.execute(
    `INSERT INTO user_outlets (user_id, outlet_id, created_at) VALUES (?, ?, NOW())`,
    [userId, outletId]
  );
  
  // Assign OWNER role
  await dbPool.execute(
    `INSERT INTO user_role_assignments (user_id, role_id, company_id, created_at)
     SELECT ?, id, ?, NOW() FROM roles WHERE name = 'OWNER'`,
    [userId, companyId]
  );
  
  return {
    company: { id: companyId, name: `${prefix} Company ${runId}`, code: `${prefix.toUpperCase()}${uuid}` },
    outlet: { id: outletId, companyId, name: `${prefix} Outlet ${runId}`, code: `${prefix.toUpperCase()}OUT${uuid}` },
    user: { id: userId, companyId, email: `test-${uuid}@example.com`, name: `Test User ${runId}` },
    cleanup: async () => {
      // Cleanup in reverse order
      await dbPool.execute('DELETE FROM user_role_assignments WHERE user_id = ?', [userId]);
      await dbPool.execute('DELETE FROM user_outlets WHERE user_id = ?', [userId]);
      await dbPool.execute('DELETE FROM users WHERE id = ?', [userId]);
      await dbPool.execute('DELETE FROM outlets WHERE id = ?', [outletId]);
      await dbPool.execute('DELETE FROM companies WHERE id = ?', [companyId]);
    }
  };
}

/**
 * Checks if test fixtures exist, creates them if not
 * Safe to call in test setup
 */
export async function ensureTestFixtures(dbPool: Pool): Promise<TestFixtureContext> {
  // Try to find existing test fixture
  const [existing] = await dbPool.execute(
    `SELECT c.id as company_id, o.id as outlet_id, u.id as user_id 
     FROM companies c 
     JOIN outlets o ON o.company_id = c.id 
     JOIN users u ON u.company_id = c.id 
     WHERE c.code LIKE 'TEST%' 
     LIMIT 1`
  );
  
  if ((existing as any[]).length > 0) {
    const row = (existing as any[])[0];
    return {
      company: { id: row.company_id, name: 'Existing Test Company', code: 'TEST' },
      outlet: { id: row.outlet_id, companyId: row.company_id, name: 'Existing Test Outlet', code: 'TESTOUT' },
      user: { id: row.user_id, companyId: row.company_id, email: 'existing@test.com', name: 'Existing Test User' },
      cleanup: async () => { /* Don't cleanup existing fixtures */ }
    };
  }
  
  return createTestFixture(dbPool);
}

/**
 * Creates a test fixture and automatically registers cleanup
 * Use this in test files for per-test fixtures
 */
export async function createTestFixtureWithCleanup(
  dbPool: Pool,
  prefix: string = "test"
): Promise<TestFixtureContext> {
  const fixture = await createTestFixture(dbPool, prefix);
  
  // Register cleanup to run after test
  const originalCleanup = fixture.cleanup;
  fixture.cleanup = async () => {
    await originalCleanup();
  };
  
  return fixture;
}
