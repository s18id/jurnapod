// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import { withTransactionRetry } from "@jurnapod/db";
import { AuditService } from "@jurnapod/modules-platform";
import { getDb } from "./db";
import { toRfc3339Required } from "@jurnapod/shared";

export class OutletNotFoundError extends Error {}
export class OutletCodeExistsError extends Error {}

export type OutletProfile = {
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: boolean;
};

export type OutletFullResponse = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type OutletRow = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

type OutletActor = {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
};

function buildAuditContext(companyId: number, actor: OutletActor) {
  return {
    company_id: companyId,
    user_id: actor.userId,
    outlet_id: actor.outletId ?? null,
    ip_address: actor.ipAddress ?? null
  };
}

function mapRowToOutlet(row: OutletRow): OutletFullResponse {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    code: row.code,
    name: row.name,
    city: row.city,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    postal_code: row.postal_code,
    phone: row.phone,
    email: row.email,
    timezone: row.timezone,
    is_active: Boolean(row.is_active),
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

/**
 * List all outlets for a company
 */
export async function listOutletsByCompany(companyId: number): Promise<OutletFullResponse[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('outlets')
    .where('company_id', '=', companyId)
    .orderBy('name', 'asc')
    .select([
      'id', 'company_id', 'code', 'name', 'city', 'address_line1', 'address_line2',
      'postal_code', 'phone', 'email', 'timezone', 'is_active', 'created_at', 'updated_at'
    ])
    .execute();

  return rows.map(mapRowToOutlet);
}

/**
 * List all outlets (for OWNER role)
 */
export async function listAllOutlets(): Promise<OutletFullResponse[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('outlets')
    .orderBy('company_id', 'asc')
    .orderBy('name', 'asc')
    .select([
      'id', 'company_id', 'code', 'name', 'city', 'address_line1', 'address_line2',
      'postal_code', 'phone', 'email', 'timezone', 'is_active', 'created_at', 'updated_at'
    ])
    .execute();

  return rows.map(mapRowToOutlet);
}

/**
 * Get a single outlet by ID
 */
export async function getOutlet(companyId: number, outletId: number): Promise<OutletFullResponse> {
  const db = getDb();
  const row = await db
    .selectFrom('outlets')
    .where('id', '=', outletId)
    .where('company_id', '=', companyId)
    .select([
      'id', 'company_id', 'code', 'name', 'city', 'address_line1', 'address_line2',
      'postal_code', 'phone', 'email', 'timezone', 'is_active', 'created_at', 'updated_at'
    ])
    .executeTakeFirst();

  if (!row) {
    throw new OutletNotFoundError(`Outlet with id ${outletId} not found`);
  }

  return mapRowToOutlet(row);
}

export type CreateOutletParams = {
  company_id: number;
  code: string;
  name: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  actor: OutletActor;
};

/**
 * Create a new outlet
 */
export async function createOutlet(params: CreateOutletParams): Promise<OutletFullResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  return withTransactionRetry(db, async (trx) => {
    // Check if code already exists for this company
    const existing = await trx
      .selectFrom('outlets')
      .where('company_id', '=', params.company_id)
      .where('code', '=', params.code)
      .select(['id'])
      .executeTakeFirst();

    if (existing) {
      throw new OutletCodeExistsError(`Outlet with code ${params.code} already exists for this company`);
    }

    // Insert outlet with profile fields
    const result = await trx
      .insertInto('outlets')
      .values({
        company_id: params.company_id,
        code: params.code,
        name: params.name,
        city: params.city ?? null,
        address_line1: params.address_line1 ?? null,
        address_line2: params.address_line2 ?? null,
        postal_code: params.postal_code ?? null,
        phone: params.phone ?? null,
        email: params.email ?? null,
        timezone: params.timezone ?? null,
        is_active: 1
      })
      .executeTakeFirst();

    const outletId = Number(result.insertId);
    const auditContext = buildAuditContext(params.company_id, params.actor);

    await auditService.logCreate(auditContext, "outlet", outletId, {
      code: params.code,
      name: params.name,
      city: params.city,
      address_line1: params.address_line1,
      address_line2: params.address_line2,
      postal_code: params.postal_code,
      phone: params.phone,
      email: params.email,
      timezone: params.timezone,
      is_active: true
    });

    const rows = await trx
      .selectFrom('outlets')
      .where('id', '=', outletId)
      .where('company_id', '=', params.company_id)
      .select([
        'id', 'company_id', 'code', 'name', 'city', 'address_line1', 'address_line2',
        'postal_code', 'phone', 'email', 'timezone', 'is_active', 'created_at', 'updated_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new OutletNotFoundError(`Outlet with id ${outletId} not found`);
    }

    return mapRowToOutlet(rows);
  });
}

export type UpdateOutletParams = {
  companyId: number;
  outletId: number;
  name?: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  is_active?: boolean;
  actor: OutletActor;
};

/**
 * Update an outlet
 */
export async function updateOutlet(params: UpdateOutletParams): Promise<OutletFullResponse> {
  const db = getDb();
  const auditService = new AuditService(db);

  return withTransactionRetry(db, async (trx) => {
    // Get current outlet
    const rows = await trx
      .selectFrom('outlets')
      .where('id', '=', params.outletId)
      .where('company_id', '=', params.companyId)
      .select([
        'id', 'company_id', 'code', 'name', 'city', 'address_line1', 'address_line2',
        'postal_code', 'phone', 'email', 'timezone', 'is_active', 'created_at', 'updated_at'
      ])
      .executeTakeFirst();

    if (!rows) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    const currentOutlet = rows;
    const updates: Record<string, unknown> = {};
    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};

    // Track and apply updates
    if (params.name !== undefined && params.name !== currentOutlet.name) {
      updates.name = params.name;
      oldData.name = currentOutlet.name;
      newData.name = params.name;
    }

    if (params.city !== undefined && params.city !== currentOutlet.city) {
      updates.city = params.city;
      oldData.city = currentOutlet.city;
      newData.city = params.city;
    }

    if (params.address_line1 !== undefined && params.address_line1 !== currentOutlet.address_line1) {
      updates.address_line1 = params.address_line1;
      oldData.address_line1 = currentOutlet.address_line1;
      newData.address_line1 = params.address_line1;
    }

    if (params.address_line2 !== undefined && params.address_line2 !== currentOutlet.address_line2) {
      updates.address_line2 = params.address_line2;
      oldData.address_line2 = currentOutlet.address_line2;
      newData.address_line2 = params.address_line2;
    }

    if (params.postal_code !== undefined && params.postal_code !== currentOutlet.postal_code) {
      updates.postal_code = params.postal_code;
      oldData.postal_code = currentOutlet.postal_code;
      newData.postal_code = params.postal_code;
    }

    if (params.phone !== undefined && params.phone !== currentOutlet.phone) {
      updates.phone = params.phone;
      oldData.phone = currentOutlet.phone;
      newData.phone = params.phone;
    }

    if (params.email !== undefined && params.email !== currentOutlet.email) {
      updates.email = params.email;
      oldData.email = currentOutlet.email;
      newData.email = params.email;
    }

    if (params.timezone !== undefined && params.timezone !== currentOutlet.timezone) {
      updates.timezone = params.timezone;
      oldData.timezone = currentOutlet.timezone;
      newData.timezone = params.timezone;
    }

    if (params.is_active !== undefined && params.is_active !== Boolean(currentOutlet.is_active)) {
      updates.is_active = params.is_active ? 1 : 0;
      oldData.is_active = Boolean(currentOutlet.is_active);
      newData.is_active = params.is_active;
    }

    let outletForResponse = currentOutlet;

    if (Object.keys(updates).length > 0) {
      await trx
        .updateTable('outlets')
        .set(updates)
        .where('id', '=', params.outletId)
        .where('company_id', '=', params.companyId)
        .execute();

      const auditContext = buildAuditContext(params.companyId, params.actor);
      await auditService.logUpdate(auditContext, "outlet", params.outletId, oldData, newData);

      const updatedRows = await trx
        .selectFrom('outlets')
        .where('id', '=', params.outletId)
        .where('company_id', '=', params.companyId)
        .select([
          'id', 'company_id', 'code', 'name', 'city', 'address_line1', 'address_line2',
          'postal_code', 'phone', 'email', 'timezone', 'is_active', 'created_at', 'updated_at'
        ])
        .executeTakeFirst();

      if (!updatedRows) {
        throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
      }

      outletForResponse = updatedRows;
    }

    return mapRowToOutlet(outletForResponse);
  });
}

