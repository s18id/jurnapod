import type { AuthDbAdapter } from '../../types.js';

export interface CompanyFixture {
  id: number;
  code: string;
  name: string;
  timezone: string;
}

export async function createCompany(
  adapter: AuthDbAdapter,
  overrides: Partial<CompanyFixture> = {}
): Promise<CompanyFixture> {
  const code = overrides.code || `TEST${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const name = overrides.name || `Test Company ${code}`;
  
  const result = await adapter.execute(
    `INSERT INTO companies (code, name, timezone, created_at, updated_at) 
     VALUES (?, ?, ?, NOW(), NOW())`,
    [code, name, overrides.timezone || 'UTC']
  );
  
  return {
    id: Number(result.insertId),
    code,
    name,
    timezone: overrides.timezone || 'UTC',
  };
}

export async function cleanupCompanies(adapter: AuthDbAdapter, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await adapter.execute(
    `DELETE FROM companies WHERE id IN (${placeholders})`,
    ids
  );
}
