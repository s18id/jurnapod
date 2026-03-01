-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_lines'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'chk_journal_lines_debit_non_negative'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_lines ADD CONSTRAINT chk_journal_lines_debit_non_negative CHECK (debit >= 0)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_lines'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'chk_journal_lines_credit_non_negative'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_lines ADD CONSTRAINT chk_journal_lines_credit_non_negative CHECK (credit >= 0)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_lines'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'chk_journal_lines_one_sided_positive'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_lines ADD CONSTRAINT chk_journal_lines_one_sided_positive CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
