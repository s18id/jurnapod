-- Migration: 0083_link_inventory_to_journal_batches.sql
-- Story: 4.5 COGS Integration
-- Description: Link inventory transactions to journal batches for COGS tracking
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;

-- Add journal_batch_id column if not exists
SELECT COUNT(*) INTO @batch_col_exists
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'inventory_transactions' 
  AND COLUMN_NAME = 'journal_batch_id';

SET @add_batch_col = IF(@batch_col_exists = 0, 
  'ALTER TABLE inventory_transactions ADD COLUMN journal_batch_id BIGINT UNSIGNED NULL AFTER id,
   ADD CONSTRAINT fk_inventory_transactions_journal_batch FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_batch_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for journal batch lookups
SELECT COUNT(*) INTO @batch_idx_exists
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'inventory_transactions' 
  AND INDEX_NAME = 'idx_inventory_transactions_journal_batch';

SET @add_batch_idx = IF(@batch_idx_exists = 0,
  'CREATE INDEX idx_inventory_transactions_journal_batch ON inventory_transactions(journal_batch_id)',
  'SELECT 1');
PREPARE stmt FROM @add_batch_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
