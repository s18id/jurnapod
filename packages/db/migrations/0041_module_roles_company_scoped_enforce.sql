-- Enforce company-scoped module_roles
ALTER TABLE module_roles
  MODIFY company_id BIGINT UNSIGNED NOT NULL;
