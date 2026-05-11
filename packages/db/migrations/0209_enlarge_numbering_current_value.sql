-- Migration 0209: Enlarge numbering_templates.current_value for large manual sequences.
-- 
-- parseTrailingSequence() extracts trailing digits from document-number strings.
-- When payment_no contains large timestamp-based suffixes (e.g., PAY1746965803000),
-- Math.max() pushes the parsed value into current_value, which overflows int(10) unsigned
-- (max 4,294,967,295).
--
-- BIGINT unsigned supports up to 18,446,744,073,709,551,615, which accommodates
-- epoch-millisecond timestamps (~1.7e12) with generous headroom.

ALTER TABLE numbering_templates
  MODIFY COLUMN current_value BIGINT UNSIGNED NOT NULL DEFAULT 0;
