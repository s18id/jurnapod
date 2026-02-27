import type { RowDataPacket } from "mysql2";
import { marked } from "marked";
import sanitizeHtml, { type IOptions } from "sanitize-html";
import { getDbPool } from "./db";

const CACHE_TTL_MS = 10 * 60 * 1000;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

type StaticPageRow = RowDataPacket & {
  slug: string;
  title: string;
  content_md: string;
  updated_at: Date;
  published_at: Date | null;
};

export type PublicStaticPage = {
  slug: string;
  title: string;
  content_html: string;
  updated_at: Date;
  published_at: Date | null;
};

type CacheEntry = {
  page: PublicStaticPage;
  cachedAt: number;
};

const pageCache = new Map<string, CacheEntry>();

const sanitizeOptions: IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "hr",
    "a",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td"
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false
};

function isSlugValid(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function getCachedPage(slug: string): PublicStaticPage | null {
  const entry = pageCache.get(slug);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    pageCache.delete(slug);
    return null;
  }

  return entry.page;
}

function setCachedPage(slug: string, page: PublicStaticPage): void {
  pageCache.set(slug, { page, cachedAt: Date.now() });
}

export function invalidateStaticPageCache(slug?: string): void {
  if (slug) {
    pageCache.delete(slug);
    return;
  }

  pageCache.clear();
}

export async function getPublishedStaticPage(slug: string): Promise<PublicStaticPage | null> {
  if (!isSlugValid(slug)) {
    return null;
  }

  const cached = getCachedPage(slug);
  if (cached) {
    return cached;
  }

  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT slug, title, content_md, updated_at, published_at
     FROM static_pages
     WHERE slug = ? AND status = 'PUBLISHED'
     LIMIT 1`,
    [slug]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0] as StaticPageRow;
  const renderedHtml = await marked.parse(row.content_md ?? "");
  const contentHtml = sanitizeHtml(renderedHtml, sanitizeOptions);
  const page: PublicStaticPage = {
    slug: row.slug,
    title: row.title,
    content_html: contentHtml,
    updated_at: row.updated_at,
    published_at: row.published_at
  };

  setCachedPage(slug, page);
  return page;
}
