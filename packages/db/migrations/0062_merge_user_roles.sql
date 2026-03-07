-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Combine user_roles and user_outlet_roles into single user_role_assignments table
-- outlet_id NULL = global role, outlet_id NOT NULL = outlet-scoped role

-- Step 1: Create new combined table
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_role_outlet (user_id, outlet_id, role_id),
  KEY idx_user_role_assignments_user (user_id),
  KEY idx_user_role_assignments_outlet (outlet_id),
  KEY idx_user_role_assignments_role (role_id),
  CONSTRAINT fk_user_role_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_assignments_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_assignments_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Step 2: Migrate global roles from user_roles (outlet_id = NULL)
INSERT IGNORE INTO user_role_assignments (user_id, role_id, outlet_id)
SELECT ur.user_id, ur.role_id, NULL
FROM user_roles ur;

-- Step 3: Migrate outlet roles from user_outlet_roles
INSERT IGNORE INTO user_role_assignments (user_id, role_id, outlet_id)
SELECT uor.user_id, uor.role_id, uor.outlet_id
FROM user_outlet_roles uor;

-- Step 4: Drop old tables (after migration succeeds)
-- These will fail if data migration failed, which is intentional
DROP TABLE IF EXISTS user_outlet_roles;
DROP TABLE IF EXISTS user_roles;

-- Step 5: Add comment
ALTER TABLE user_role_assignments
  COMMENT = 'User role assignments: outlet_id=NULL for global roles, outlet_id=N for outlet-scoped roles';