/**
 * Delete an outlet
 */
export async function deleteOutlet(params: {
  companyId: number;
  outletId: number;
  actor: OutletActor;
}): Promise<void> {
  const db = getDb();
  const auditService = new AuditService(db);

  await withTransactionRetry(db, async (trx) => {
    // Get current outlet
    const rows = await trx
      .selectFrom('outlets')
      .where('id', '=', params.outletId)
      .where('company_id', '=', params.companyId)
      .select(['id', 'code', 'name'])
      .executeTakeFirst();

    if (!rows) {
      throw new OutletNotFoundError(`Outlet with id ${params.outletId} not found`);
    }

    // Check if outlet is in use (has users)
    const users = await trx
      .selectFrom('user_role_assignments')
      .where('outlet_id', '=', params.outletId)
      .select((eb) => [eb.fn.count('id').as('count')])
      .executeTakeFirst();

    const count = Number(users?.count ?? 0);
    if (count > 0) {
      throw new Error(`Cannot delete outlet: ${count} users are assigned to this outlet`);
    }

    // Delete outlet
    await trx
      .deleteFrom('outlets')
      .where('id', '=', params.outletId)
      .where('company_id', '=', params.companyId)
      .execute();

    const auditContext = buildAuditContext(params.companyId, params.actor);
    await auditService.logDelete(auditContext, "outlet", params.outletId, {
      code: rows.code,
      name: rows.name
    });
  });
}

