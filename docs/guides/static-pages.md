# Static Pages Guide

## Overview
Static pages are database-backed Markdown documents for public policies (e.g. Privacy Policy). Content is rendered to sanitized HTML at read time.

## Admin UI
Backoffice path: `#/static-pages`

Workflow:
1. Create a page with `slug`, `title`, and Markdown content.
2. Save as Draft or Publish.
3. Use Publish/Unpublish to control public visibility.

Status:
- `DRAFT`: not publicly available.
- `PUBLISHED`: visible from the public endpoint.

## Slug Rules
- Lowercase + hyphen only.
- Regex: `[a-z0-9-]`.

## API Summary
Public (no auth):
- `GET /api/pages/:slug`
  - Returns only `PUBLISHED` pages.
  - 404 with `{ ok: false, error: { code: "NOT_FOUND" } }` when missing/unpublished.

Admin (OWNER/ADMIN):
- `GET /api/admin/pages?q=`
- `POST /api/admin/pages`
- `PATCH /api/admin/pages/:id`
- `POST /api/admin/pages/:id/publish`
- `POST /api/admin/pages/:id/unpublish`

## Rendering & Security
- Markdown is rendered server-side and sanitized before returning HTML.
- Client preview uses the same sanitizer.
- Raw HTML is stripped unless explicitly allowed and sanitized.

## Public Privacy URL
Public route: `/privacy`

- The backoffice app serves this route without authentication.
- The page fetches `GET /api/pages/privacy` and renders the HTML.
- Google verification requires anonymous access to:
  - `https://jurnapod.signal18.id/privacy`

## Seeded Privacy Page
- The `privacy` page is seeded in the migration as `PUBLISHED`.
- The effective date is set to the migration execution date.

## Rollout Checklist
1. Run DB migration to create `static_pages` and seed `privacy`.
2. Deploy API with public + admin static pages endpoints.
3. Deploy backoffice with Static Pages admin and public `/privacy` route.
4. Verify public access (no auth):
   - `https://jurnapod.signal18.id/privacy`
   - `curl -i https://jurnapod.signal18.id/api/pages/privacy`
