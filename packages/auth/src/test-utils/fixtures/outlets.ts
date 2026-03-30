import type { AuthDbAdapter } from '../../types.js';

export interface OutletFixture {
  id: number;
  company_id: number;
  code: string;
  name: string;
}

export async function createOutlet(
  adapter: AuthDbAdapter,
  companyId: number,
  overrides: Partial<OutletFixture> = {}
): Promise<OutletFixture> {
  const code = overrides.code || `OUT${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
  const name = overrides.name || `Test Outlet ${code}`;

  const result = await adapter.db
    .insertInto('outlets')
    .values({
      company_id: companyId,
      code,
      name,
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    company_id: companyId,
    code,
    name,
  };
}

export async function cleanupOutlets(adapter: AuthDbAdapter, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await adapter.db
    .deleteFrom('outlets')
    .where('id', 'in', ids)
    .execute();
}