/**
 * Deactivate an outlet (soft delete - preserves historical data)
 */
export async function deactivateOutlet(params: {
  companyId: number;
  outletId: number;
  actor: OutletActor;
}): Promise<OutletFullResponse> {
  return updateOutlet({
    companyId: params.companyId,
    outletId: params.outletId,
    is_active: false,
    actor: params.actor
  });
}

/**
 * Create an outlet with minimal setup (no audit logging).
 * Use this for testing - it only inserts the outlet row.
 * For production use, use createOutlet() which includes audit.
 */
export async function createOutletBasic(params: {
  company_id: number;
  code: string;
  name: string;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
}, db?: KyselySchema): Promise<{ id: number; company_id: number; code: string; name: string }> {
  const database = db ?? getDb();

  // Check for duplicate company_id + code combination
  const existing = await database
    .selectFrom('outlets')
    .where('company_id', '=', params.company_id)
    .where('code', '=', params.code)
    .select(['id'])
    .executeTakeFirst();

  if (existing) {
    throw new OutletCodeExistsError(
      `Outlet with code ${params.code} already exists for this company`
    );
  }

  const result = await database
    .insertInto('outlets')
    .values({
      company_id: params.company_id,
      code: params.code,
      name: params.name,
      city: params.city ?? null,
      address_line1: params.address_line1 ?? null,
      address_line2: params.address_line2 ?? null,
      postal_code: params.postal_code ?? null,
      phone: params.phone ?? null,
      email: params.email ?? null,
      timezone: params.timezone ?? null,
      is_active: 1
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    company_id: params.company_id,
    code: params.code,
    name: params.name
  };
}
