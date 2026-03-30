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

  const result = await adapter.db
    .insertInto('users')
    .values({
      company_id: companyId,
      email,
      password_hash: passwordHash,
      is_active: overrides.is_active ?? 1,
    })
    .executeTakeFirst();

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
  
  // Delete related tokens before users (explicit cleanup for test isolation)
  await adapter.db
    .deleteFrom('email_tokens')
    .where('user_id', 'in', ids)
    .execute();
  
  await adapter.db
    .deleteFrom('auth_refresh_tokens')
    .where('user_id', 'in', ids)
    .execute();
  
  await adapter.db
    .deleteFrom('users')
    .where('id', 'in', ids)
    .execute();
}
