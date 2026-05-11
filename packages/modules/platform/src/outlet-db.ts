// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";

/**
 * Insert an outlet row. Canonical production insert path for outlets.
 * Both CompanyService.createCompany() AND test fixtures MUST use this.
 */
export async function insertOutlet(
  db: KyselySchema,
  opts: {
    companyId: number;
    code: string;
    name: string;
    timezone?: string | null;
  }
): Promise<number> {
  const result = await db
    .insertInto("outlets")
    .values({
      company_id: opts.companyId,
      code: opts.code,
      name: opts.name,
      timezone: opts.timezone ?? null,
    })
    .executeTakeFirst();

  const insertId = result.insertId;
  if (insertId === undefined || insertId === null) {
    // Fallback: query by unique key
    const row = await db
      .selectFrom("outlets")
      .where("company_id", "=", opts.companyId)
      .where("code", "=", opts.code)
      .select(["id"])
      .executeTakeFirst();
    if (!row) throw new Error(`Failed to create outlet ${opts.code}`);
    return Number(row.id);
  }
  return typeof insertId === "bigint" ? Number(insertId) : Number(insertId);
}
