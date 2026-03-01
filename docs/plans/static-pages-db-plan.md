<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Static Pages (DB-Backed) Plan

## Goal
Provide a database-backed static pages system (Markdown) for public documents such as the Privacy Policy, with a public `/privacy` route and an admin editor in backoffice. This plan is written to be executable later without needing additional context.

## Scope
- Global pages (no company scoping).
- Markdown content rendered to sanitized HTML.
- Public read endpoint and admin CRUD/publish endpoints.
- Backoffice admin UI + public `/privacy` route.
- Initial seed content for `privacy` page using PT Signal Delapan Belas details.

## Non-Goals
- WYSIWYG editor.
- Multi-locale translations.
- Per-company content.
- PDF export for static pages.

## Data Model
Table: `static_pages`

Columns:
- `id` BIGINT UNSIGNED PK
- `slug` VARCHAR(128) UNIQUE
- `title` VARCHAR(191)
- `content_md` MEDIUMTEXT
- `status` ENUM('DRAFT','PUBLISHED')
- `published_at` DATETIME NULL
- `created_at` DATETIME
- `updated_at` DATETIME
- `created_by_user_id` BIGINT UNSIGNED (FK users)
- `updated_by_user_id` BIGINT UNSIGNED (FK users)
- `meta_json` JSON NULL (SEO fields)

Indexes:
- `uq_static_pages_slug` on `slug` (unique)
- `idx_static_pages_status` on `status` (optional but useful for filtering)

Seed:
- Insert `privacy` page as PUBLISHED with content for PT Signal Delapan Belas.
- Use effective date as the day of migration execution.
- Store content in Markdown; HTML rendering happens at read time.

Slug rules:
- Lowercase + hyphen only (e.g. `privacy`, `terms-of-service`).
- Reject any slug outside `[a-z0-9-]` to keep URL-safe.

## API
Public (no auth):
- `GET /api/pages/:slug`
  - Returns only PUBLISHED pages.
  - Response shape: `{ ok: true, page: { slug, title, content_html, updated_at, published_at } }`.
  - If not found or not published: `404` with `{ ok: false, error: { code: "NOT_FOUND" } }`.

Admin (OWNER/ADMIN):
- `GET /api/settings/pages`
  - Supports `?q=` search on title or slug.
  - Returns list including status, updated_at, published_at.
- `POST /api/settings/pages`
  - Validates slug rules and content.
  - Creates in DRAFT by default unless `status` is provided.
- `PATCH /api/settings/pages/:id`
  - Updates title/content/slug (slug change requires uniqueness check).
  - Updating content should update `updated_at` and clear cache.
- `POST /api/settings/pages/:id/publish`
  - Sets status to PUBLISHED + `published_at=NOW()`.
- `POST /api/settings/pages/:id/unpublish`
  - Sets status to DRAFT and clears `published_at`.

Audit:
- Log create/update/publish/unpublish via `audit_logs` with entity_type `static_page`.

## Rendering & Security
- Render Markdown to HTML on read (server-side in API).
- Sanitize HTML output (required) to prevent XSS.
  - Recommended stack: `marked` + `sanitize-html` (or equivalent).
- Cache rendered output in memory for 5–10 minutes per slug.
- Invalidate cache on update/publish/unpublish.
- Disallow raw HTML in markdown unless explicitly allowed and sanitized.

## Backoffice UI
- New admin page: “Static Pages”.
- List view:
  - columns: slug, title, status, updated_at.
  - filter by status and search by slug/title.
- Editor view:
  - Markdown textarea + live preview (rendered via same sanitizer client-side).
  - Save (draft), Publish, Unpublish buttons.
  - Validation messages for slug and empty content.
- Access control: OWNER/ADMIN only.

## Public Route
- Backoffice SPA route `/privacy`.
- Fetch `GET /api/pages/privacy` and render HTML.
- Show “not found” if missing/unpublished.
- Optional: add `/terms` later using the same component and API call.

## Documentation
- Update docs with how to manage pages and public URL.
- Note for Google verification: `https://jurnapod.signal18.id/privacy`.
- Mention requirement for anonymous access (no auth) to satisfy Google checks.

## Testing
- API tests:
  - Create page, publish, fetch public endpoint.
  - Unpublish and verify 404 on public endpoint.
  - Slug validation and duplicate slug errors.
- Rendering tests:
  - Markdown conversion for headings/lists/links.
  - Ensure sanitizer strips scripts.
- Frontend tests:
  - `/privacy` route renders HTML.
  - Not found state shows a friendly message.

## Rollout
1) Migrate DB.
2) Deploy API endpoints.
3) Deploy backoffice admin + public route.
4) Seed privacy page as PUBLISHED.
5) Verify `https://jurnapod.signal18.id/privacy` loads without auth.
