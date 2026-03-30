import type { AuthDbAdapter } from '../../types.js';

export interface RoleAssignment {
  userId: number;
  roleId: number;
  companyId: number;
  outletId?: number | null;
}

export async function getRoleIdByCode(
  adapter: AuthDbAdapter,
  code: string
): Promise<number | null> {
  const row = await adapter.db
    .selectFrom('roles')
    .where('code', '=', code)
    .select(['id'])
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function assignUserRole(
  adapter: AuthDbAdapter,
  assignment: RoleAssignment
): Promise<void> {
  await adapter.db
    .insertInto('user_role_assignments')
    .values({
      user_id: assignment.userId,
      role_id: assignment.roleId,
      company_id: assignment.companyId,
      outlet_id: assignment.outletId ?? null,
    })
    .execute();
}

export async function cleanupRoleAssignments(
  adapter: AuthDbAdapter,
  userIds: number[]
): Promise<void> {
  if (userIds.length === 0) return;
  await adapter.db
    .deleteFrom('user_role_assignments')
    .where('user_id', 'in', userIds)
    .execute();
}
