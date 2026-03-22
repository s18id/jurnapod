# ADR-004: Authentication Model (JWT + RBAC)

**Status:** Accepted  
**Date:** 2026-03-05  
**Deciders:** Epic 1 Team  

---

## Context

Jurnapod needs a secure, scalable authentication system that supports:

- **Multi-tenant** - Multiple companies on same system
- **Role-based Access** - Different permissions per role
- **Outlet Scoping** - Users can access specific outlets only
- **Session Management** - Token refresh, logout, session invalidation

### Problem Statement

Authentication needs to be:
1. **Secure** - No unauthorized access
2. **Performant** - Fast auth checks on every request
3. **Scalable** - Works with many concurrent users
4. **Maintainable** - Clear permission model

---

## Decision

We implement a **JWT-based Authentication with Role-Based Access Control (RBAC)**:

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User ──▶ Login ──▶ JWT Token ──▶ Request + Token          │
│                    │                    │                  │
│                    │                    ▼                  │
│                    │              Auth Guard ──▶ Resource  │
│                    │                    │                  │
│                    │                    ▼                  │
│                    │              Permission Check         │
│                    │                    │                  │
│                    ◀────────────────────┘                  │
│                   (if authorized)                          │
└─────────────────────────────────────────────────────────────┘
```

### Token Structure

```typescript
// JWT Payload
interface JWTPayload {
  sub: string;           // User ID
  email: string;         // User email
  company_id: number;     // Company scope
  roles: RoleCode[];     // ['OWNER', 'ACCOUNTANT']
  outlet_ids: number[];  // Accessible outlets (null = all)
  iat: number;           // Issued at
  exp: number;           // Expiration
  jti: string;           // Unique token ID for revocation
}
```

### Role Hierarchy

| Role | Description | Permissions |
|------|-------------|-------------|
| OWNER | Company owner | All permissions |
| COMPANY_ADMIN | Company admin | Most admin permissions |
| ADMIN | Outlet admin | Outlet-level admin |
| ACCOUNTANT | Accountant | Financial reports, journals |
| CASHIER | Cashier | POS, basic operations |

### Permission Model

```typescript
// Permission definitions
const PERMISSIONS = {
  // Reports
  'reports:read': ['OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  'reports:export': ['OWNER', 'COMPANY_ADMIN', 'ACCOUNTANT'],
  
  // Transactions
  'transactions:create': ['OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER'],
  'transactions:void': ['OWNER', 'COMPANY_ADMIN', 'ADMIN'],
  
  // Settings
  'settings:read': ['OWNER', 'COMPANY_ADMIN', 'ADMIN'],
  'settings:write': ['OWNER', 'COMPANY_ADMIN'],
  
  // Users
  'users:read': ['OWNER', 'COMPANY_ADMIN', 'ADMIN'],
  'users:write': ['OWNER', 'COMPANY_ADMIN'],
} as const;

// Check permission
function hasPermission(roles: RoleCode[], permission: string): boolean {
  const allowedRoles = PERMISSIONS[permission as keyof typeof PERMISSIONS];
  if (!allowedRoles) return false;
  return roles.some(role => allowedRoles.includes(role));
}
```

---

## Implementation Details

### Token Generation

```typescript
// Using jose library
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

async function generateToken(user: User): Promise<string> {
  return new SignJWT({
    email: user.email,
    company_id: user.company_id,
    roles: user.roles,
    outlet_ids: user.outlet_ids
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .setJTI(crypto.randomUUID())
    .sign(secret);
}
```

### Auth Guard Middleware

```typescript
// Middleware for API routes
async function authGuard(request: Request): Promise<AuthResult> {
  const token = extractToken(request);
  if (!token) {
    return { success: false, error: 'UNAUTHORIZED' };
  }
  
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      success: true,
      auth: {
        userId: parseInt(payload.sub),
        companyId: payload.company_id as number,
        email: payload.email as string,
        roles: payload.roles as RoleCode[],
        outletIds: payload.outlet_ids as number[] | null
      }
    };
  } catch (error) {
    return { success: false, error: 'INVALID_TOKEN' };
  }
}
```

### Role Guard

```typescript
// Guard for specific permissions
function requirePermission(permission: string) {
  return async (request: Request, auth: AuthContext): Promise<Response | null> => {
    if (!hasPermission(auth.roles, permission)) {
      return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);
    }
    return null; // Proceed
  };
}

// Usage
app.get('/reports/trial-balance', 
  withAuth(handler, [requirePermission('reports:read')])
);
```

### Outlet Scoping

```typescript
// Filter outlets based on user's access
function filterUserOutlets(auth: AuthContext, outletId?: number): number[] {
  // User with null outlet_ids has access to all
  if (auth.outletIds === null) {
    return outletId ? [outletId] : getAllOutletIds(auth.companyId);
  }
  
  // Filter to user's accessible outlets
  if (outletId) {
    if (!auth.outletIds.includes(outletId)) {
      return []; // No access
    }
    return [outletId];
  }
  
  return auth.outletIds;
}
```

---

## Token Refresh

### Strategy

- **Access Token** - 8 hour expiry
- **Refresh Token** - 7 day expiry, stored in httpOnly cookie

```typescript
// Refresh endpoint
async function refresh(request: Request): Promise<Response> {
  const refreshToken = request.cookies.get('refresh_token');
  if (!refreshToken) {
    return errorResponse('UNAUTHORIZED', 'No refresh token', 401);
  }
  
  // Verify refresh token and generate new access token
  const user = await verifyRefreshToken(refreshToken);
  const newAccessToken = await generateToken(user);
  
  return Response.json({ 
    access_token: newAccessToken 
  });
}
```

---

## Consequences

### Positive

1. **Stateless** - JWT can be validated without DB lookup
2. **Scalable** - Token validation is O(1)
3. **Flexible** - Roles and permissions easily extended
4. **Secure** - Tokens signed, tamper-proof

### Negative

1. **Token Expiry** - Need refresh mechanism
2. **Revocation** - Can't invalidate tokens immediately
3. **Size** - JWT payload adds overhead to each request

### Mitigation

- Short-lived tokens (8h) limit exposure
- Token ID (jti) for eventual revocation tracking
- Blacklist for critical security events

---

## References

- Epic 1: Foundation - Auth, Company & Outlet Management
- Story 1.1: User Login (Email/Password + Google SSO)
- Story 1.2: JWT Token Management and Refresh
- Story 1.3: RBAC Role Definitions and Permissions
- Story 1.4: Admin User Management CRUD
