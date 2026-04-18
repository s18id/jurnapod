-- Migration: 0159_story_44_0_numbering_reset_periods.sql
-- Purpose: Extend numbering_templates.reset_period CHECK to include WEEKLY and DAILY
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: yes

SET FOREIGN_KEY_CHECKS=0;

SELECT VERSION() LIKE '%MariaDB%' INTO @is_mariadb;

SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'numbering_templates';

SELECT COUNT(*) INTO @constraint_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'numbering_templates'
  AND CONSTRAINT_NAME = 'chk_numbering_templates_reset_period';

SET @drop_constraint_sql = IF(
  @table_exists = 1 AND @constraint_exists = 1,
  IF(
    @is_mariadb = 1,
    'ALTER TABLE numbering_templates DROP CONSTRAINT chk_numbering_templates_reset_period',
    'ALTER TABLE numbering_templates DROP CHECK chk_numbering_templates_reset_period'
  ),
  'SELECT ''chk_numbering_templates_reset_period not present or table missing'' AS msg;'
);

PREPARE stmt FROM @drop_constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @constraint_exists_after_drop
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'numbering_templates'
  AND CONSTRAINT_NAME = 'chk_numbering_templates_reset_period';

SET @add_constraint_sql = IF(
  @table_exists = 1 AND @constraint_exists_after_drop = 0,
  "ALTER TABLE numbering_templates ADD CONSTRAINT chk_numbering_templates_reset_period CHECK (reset_period IN ('NEVER','YEARLY','MONTHLY','WEEKLY','DAILY'))",
  'SELECT ''chk_numbering_templates_reset_period already set or table missing'' AS msg;'
);

PREPARE stmt FROM @add_constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
