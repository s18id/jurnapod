// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { AuditService, type AuditDbClient } from "@jurnapod/modules-platform";
import { getDbPool } from "./db";
import { invalidateStaticPageCache } from "./static-pages";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

type StaticPageStatus = "DRAFT" | "PUBLISHED";

type StaticPageRow = RowDataPacket & {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  status: StaticPageStatus;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  meta_json: string | null;
};

type StaticPageSummaryRow = RowDataPacket & {
  id: number;
  slug: string;
  title: string;
  status: StaticPageStatus;
  updated_at: Date;
  published_at: Date | null;
};

export type StaticPageSummary = {
  id: number;
  slug: string;
  title: string;
  status: StaticPageStatus;
  updated_at: Date;
  published_at: Date | null;
};

export type StaticPageDetail = {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  status: StaticPageStatus;
  updated_at: Date;
  published_at: Date | null;
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

type ConnectionExecutor = PoolConnection | ReturnType<typeof getDbPool>;

class ConnectionAuditDbClient implements AuditDbClient {
  constructor(private readonly connection: PoolConnection) {}

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }
}

function createAuditServiceForConnection(connection: PoolConnection): AuditService {
  const dbClient = new ConnectionAuditDbClient(connection);
  return new AuditService(dbClient);
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

function mapStaticPage(row: StaticPageRow): StaticPageDetail {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    content_md: row.content_md,
    status: row.status,
    updated_at: row.updated_at,
    published_at: row.published_at,
    meta_json: parseMetaJson(row.meta_json)
  };
}

async function findStaticPageById(
  connection: ConnectionExecutor,
  pageId: number
): Promise<StaticPageRow | null> {
  const [rows] = await connection.execute<StaticPageRow[]>(
    `SELECT id, slug, title, content_md, status, published_at, created_at, updated_at, meta_json
     FROM static_pages
     WHERE id = ?
     LIMIT 1`,
    [pageId]
  );

  return rows[0] ?? null;
}

async function ensureSlugAvailable(
  connection: ConnectionExecutor,
  slug: string,
  excludeId?: number
): Promise<void> {
  const params: Array<string | number> = [slug];
  let sql = `SELECT id FROM static_pages WHERE slug = ?`;
  if (excludeId != null) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  sql += " LIMIT 1";

  const [rows] = await connection.execute<RowDataPacket[]>(sql, params);
  if (rows.length > 0) {
    throw new StaticPageSlugExistsError();
  }
}

export async function listStaticPages(search?: string): Promise<StaticPageSummary[]> {
  const pool = getDbPool();
  const params: string[] = [];
  let sql = `SELECT id, slug, title, status, updated_at, published_at
             FROM static_pages`;

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    sql += " WHERE slug LIKE ? OR title LIKE ?";
    const wildcard = `%${trimmedSearch}%`;
    params.push(wildcard, wildcard);
  }

  sql += " ORDER BY updated_at DESC";

  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return (rows as StaticPageSummaryRow[]).map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    status: row.status,
    updated_at: row.updated_at,
    published_at: row.published_at
  }));
}

export async function getStaticPageDetail(pageId: number): Promise<StaticPageDetail | null> {
  const pool = getDbPool();
  const page = await findStaticPageById(pool, pageId);
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.actor);

  try {
    await connection.beginTransaction();

    const slug = params.slug.trim();
    if (!isSlugValid(slug)) {
      throw new StaticPageSlugInvalidError();
    }

    await ensureSlugAvailable(connection, slug);

    const status: StaticPageStatus = params.status ?? "DRAFT";
    const publishedAt = status === "PUBLISHED" ? new Date() : null;
    const metaJsonRaw = normalizeMetaJsonRaw(params.meta_json ?? null);

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO static_pages (
         slug, title, content_md, status, published_at,
         created_by_user_id, updated_by_user_id, meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        params.title.trim(),
        params.content_md,
        status,
        publishedAt,
        params.actor.userId,
        params.actor.userId,
        metaJsonRaw
      ]
    );

    const pageId = Number(result.insertId);
    const created = await findStaticPageById(connection, pageId);
    if (!created) {
      throw new StaticPageNotFoundError("Static page not found after creation");
    }

    await auditService.logCreate(auditContext, "static_page" as any, pageId, {
      slug: created.slug,
      title: created.title,
      status: created.status,
      published_at: created.published_at,
      meta_json: parseMetaJson(created.meta_json)
    });

    await connection.commit();
    return mapStaticPage(created);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.actor);

  try {
    await connection.beginTransaction();
    const current = await findStaticPageById(connection, params.pageId);
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
        await ensureSlugAvailable(connection, slug, params.pageId);
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
      await connection.commit();
      return mapStaticPage(current);
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE static_pages
       SET slug = ?, title = ?, content_md = ?, meta_json = ?,
           updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        nextSlug,
        nextTitle,
        nextContent,
        nextMetaRaw,
        params.actor.userId,
        params.pageId
      ]
    );

    const updated = await findStaticPageById(connection, params.pageId);
    if (!updated) {
      throw new StaticPageNotFoundError("Static page not found after update");
    }

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

    await connection.commit();

    invalidateStaticPageCache(current.slug);
    if (current.slug !== updated.slug) {
      invalidateStaticPageCache(updated.slug);
    }

    return mapStaticPage(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function publishStaticPage(params: {
  pageId: number;
  actor: StaticPageActor;
}): Promise<StaticPageDetail> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.actor);

  try {
    await connection.beginTransaction();
    const current = await findStaticPageById(connection, params.pageId);
    if (!current) {
      throw new StaticPageNotFoundError();
    }

    if (current.status !== "PUBLISHED") {
      await connection.execute<ResultSetHeader>(
        `UPDATE static_pages
         SET status = 'PUBLISHED', published_at = NOW(),
             updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [params.actor.userId, params.pageId]
      );
    }

    const updated = await findStaticPageById(connection, params.pageId);
    if (!updated) {
      throw new StaticPageNotFoundError("Static page not found after publish");
    }

    if (current.status !== updated.status || current.published_at !== updated.published_at) {
      await auditService.logUpdate(
        auditContext,
        "static_page" as any,
        params.pageId,
        { status: current.status, published_at: current.published_at },
        { status: updated.status, published_at: updated.published_at }
      );
    }

    await connection.commit();
    invalidateStaticPageCache(updated.slug);
    return mapStaticPage(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function unpublishStaticPage(params: {
  pageId: number;
  actor: StaticPageActor;
}): Promise<StaticPageDetail> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const auditService = createAuditServiceForConnection(connection);
  const auditContext = buildAuditContext(params.actor);

  try {
    await connection.beginTransaction();
    const current = await findStaticPageById(connection, params.pageId);
    if (!current) {
      throw new StaticPageNotFoundError();
    }

    if (current.status !== "DRAFT" || current.published_at != null) {
      await connection.execute<ResultSetHeader>(
        `UPDATE static_pages
         SET status = 'DRAFT', published_at = NULL,
             updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [params.actor.userId, params.pageId]
      );
    }

    const updated = await findStaticPageById(connection, params.pageId);
    if (!updated) {
      throw new StaticPageNotFoundError("Static page not found after unpublish");
    }

    if (current.status !== updated.status || current.published_at !== updated.published_at) {
      await auditService.logUpdate(
        auditContext,
        "static_page" as any,
        params.pageId,
        { status: current.status, published_at: current.published_at },
        { status: updated.status, published_at: updated.published_at }
      );
    }

    await connection.commit();
    invalidateStaticPageCache(updated.slug);
    return mapStaticPage(updated);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
