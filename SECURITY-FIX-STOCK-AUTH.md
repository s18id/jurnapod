# CRITICAL SECURITY FIX: Stock Route Authorization

## Issue
The `requireStockAccess()` function in `apps/api/src/routes/stock.ts` was not performing any role or outlet permission checks and unconditionally calling `next()`. This is a regression from the previous `requireAccess(...)` guard and allows any authenticated user to reach stock read/adjustment handlers regardless of the declared allowed roles.

## Impact
- **CRITICAL**: Any authenticated user could access inventory data for any outlet
- **CRITICAL**: Any authenticated user could perform stock adjustments regardless of role
- **CRITICAL**: Bypassed role-based access control for inventory operations

## Root Cause
The `requireStockAccess()` function had a TODO comment and was not actually implementing authorization:

```typescript
// BEFORE (VULNERABLE):
function requireStockAccess(roles: readonly string[]) {
  return async (c: Context, next: () => Promise<void>): Promise<void | Response> => {
    // ... auth check ...
    // For now, allow access if user has required role
    // The actual outlet access check happens in the service layer
    // TODO: Integrate with full RBAC system when outlet access control is needed
    await next(); // ❌ UNCONDITIONAL ACCESS
  };
}
```

## Fix Applied
Replaced the broken implementation with proper authorization using the existing `requireAccess()` function:

```typescript
// AFTER (SECURE):
function requireStockAccess(roles: readonly string[]) {
  return async (c: Context, next: () => Promise<void>): Promise<void | Response> => {
    // ... extract outlet ID ...
    
    // Use proper auth guard with role and outlet access checks
    const authGuard = requireAccess({
      roles: roles as RoleCode[],
      module: "inventory", 
      permission: "read",
      outletId: outletId
    });

    const authResult = await authGuard(c.req.raw, auth);
    if (authResult) {
      return authResult; // ✅ RETURN FORBIDDEN RESPONSE
    }

    await next(); // ✅ ONLY PROCEED IF AUTHORIZED
  };
}
```

## Routes Protected
The following routes are now properly protected:

1. `GET /outlets/:outletId/stock/` - Requires `["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]`
2. `GET /outlets/:outletId/stock/transactions` - Requires `["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]` 
3. `GET /outlets/:outletId/stock/low` - Requires `["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]`
4. `POST /outlets/:outletId/stock/adjustments` - Requires `["OWNER", "ADMIN", "ACCOUNTANT"]`

## Validation
- ✅ TypeScript compilation passes
- ✅ API build succeeds  
- ✅ Existing stock tests pass
- ✅ Proper role and outlet access validation now enforced

## Files Modified
- `apps/api/src/routes/stock.ts` - Fixed `requireStockAccess()` implementation
- Added imports for `requireAccess` and `RoleCode`

This fix restores proper authorization to inventory operations and prevents unauthorized access to sensitive stock data and adjustment capabilities.