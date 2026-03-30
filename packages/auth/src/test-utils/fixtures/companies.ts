import type { AuthDbAdapter } from '../../types.js';
import { sql } from 'kysely';

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
  const timezone = overrides.timezone || 'UTC';

  const result = await adapter.db
    .insertInto('companies')
    .values({
      code,
      name,
      timezone,
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    code,
    name,
    timezone,
  };
}

export async function cleanupCompanies(adapter: AuthDbAdapter, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  // Delete related tokens before companies
  await adapter.db
    .deleteFrom('email_tokens')
    .where('company_id', 'in', ids)
    .execute();
  
  await adapter.db
    .deleteFrom('companies')
    .where('id', 'in', ids)
    .execute();
}
