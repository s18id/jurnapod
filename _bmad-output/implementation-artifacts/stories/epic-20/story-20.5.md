# Story 20.5: Auth Throttle Merge

**Status:** done  
**Epic:** Epic 20  
**Story Points:** 2  
**Priority:** P2  
**Risk:** LOW  
**Assigned:** unassigned  

---

## Overview

Merge the two auth throttle tables (`auth_login_throttles` and `auth_password_reset_throttles`) into a single `auth_throttles` table with a `throttle_type` enum. This is a quick win with LOW risk.

## Technical Details

### Database Changes

```sql
-- Create unified auth_throttles table
CREATE TABLE auth_throttles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_hash VARCHAR(255) NOT NULL COMMENT 'Hashed identifier (email, IP, etc)',
    throttle_type ENUM('login', 'password_reset') NOT NULL,
    failure_count INT UNSIGNED DEFAULT 0,
    request_count INT UNSIGNED DEFAULT 0,
    last_failed_at DATETIME NULL,
    last_succeeded_at DATETIME NULL,
    last_ip VARCHAR(45) NULL,
    last_user_agent TEXT NULL,
    locked_until DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_key_type (key_hash, throttle_type),
    INDEX idx_throttle_type (throttle_type),
    INDEX idx_locked_until (locked_until),
    INDEX idx_last_failed (last_failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: Copy data from auth_login_throttles
INSERT INTO auth_throttles (key_hash, throttle_type, failure_count, request_count, last_failed_at, last_ip, last_user_agent, created_at, updated_at)
SELECT 
    email_hash,
    'login',
    failure_count,
    request_count,
    last_failed_at,
    last_ip,
    last_user_agent,
    created_at,
    updated_at
FROM auth_login_throttles
ON DUPLICATE KEY UPDATE 
    failure_count = VALUES(failure_count),
    request_count = VALUES(request_count);

-- Migration: Copy data from auth_password_reset_throttles
INSERT INTO auth_throttles (key_hash, throttle_type, failure_count, request_count, last_failed_at, last_ip, last_user_agent, created_at, updated_at)
SELECT 
    email_hash,
    'password_reset',
    failure_count,
    request_count,
    last_failed_at,
    last_ip,
    last_user_agent,
    created_at,
    updated_at
FROM auth_password_reset_throttles
ON DUPLICATE KEY UPDATE 
    failure_count = VALUES(failure_count),
    request_count = VALUES(request_count);

-- Drop old tables (after verification)
-- DROP TABLE IF EXISTS auth_login_throttles;
-- DROP TABLE IF EXISTS auth_password_reset_throttles;
```

### Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/db/schema.ts` | Add auth_throttles table definition |
| `apps/api/src/lib/auth.ts` | Update throttle functions to use new table |
| `apps/api/src/routes/auth.ts` | Update auth route handlers |

### Migration Steps

1. **Create table**: Create auth_throttles with throttle_type enum
2. **Migrate login throttles**: Copy from auth_login_throttles with type='login'
3. **Migrate password_reset throttles**: Copy from auth_password_reset_throttles with type='password_reset'
4. **Update code**: Update lib/auth.ts throttle functions
5. **Update routes**: Update auth route handlers
6. **Update schema**: Update shared DB schema
7. **Test**: Run auth-related tests
8. **Drop tables**: Drop old tables after verification

## Acceptance Criteria

- [ ] auth_throttles table created with proper indexes
- [ ] throttle_type enum has 'login' and 'password_reset' values
- [ ] All data from auth_login_throttles migrated
- [ ] All data from auth_password_reset_throttles migrated
- [ ] lib/auth.ts updated to use new table
- [ ] Route handlers updated
- [ ] No data loss (verify row counts)
- [ ] Old tables dropped only after full verification

## Dependencies

- None (can run independently as a quick win)
