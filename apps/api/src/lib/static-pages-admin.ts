// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AuditService, type AuditDbClient } from "@jurnapod/modules-platform";
import { getDb } from "./db";
import { sql } from "kysely";
import { invalidateStaticPageCache } from "./static-pages";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

type StaticPageStatus = "DRAFT" | "PUBLISHED";

export type StaticPageSummary = {
  id: number;
  slug: string;
  title: string;
  status: StaticPageStatus;
  updated_at: string;
  published_at: string | null;
};

export type StaticPageDetail = {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  status: StaticPageStatus;
  updated_at: string;
  published_at: string | null;
  meta_json: Record<string, any> | null;
};

export type StaticPageActor = {
  companyId: number;
  userId: number;
  ipAddress?: string | null;
};

export class StaticPageNotFoundError extends Error {
  constructor(message = "Static page not found") {
    super(message);
    this.name = "StaticPageNotFoundError";
  }
}

export class StaticPageSlugExistsError extends Error {
  constructor(message = "Slug already exists") {
    super(message);
    this.name = "StaticPageSlugExistsError";
  }
}

export class StaticPageSlugInvalidError extends Error {
  constructor(message = "Slug is invalid") {
    super(message);
    this.name = "StaticPageSlugInvalidError";
  }
}

function buildAuditContext(actor: StaticPageActor) {
  return {
    company_id: actor.companyId,
    user_id: actor.userId,
    outlet_id: null,
    ip_address: actor.ipAddress ?? null
  };
}

function isSlugValid(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function parseMetaJson(raw: string | null): Record<string, any> | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeMetaJsonRaw(meta: Record<string, any> | null): string | null {
  if (!meta) {
    return null;
  }

  return JSON.stringify(meta);
}

interface StaticPageRow {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  status: StaticPageStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  meta_json: string | null;
}

function mapStaticPage(row: StaticPageRow): StaticPageDetail {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    content_md: row.content_md,
    status: row.status,
    updated_at: toRfc3339Required(row.updated_at),
    published_at: toRfc3339(row.published_at),
    meta_json: parseMetaJson(row.meta_json)
  };
}

async function findStaticPageById(
  db: any,
  pageId: number
): Promise<StaticPageRow | null> {
  const rows = await sql<StaticPageRow>`
    SELECT id, slug, title, content_md, status, published_at, created_at, updated_at, meta_json
    FROM static_pages
    WHERE id = ${pageId}
    LIMIT 1
  `.execute(db);

  return rows.rows[0] ?? null;
}

async function ensureSlugAvailable(
  db: any,
  slug: string,
  excludeId?: number
): Promise<void> {
  let query = sql`SELECT id FROM static_pages WHERE slug = ${slug}`;
  if (excludeId != null) {
    query = sql`${query} AND id != ${excludeId}`;
  }
  query = sql`${query} LIMIT 1`;

  const rows = await sql<{ id: number }>`${query}`.execute(db);
  if (rows.rows.length > 0) {
    throw new StaticPageSlugExistsError();
  }
}

export async function listStaticPages(search?: string): Promise<StaticPageSummary[]> {
  const db = getDb();
  let query = sql`
    SELECT id, slug, title, status, updated_at, published_at
    FROM static_pages
  `;

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    query = sql`
      ${query} WHERE slug LIKE ${`%${trimmedSearch}%`} OR title LIKE ${`%${trimmedSearch}%`}
    `;
  }

  query = sql`${query} ORDER BY updated_at DESC`;

  const rows = await sql<{ id: number; slug: string; title: string; status: StaticPageStatus; updated_at: string; published_at: string | null }>`${query}`.execute(db);

  return rows.rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    status: row.status,
    updated_at: toRfc3339Required(row.updated_at),
    published_at: toRfc3339(row.published_at)
  }));
}

export async function getStaticPageDetail(pageId: number): Promise<StaticPageDetail | null> {
  const db = getDb();
  const page = await findStaticPageById(db, pageId);
  return page ? mapStaticPage(page) : null;
}

export async function createStaticPage(params: {
  slug: string;
  title: string;
  content_md: string;
  status?: StaticPageStatus;
  meta_json?: Record<string, any> | null;
  actor: StaticPageActor;
}): Promise<StaticPageDetail> {
  const db = getDb();
  const auditContext = buildAuditContext(params.actor);

  return await db.transaction().execute(async (trx) => {
    const slug = params.slug.trim();
    if (!isSlugValid(slug)) {
      throw new StaticPageSlugInvalidError();
    }

    await ensureSlugAvailable(trx, slug);

    const status: StaticPageStatus = params.status ?? "DRAFT";
    const publishedAt = status === "PUBLISHED" ? new Date() : null;
    const metaJsonRaw = normalizeMetaJsonRaw(params.meta_json ?? null);

    const result = await sql`
      INSERT INTO static_pages (
        slug, title, content_md, status, published_at,
        created_by_user_id, updated_by_user_id, meta_json
      ) VALUES (${slug}, ${params.title.trim()}, ${params.content_md}, ${status}, ${publishedAt}, ${params.actor.userId}, ${params.actor.userId}, ${metaJsonRaw})
    `.execute(trx);

    const pageId = Number(result.insertId);
    const created = await findStaticPageById(trx, pageId);
    if (!created) {
      throw new StaticPageNotFoundError("Static page not found after creation");
    }

    const auditService = new AuditService(trx as AuditDbClient);
    await auditService.logCreate(auditContext, "static_page" as any, pageId, {
      slug: created.slug,
      title: created.title,
      status: created.status,
      published_at: created.published_at,
      meta_json: parseMetaJson(created.meta_json)
    });

    return mapStaticPage(created);
  });
}

