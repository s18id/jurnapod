// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { toRfc3339Required } from "@jurnapod/shared";
import { withTransactionRetry } from "@jurnapod/db";
import type { RoleResponse, RoleRow } from "../types/role.js";
import { FULL_PERMISSION_MASK, type ModuleRoleResponse } from "../types/permission.js";
import {
  RoleNotFoundError,
  RoleLevelViolationError
} from "./errors.js";

type UserActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

async function getUserMaxRoleLevelForConnection(
  db: KyselySchema,
  companyId: number,
  userId: number
): Promise<number> {
  const row = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .innerJoin("users as u", "u.id", "ura.user_id")
    .where("u.id", "=", userId)
    .where("u.company_id", "=", companyId)
    .where("u.is_active", "=", 1)
    .where("ura.outlet_id", "is", null)
    .select((eb) => [eb.fn.max("r.role_level").as("max_level")])
    .executeTakeFirst();

  const maxLevel = row?.max_level;
  return Number(maxLevel ?? 0);
}

/**
 * Role service for role management operations.
 */
export class RoleService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * List roles for a company.
   */
  async listRoles(
    companyId: number,
    isSuperAdmin: boolean = false,
    filterCompanyId?: number
  ): Promise<RoleResponse[]> {
    let query = this.db
      .selectFrom("roles")
      .select(["id", "code", "name", "company_id", "is_global", "role_level"])
      .orderBy("company_id", "asc")
      .orderBy("code", "asc");

    if (isSuperAdmin) {
      if (filterCompanyId !== undefined) {
        query = query.where((eb) => eb.or([
          eb("company_id", "=", filterCompanyId),
          eb("company_id", "is", null)
        ]));
      }
    } else {
      query = query.where((eb) => eb.or([
        eb("company_id", "=", companyId),
        eb("company_id", "is", null)
      ]));
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      company_id: row.company_id ? Number(row.company_id) : null,
      is_global: Boolean(row.is_global),
      role_level: Number(row.role_level ?? 0)
    }));
  }

  /**
   * Get a single role by ID.
   */
  async getRole(roleId: number, companyId: number): Promise<RoleResponse> {
    const row = await this.db
      .selectFrom("roles")
      .where("id", "=", roleId)
      .where((eb) => eb.or([
        eb("company_id", "=", companyId),
        eb("company_id", "is", null)
      ]))
      .select(["id", "code", "name", "company_id", "is_global", "role_level"])
      .executeTakeFirst();

    if (!row) {
      throw new RoleNotFoundError(`Role with id ${roleId} not found`);
    }

    return {
      id: Number(row.id),
      code: row.code,
      name: row.name,
      company_id: row.company_id ? Number(row.company_id) : null,
      is_global: Boolean(row.is_global),
      role_level: Number(row.role_level ?? 0)
    };
  }

  /**
   * Create a new role.
   */
  async createRole(params: {
    companyId: number;
    code: string;
    name: string;
    roleLevel?: number;
    actor: UserActor;
  }): Promise<RoleResponse> {
    return await withTransactionRetry(this.db, async (trx) => {
      const actorMaxLevel = await getUserMaxRoleLevelForConnection(
        trx,
        params.companyId,
        params.actor.userId
      );
      const newRoleLevel = params.roleLevel ?? 0;

      if (newRoleLevel >= actorMaxLevel) {
        throw new RoleLevelViolationError(
          "Cannot create role with level equal to or higher than your own role level"
        );
      }

      const existing = await trx
        .selectFrom("roles")
        .where("company_id", "=", params.companyId)
        .where("code", "=", params.code)
        .select("id")
        .executeTakeFirst();

      if (existing) {
        throw new Error(`Role with code ${params.code} already exists`);
      }

      const result = await trx
        .insertInto("roles")
        .values({
          code: params.code,
          name: params.name,
          company_id: params.companyId,
          role_level: newRoleLevel
        })
        .executeTakeFirst();

      const roleId = Number(result.insertId);

      return {
        id: roleId,
        code: params.code,
        name: params.name,
        company_id: params.companyId,
        is_global: false,
        role_level: newRoleLevel
      };
    });
  }

  /**
   * Update a role's name.
   */
  async updateRole(params: {
    companyId: number;
    roleId: number;
    name?: string;
    actor: UserActor;
  }): Promise<RoleResponse> {
    return await withTransactionRetry(this.db, async (trx) => {
      const currentRole = await trx
        .selectFrom("roles")
        .where("id", "=", params.roleId)
        .where("company_id", "=", params.companyId)
        .select(["id", "code", "name", "company_id", "is_global", "role_level"])
        .executeTakeFirst();

      if (!currentRole) {
        throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
      }

      const actorMaxLevel = await getUserMaxRoleLevelForConnection(
        trx,
        params.companyId,
        params.actor.userId
      );
      const targetLevel = Number(currentRole.role_level ?? 0);

      if (targetLevel > actorMaxLevel) {
        throw new RoleLevelViolationError(
          "Insufficient role level to update this role"
        );
      }

      if (params.name && params.name !== currentRole.name) {
        await trx
          .updateTable("roles")
          .set({ name: params.name })
          .where("id", "=", params.roleId)
          .execute();
      }

      return {
        id: Number(currentRole.id),
        code: currentRole.code,
        name: params.name ?? currentRole.name,
        company_id: currentRole.company_id ? Number(currentRole.company_id) : null,
        is_global: Boolean(currentRole.is_global),
        role_level: Number(currentRole.role_level ?? 0)
      };
    });
  }

  /**
   * Delete a role (only if not assigned to users).
   */
  async deleteRole(params: {
    companyId: number;
    roleId: number;
    actor: UserActor;
  }): Promise<void> {
    await withTransactionRetry(this.db, async (trx) => {
      const role = await trx
        .selectFrom("roles")
        .where("id", "=", params.roleId)
        .where("company_id", "=", params.companyId)
        .select(["id", "code", "name", "role_level"])
        .executeTakeFirst();

      if (!role) {
        throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
      }

      const actorMaxLevel = await getUserMaxRoleLevelForConnection(
        trx,
        params.companyId,
        params.actor.userId
      );
      const targetLevel = Number(role.role_level ?? 0);

      if (targetLevel > actorMaxLevel) {
        throw new RoleLevelViolationError(
          "Insufficient role level to delete this role"
        );
      }

      const userRolesCount = await trx
        .selectFrom("user_role_assignments")
        .where("role_id", "=", params.roleId)
        .select((eb) => [eb.fn.count("id").as("count")])
        .executeTakeFirst();

      const count = Number(userRolesCount?.count ?? 0);
      if (count > 0) {
        throw new Error(
          `Cannot delete role ${role.code}: ${count} users are assigned to this role`
        );
      }

      await trx
        .deleteFrom("roles")
        .where("id", "=", params.roleId)
        .execute();
    });
  }

  /**
   * List module roles.
   */
  async listModuleRoles(params: {
    companyId: number;
    roleId?: number;
    module?: string;
  }): Promise<ModuleRoleResponse[]> {
    let query = this.db
      .selectFrom("module_roles as mr")
      .innerJoin("roles as r", "r.id", "mr.role_id")
      .where("mr.company_id", "=", params.companyId)
      .select([
        "mr.id", "mr.role_id", "r.code as role_code", "mr.module",
        "mr.permission_mask", "mr.created_at", "mr.updated_at"
      ])
      .orderBy("r.code", "asc")
      .orderBy("mr.module", "asc");

    if (params.roleId) {
      query = query.where("mr.role_id", "=", params.roleId);
    }
    if (params.module) {
      query = query.where("mr.module", "=", params.module);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      id: Number(row.id),
      role_id: Number(row.role_id),
      role_code: row.role_code,
      module: row.module,
      permission_mask: Number(row.permission_mask ?? 0),
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    }));
  }

  /**
   * Set module role permission.
   */
  async setModuleRolePermission(params: {
    companyId: number;
    roleId: number;
    module: string;
    permissionMask: number;
    actor: UserActor;
  }): Promise<ModuleRoleResponse> {
    return await withTransactionRetry(this.db, async (trx) => {
      const roleRows = await trx
        .selectFrom("roles")
        .where("id", "=", params.roleId)
        .select(["id", "code", "is_global", "role_level"])
        .execute();

      if (roleRows.length === 0) {
        throw new RoleNotFoundError(`Role with id ${params.roleId} not found`);
      }

      const role = roleRows[0];
      const actorMaxLevel = await getUserMaxRoleLevelForConnection(
        trx,
        params.companyId,
        params.actor.userId
      );
      const targetLevel = Number(role.role_level ?? 0);

      if (targetLevel > actorMaxLevel) {
        throw new RoleLevelViolationError(
          "Insufficient role level to update module roles"
        );
      }

      // Global roles get full permission mask
      const permissionMask = role.is_global ? FULL_PERMISSION_MASK : params.permissionMask;

      const existing = await trx
        .selectFrom("module_roles")
        .where("company_id", "=", params.companyId)
        .where("role_id", "=", params.roleId)
        .where("module", "=", params.module)
        .select(["id", "permission_mask"])
        .executeTakeFirst();

      if (existing) {
        const currentMask = Number(existing.permission_mask ?? 0);
        await trx
          .updateTable("module_roles")
          .set({ permission_mask: permissionMask })
          .where("company_id", "=", params.companyId)
          .where("role_id", "=", params.roleId)
          .where("module", "=", params.module)
          .execute();
      } else {
        await trx
          .insertInto("module_roles")
          .values({
            company_id: params.companyId,
            role_id: params.roleId,
            module: params.module,
            permission_mask: permissionMask
          })
          .execute();
      }

      const rows = await trx
        .selectFrom("module_roles as mr")
        .innerJoin("roles as r", "r.id", "mr.role_id")
        .where("mr.company_id", "=", params.companyId)
        .where("mr.role_id", "=", params.roleId)
        .where("mr.module", "=", params.module)
        .select([
          "mr.id", "mr.role_id", "r.code as role_code", "mr.module",
          "mr.permission_mask", "mr.created_at", "mr.updated_at"
        ])
        .executeTakeFirst();

      if (!rows) {
        throw new Error("Module role not found after update");
      }

      const row = rows;
      return {
        id: Number(row.id),
        role_id: Number(row.role_id),
        role_code: row.role_code,
        module: row.module,
        permission_mask: Number(row.permission_mask ?? 0),
        created_at: toRfc3339Required(row.created_at),
        updated_at: toRfc3339Required(row.updated_at)
      };
    });
  }
}