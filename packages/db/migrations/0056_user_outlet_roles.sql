-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS user_outlet_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, outlet_id, role_id),
  KEY idx_user_outlet_roles_outlet (outlet_id),
  KEY idx_user_outlet_roles_role (role_id),
  CONSTRAINT fk_user_outlet_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_outlet_roles_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_outlet_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO user_outlet_roles (user_id, outlet_id, role_id)
SELECT ur.user_id, uo.outlet_id, ur.role_id
FROM user_roles ur
INNER JOIN roles r ON r.id = ur.role_id
INNER JOIN user_outlets uo ON uo.user_id = ur.user_id
WHERE r.is_global = 0;

DELETE ur
FROM user_roles ur
INNER JOIN roles r ON r.id = ur.role_id
WHERE r.is_global = 0;
