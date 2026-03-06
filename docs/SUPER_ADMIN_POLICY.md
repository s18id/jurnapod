<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# SUPER_ADMIN Cross-Company Access Policy

**Effective Date:** 2026-03-06  
**Owner:** Platform Team  
**Scope:** SUPER_ADMIN role cross-company access and audit requirements

---

## Overview

The SUPER_ADMIN role is a platform-level role that grants access to all companies in the system. This document defines the access boundaries and audit requirements for SUPER_ADMIN users.

---

## Policy

### 1. Cross-Company Access

**SUPER_ADMIN users have full access to all companies when `company_id` is explicitly provided in the request.**

#### Allowed Endpoints

SUPER_ADMIN cross-company access is permitted on the following endpoint categories:

1. **Companies Management**
   - `GET /api/companies`
   - `GET /api/companies/:companyId`
   - `POST /api/companies`
   - `PATCH /api/companies/:companyId`
   - `DELETE /api/companies/:companyId`

2. **Outlets Management**
   - `GET /api/outlets`
   - `GET /api/outlets/:outletId`
   - `POST /api/outlets`
   - `PATCH /api/outlets/:outletId`
   - `DELETE /api/outlets/:outletId`

3. **Users Management**
   - `GET /api/users`
   - `GET /api/users/:userId`
   - `POST /api/users`
   - `PATCH /api/users/:userId`
   - `DELETE /api/users/:userId`

4. **Settings Management**
   - `GET /api/settings/config`
   - `PUT /api/settings/config`
   - All other `/api/settings/*` endpoints

#### Restrictions

- SUPER_ADMIN must explicitly provide `company_id` in requests (query param or body)
- Cross-company access is NOT automatic based on token context
- SUPER_ADMIN cannot bypass module permissions for non-platform endpoints (e.g., cannot create invoices without `sales:create` permission)

### 2. Audit Logging

**All SUPER_ADMIN cross-company write operations MUST be logged to the audit trail.**

#### Audit Scope

- **Write operations only** (POST, PATCH, PUT, DELETE)
- **Cross-company operations** where `company_id` ≠ authenticated user's `company_id`
- **Platform-level operations** (e.g., creating new companies)

#### Audit Requirements

Each logged action must include:
- `user_id`: SUPER_ADMIN user ID
- `company_id`: Target company ID
- `outlet_id`: Target outlet ID (if applicable)
- `action`: Operation type (CREATE, UPDATE, DELETE)
- `entity_type`: Resource type (company, outlet, user, setting, etc.)
- `entity_id`: Resource ID
- `changes`: JSON payload of the request body or modified fields
- `ip_address`: Client IP address
- `timestamp`: Operation timestamp

#### Exemptions

The following operations are NOT logged:
- Read operations (GET requests)
- Operations where `company_id` matches the SUPER_ADMIN user's company
- Health checks and system endpoints

### 3. Implementation Requirements

#### Guards

All endpoints that support cross-company access must:
1. Check `isSuperAdmin` flag from `checkUserAccess`
2. Validate explicit `company_id` parameter
3. Return 403 for non-SUPER_ADMIN users attempting cross-company access

#### Audit Helper

Use the centralized audit helper for consistency:

```typescript
import { auditSuperAdminCrossCompanyWrite } from "../lib/super-admin-audit";

// In route handler
if (access.isSuperAdmin && targetCompanyId !== auth.companyId) {
  await auditSuperAdminCrossCompanyWrite({
    userId: auth.userId,
    targetCompanyId,
    action: "UPDATE_COMPANY",
    entityType: "company",
    entityId: targetCompanyId,
    changes: input
  });
}
```

---

## Security Considerations

1. **Least Privilege**: SUPER_ADMIN should only be granted to platform administrators
2. **Audit Review**: Regular review of SUPER_ADMIN audit logs is required
3. **Separation of Duties**: SUPER_ADMIN users should not perform routine company operations
4. **MFA Required**: SUPER_ADMIN accounts must have multi-factor authentication enabled (future requirement)

---

## Compliance

This policy supports:
- **SOC 2 Type II**: Audit trail requirements
- **GDPR**: Access logging for personal data
- **Internal Controls**: Separation of duties and audit trail

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-03-06 | 1.0 | Initial policy | ACL Implementation Team |

---

## References

- `docs/acl-next-steps-plan.md`: ACL implementation plan
- `apps/api/src/lib/super-admin-audit.ts`: Audit helper implementation
- `apps/api/src/lib/auth.ts`: `checkUserAccess` function
