-- Migration: 0144_story_20_9_sync_versions_null_tier_unique_guard.sql
-- Epic 20 closeout: enforce NULL-tier uniqueness semantics for sync_versions
-- Adds generated tier_key + unique index (company_id, tier_key), then redefines BumpSyncTiers to use upsert for NULL tier.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun

-- =============================================================================
-- Step 1: Ensure sync_versions exists
-- =============================================================================
SET @sync_versions_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_versions'
);

-- =============================================================================
-- Step 2: Deduplicate existing rows per canonical key before unique guard
-- =============================================================================
SET @sql = IF(@sync_versions_exists = 1,
  'UPDATE sync_versions sv JOIN (SELECT company_id, COALESCE(tier, ''__DATA__'') AS tier_key_norm, MIN(id) AS keep_id, MAX(current_version) AS max_current_version, MIN(min_version) AS min_min_version, MAX(last_synced_at) AS max_last_synced_at, MAX(updated_at) AS max_updated_at FROM sync_versions GROUP BY company_id, COALESCE(tier, ''__DATA__'')) agg ON sv.id = agg.keep_id SET sv.current_version = agg.max_current_version, sv.min_version = agg.min_min_version, sv.last_synced_at = agg.max_last_synced_at, sv.updated_at = agg.max_updated_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@sync_versions_exists = 1,
  'DELETE sv FROM sync_versions sv JOIN (SELECT company_id, COALESCE(tier, ''__DATA__'') AS tier_key_norm, MIN(id) AS keep_id FROM sync_versions GROUP BY company_id, COALESCE(tier, ''__DATA__'')) keepers ON sv.company_id = keepers.company_id AND COALESCE(sv.tier, ''__DATA__'') = keepers.tier_key_norm WHERE sv.id <> keepers.keep_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 3: Add generated tier_key column if missing
-- =============================================================================
SET @tier_key_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_versions'
    AND column_name = 'tier_key'
);

SET @sql = IF(@sync_versions_exists = 1 AND @tier_key_exists = 0,
  'ALTER TABLE sync_versions ADD COLUMN tier_key VARCHAR(32) GENERATED ALWAYS AS (COALESCE(tier, ''__DATA__'')) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 4: Add canonical unique index if missing
-- =============================================================================
SET @uq_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_versions'
    AND index_name = 'uq_sync_versions_company_tier_key'
);

SET @sql = IF(@sync_versions_exists = 1 AND @uq_exists = 0,
  'CREATE UNIQUE INDEX uq_sync_versions_company_tier_key ON sync_versions(company_id, tier_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 5: Redefine BumpSyncTiers with canonical upsert (includes NULL tier)
-- =============================================================================
DROP PROCEDURE IF EXISTS BumpSyncTiers;

CREATE PROCEDURE BumpSyncTiers(
    IN p_company_id BIGINT UNSIGNED,
    IN p_tier_list VARCHAR(255)
)
READS SQL DATA
MODIFIES SQL DATA
BEGIN
    DECLARE v_tier VARCHAR(20);
    DECLARE v_pos INT DEFAULT 1;
    DECLARE v_next_pos INT;
    DECLARE v_sync_versions_exists INT DEFAULT 0;

    SET v_sync_versions_exists = (
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'sync_versions'
    );

    IF v_sync_versions_exists = 1 THEN
        IF p_tier_list IS NOT NULL AND LENGTH(TRIM(p_tier_list)) > 0 THEN
            WHILE v_pos <= LENGTH(p_tier_list) DO
                SET v_next_pos = LOCATE(',', p_tier_list, v_pos);

                IF v_next_pos = 0 THEN
                    SET v_tier = TRIM(SUBSTRING(p_tier_list, v_pos));
                    SET v_pos = LENGTH(p_tier_list) + 1;
                ELSE
                    SET v_tier = TRIM(SUBSTRING(p_tier_list, v_pos, v_next_pos - v_pos));
                    SET v_pos = v_next_pos + 1;
                END IF;

                INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at)
                VALUES (p_company_id, v_tier, 1, 0, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    current_version = current_version + 1,
                    last_synced_at = CURRENT_TIMESTAMP;
            END WHILE;
        END IF;

        INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at)
        VALUES (p_company_id, NULL, 1, 0, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            current_version = current_version + 1,
            last_synced_at = CURRENT_TIMESTAMP;
    END IF;
END;
