import type { AuthDbAdapter, AuthConfig } from '../../types.js';
import { PasswordHasher } from '../../passwords/hash.js';

export interface UserFixture {
  id: number;
  company_id: number;
  email: string;
  password_hash: string;
  is_active: number;
}

export async function createUser(
  adapter: AuthDbAdapter,
  companyId: number,
  overrides: Partial<UserFixture> = {},
  config: AuthConfig
): Promise<UserFixture & { plainPassword: string }> {
  const hasher = new PasswordHasher(config);
  const plainPassword = overrides.password_hash || 'TestPassword123!';
  const passwordHash = await hasher.hash(plainPassword);
  const email = overrides.email || `test${Date.now()}@example.com`;
  
  const result = await adapter.execute(
    `INSERT INTO users (company_id, email, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [companyId, email, passwordHash, overrides.is_active ?? 1]
  );
  
  return {
    id: Number(result.insertId),
    company_id: companyId,
    email,
    password_hash: passwordHash,
    is_active: overrides.is_active ?? 1,
    plainPassword,
  };
}

export async function cleanupUsers(adapter: AuthDbAdapter, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await adapter.execute(
    `DELETE FROM users WHERE id IN (${placeholders})`,
    ids
  );
}
