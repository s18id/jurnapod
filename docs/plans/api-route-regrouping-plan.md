# API Route Regrouping Plan

## Summary
Regroup API routes by module prefix to align path structure with `module_roles`, standardize authorization to always include `module + permission`, and keep a 410 compatibility layer for one release cycle.

## Goals
- Make route structure mirror module ownership.
- Ensure every authenticated route uses `module + permission` checks.
- Keep role allowlists for sensitive endpoints.
- Provide a clear migration path for clients (410 responses on old routes for one release).

## Non-Goals
- Change public/auth routes (`/api/auth/*`, `/api/health`, `/api/pages/*`).
- Redesign business logic or payloads.

## Decisions
- Keep global roles; company-scoped `module_roles` remains enforced.
- Use 410 compatibility responses with `{ error: { code: "ROUTE_MOVED", new_path } }` for one release cycle.
- Map admin/system routes to `settings` module.

## Route Moves (Old -> New)

### settings
- `/api/module-roles` -> `/api/settings/module-roles`
- `/api/module-roles/:roleId/:module` -> `/api/settings/module-roles/:roleId/:module`
- `/api/admin/pages` -> `/api/settings/pages`
- `/api/admin/pages/:pageId` -> `/api/settings/pages/:pageId`
- `/api/admin/pages/:pageId/publish` -> `/api/settings/pages/:pageId/publish`
- `/api/admin/pages/:pageId/unpublish` -> `/api/settings/pages/:pageId/unpublish`
- `/api/outlet-account-mappings` -> `/api/settings/outlet-account-mappings`
- `/api/outlet-payment-method-mappings` -> `/api/settings/outlet-payment-method-mappings`

### outlets
- `/api/outlet-access` -> `/api/outlets/access`

### users
- `/api/me` -> `/api/users/me`

### accounts
- `/api/account-types` -> `/api/accounts/types`
- `/api/account-types/:accountTypeId` -> `/api/accounts/types/:accountTypeId`
- `/api/accounting/imports` -> `/api/accounts/imports`
- `/api/fixed-assets` -> `/api/accounts/fixed-assets`
- `/api/fixed-assets/:assetId` -> `/api/accounts/fixed-assets/:assetId`
- `/api/fixed-assets/:assetId/depreciation-plan` -> `/api/accounts/fixed-assets/:assetId/depreciation-plan`
- `/api/fixed-asset-categories` -> `/api/accounts/fixed-asset-categories`
- `/api/fixed-asset-categories/:categoryId` -> `/api/accounts/fixed-asset-categories/:categoryId`
- `/api/depreciation/run` -> `/api/accounts/depreciation/run`

### inventory
- `/api/items` -> `/api/inventory/items`
- `/api/items/:itemId` -> `/api/inventory/items/:itemId`
- `/api/item-prices` -> `/api/inventory/item-prices`
- `/api/item-prices/:priceId` -> `/api/inventory/item-prices/:priceId`
- `/api/item-prices/active` -> `/api/inventory/item-prices/active`
- `/api/supplies` -> `/api/inventory/supplies`
- `/api/supplies/:supplyId` -> `/api/inventory/supplies/:supplyId`

## Guard Standardization
- Every authenticated route uses `requireAccess({ module, permission, roles?, outletId? })`.
- Permission mapping:
  - GET -> `read`
  - POST -> `create`
  - PATCH/PUT -> `update`
  - DELETE -> `delete`
  - Action routes (`/post`, `/publish`, `/unpublish`, `/reactivate`, `/deactivate`) -> `update`
  - Print/PDF routes -> `read`
- Sensitive routes keep role allowlists (e.g., settings/module-roles, company management).

## Compatibility Layer
- Old routes return 410 for one release cycle:
  - `{ "ok": false, "error": { "code": "ROUTE_MOVED", "new_path": "/api/new/path" } }`
- Remove old routes after the deprecation window.

## Implementation Steps
1) Move/rename route files to new module paths.
2) Add compatibility handlers at old paths (410).
3) Update guard usage to include `module + permission` on all authenticated routes.
4) Update client API calls (backoffice + pos + scripts/tests).
5) Validate with smoke checks and targeted API calls.
6) Document breaking changes and deprecation timeline.

## Rollback
- Keep old routes during deprecation period to allow client fallback.
- If rollback needed, revert route moves and keep old paths.

## Verification
- Ensure no authenticated route lacks `module + permission`.
- Confirm 410 responses include correct `new_path`.
- Run `npm run db:smoke` and targeted API checks for auth-sensitive endpoints.
