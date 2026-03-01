-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_batches'
      AND index_name = 'uq_journal_batches_company_doc'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_batches ADD UNIQUE KEY uq_journal_batches_company_doc (company_id, doc_type, doc_id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_batches'
    GROUP BY index_name
    HAVING SUM(seq_in_index = 1 AND column_name = 'doc_type') = 1
      AND SUM(seq_in_index = 2 AND column_name = 'doc_id') = 1
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_batches ADD KEY idx_journal_batches_doc_type_doc_id (doc_type, doc_id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