export async function updateStaticPage(params: {
  pageId: number;
  slug?: string;
  title?: string;
  content_md?: string;
  meta_json?: Record<string, any> | null;
  metaJsonProvided: boolean;
  actor: StaticPageActor;
}): Promise<StaticPageDetail> {
  const db = getDb();
  const auditContext = buildAuditContext(params.actor);

  return await db.transaction().execute(async (trx) => {
    const current = await findStaticPageById(trx, params.pageId);
    if (!current) {
      throw new StaticPageNotFoundError();
    }

    let nextSlug = current.slug;
    if (params.slug != null) {
      const slug = params.slug.trim();
      if (!isSlugValid(slug)) {
        throw new StaticPageSlugInvalidError();
      }
      if (slug !== current.slug) {
        await ensureSlugAvailable(trx, slug, params.pageId);
      }
      nextSlug = slug;
    }

    const nextTitle = params.title != null ? params.title.trim() : current.title;
    const nextContent = params.content_md != null ? params.content_md : current.content_md;
    const nextMetaRaw = params.metaJsonProvided
      ? normalizeMetaJsonRaw(params.meta_json ?? null)
      : current.meta_json;

    const hasChanges =
      nextSlug !== current.slug ||
      nextTitle !== current.title ||
      nextContent !== current.content_md ||
      nextMetaRaw !== current.meta_json;

    if (!hasChanges) {
      return mapStaticPage(current);
    }

    await sql`
      UPDATE static_pages
      SET slug = ${nextSlug}, title = ${nextTitle}, content_md = ${nextContent}, meta_json = ${nextMetaRaw},
          updated_by_user_id = ${params.actor.userId}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${params.pageId}
    `.execute(trx);

    const updated = await findStaticPageById(trx, params.pageId);
    if (!updated) {
      throw new StaticPageNotFoundError("Static page not found after update");
    }

    const auditService = new AuditService(trx as AuditDbClient);
    await auditService.logUpdate(
      auditContext,
      "static_page" as any,
      params.pageId,
      {
        slug: current.slug,
        title: current.title,
        content_md: current.content_md,
        meta_json: parseMetaJson(current.meta_json)
      },
      {
        slug: updated.slug,
        title: updated.title,
        content_md: updated.content_md,
        meta_json: parseMetaJson(updated.meta_json)
      }
    );

    invalidateStaticPageCache(current.slug);
    if (current.slug !== updated.slug) {
      invalidateStaticPageCache(updated.slug);
    }

    return mapStaticPage(updated);
  });
}

export async function publishStaticPage(params: {
  pageId: number;
  actor: StaticPageActor;
}): Promise<StaticPageDetail> {
  const db = getDb();
  const auditContext = buildAuditContext(params.actor);

  return await db.transaction().execute(async (trx) => {
    const current = await findStaticPageById(trx, params.pageId);
    if (!current) {
      throw new StaticPageNotFoundError();
    }

    if (current.status !== "PUBLISHED") {
      await sql`
        UPDATE static_pages
        SET status = 'PUBLISHED', published_at = NOW(),
            updated_by_user_id = ${params.actor.userId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${params.pageId}
      `.execute(trx);
    }

    const updated = await findStaticPageById(trx, params.pageId);
    if (!updated) {
      throw new StaticPageNotFoundError("Static page not found after publish");
    }

    if (current.status !== updated.status || current.published_at !== updated.published_at) {
      const auditService = new AuditService(trx as AuditDbClient);
      await auditService.logUpdate(
        auditContext,
        "static_page" as any,
        params.pageId,
        { status: current.status, published_at: current.published_at },
        { status: updated.status, published_at: updated.published_at }
      );
    }

    invalidateStaticPageCache(updated.slug);
    return mapStaticPage(updated);
  });
}

export async function unpublishStaticPage(params: {
  pageId: number;
  actor: StaticPageActor;
}): Promise<StaticPageDetail> {
  const db = getDb();
  const auditContext = buildAuditContext(params.actor);

  return await db.transaction().execute(async (trx) => {
    const current = await findStaticPageById(trx, params.pageId);
    if (!current) {
      throw new StaticPageNotFoundError();
    }

    if (current.status !== "DRAFT" || current.published_at != null) {
      await sql`
        UPDATE static_pages
        SET status = 'DRAFT', published_at = NULL,
            updated_by_user_id = ${params.actor.userId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${params.pageId}
      `.execute(trx);
    }

    const updated = await findStaticPageById(trx, params.pageId);
    if (!updated) {
      throw new StaticPageNotFoundError("Static page not found after unpublish");
    }

    if (current.status !== updated.status || current.published_at !== updated.published_at) {
      const auditService = new AuditService(trx as AuditDbClient);
      await auditService.logUpdate(
        auditContext,
        "static_page" as any,
        params.pageId,
        { status: current.status, published_at: current.published_at },
        { status: updated.status, published_at: updated.published_at }
      );
    }

    invalidateStaticPageCache(updated.slug);
    return mapStaticPage(updated);
  });
}
