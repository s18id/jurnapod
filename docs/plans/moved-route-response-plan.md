# Moved Route Response Helper Plan

## Goal

Standardize legacy moved-route responses (HTTP 410) using a shared helper that returns the standard error envelope.

Target envelope:

```json
{
  "success": false,
  "error": {
    "code": "ROUTE_MOVED",
    "new_path": "/api/new-path"
  }
}
```

## Scope

- Add a `movedResponse(newPath: string, status = 410)` helper in `apps/api/src/lib/response.ts`.
- Replace per-route `ROUTE_MOVED_RESPONSE` constants and `Response.json(...)` usage with the helper.
- Keep existing `new_path` values intact.

## Non-Goals

- Do not change HTTP status codes (stay 410).
- Do not add new fields to the moved response envelope.
- Do not alter the moved route paths.

## Plan

1. **Add helper**
   - Implement `movedResponse(newPath: string, status = 410)` in `apps/api/src/lib/response.ts`.
   - Return `{ success: false, error: { code: "ROUTE_MOVED", new_path: newPath } }`.

2. **Standardize routes**
   - Replace `ROUTE_MOVED_RESPONSE` constants with `movedResponse("/api/...")`.
   - Update these legacy endpoints:
     - `apps/api/app/api/supplies/route.ts`
     - `apps/api/app/api/supplies/[supplyId]/route.ts`
     - `apps/api/app/api/item-prices/route.ts`
     - `apps/api/app/api/item-prices/active/route.ts`
     - `apps/api/app/api/item-prices/[priceId]/route.ts`
     - `apps/api/app/api/items/route.ts`
     - `apps/api/app/api/items/[itemId]/route.ts`
     - `apps/api/app/api/me/route.ts`
     - `apps/api/app/api/outlet-payment-method-mappings/route.ts`
     - `apps/api/app/api/outlet-access/route.ts`
     - `apps/api/app/api/outlet-account-mappings/route.ts`
     - `apps/api/app/api/module-roles/route.ts`
     - `apps/api/app/api/module-roles/[roleId]/[module]/route.ts`
     - `apps/api/app/api/fixed-asset-categories/route.ts`
     - `apps/api/app/api/fixed-asset-categories/[categoryId]/route.ts`
     - `apps/api/app/api/fixed-assets/route.ts`
     - `apps/api/app/api/fixed-assets/[assetId]/route.ts`
     - `apps/api/app/api/fixed-assets/[assetId]/depreciation-plan/route.ts`
     - `apps/api/app/api/depreciation/run/route.ts`
     - `apps/api/app/api/accounting/imports/route.ts`
     - `apps/api/app/api/account-types/route.ts`
     - `apps/api/app/api/account-types/[accountTypeId]/route.ts`
     - `apps/api/app/api/admin/pages/route.ts`
     - `apps/api/app/api/admin/pages/[pageId]/route.ts`
     - `apps/api/app/api/admin/pages/[pageId]/publish/route.ts`
     - `apps/api/app/api/admin/pages/[pageId]/unpublish/route.ts`

3. **Verify**
   - Grep for remaining `ROUTE_MOVED_RESPONSE` constants and remove them.
   - Grep for `Response.json(ROUTE_MOVED_RESPONSE` to confirm cleanup.

## Notes

- The helper aligns moved responses with the standard error envelope used elsewhere.
- Keeping `new_path` allows clients to discover the updated endpoint reliably.
