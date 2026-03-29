import type { AuthDbAdapter } from '../../types.js';

export interface RoleAssignment {
  userId: number;
  roleId: number;
  outletId?: number | null;
}

export async function getRoleIdByCode(
  adapter: AuthDbAdapter,
  code: string
): Promise<number | null> {
  const rows = await adapter.query<{ id: number }>(
    'SELECT id FROM roles WHERE code = ? LIMIT 1',
    [code]
  );
  return rows[0]?.id ?? null;
}

export async function assignUserRole(
  adapter: AuthDbAdapter,
  assignment: RoleAssignment
): Promise<void> {
  await adapter.execute(
    `INSERT INTO user_role_assignments (user_id, role_id, outlet_id, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [assignment.userId, assignment.roleId, assignment.outletId ?? null]
  );
}

export async function cleanupRoleAssignments(
  adapter: AuthDbAdapter,
  userIds: number[]
): Promise<void> {
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => '?').join(',');
  await adapter.execute(
    `DELETE FROM user_role_assignments WHERE user_id IN (${placeholders})`,
    userIds
  );
}
