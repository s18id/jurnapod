-- 0102_users_add_name_column.sql
-- Add name column to users table for user creation with name
-- Portable across MySQL 8.0+ and MariaDB

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'name'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE users ADD COLUMN name VARCHAR(191) NULL AFTER company_id',
  'SELECT ''skip add name'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
