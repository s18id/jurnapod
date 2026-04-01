-- Migration: 0143_story_20_9_sync_versions_null_tier_safety.sql
-- Epic 20 closeout: Ensure canonical NULL-tier data version behavior is safe and deterministic.
-- 1) Deduplicate existing sync_versions rows where tier IS NULL (keep one row per company)
-- 2) Redefine BumpSyncTiers to UPDATE existing NULL-tier row first, then INSERT when missing
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun

-- =============================================================================
-- Step 1: Deduplicate sync_versions NULL-tier rows (if table exists)
-- =============================================================================
SET @sync_versions_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_versions'
);

SET @sql = IF(@sync_versions_exists = 1,
  'UPDATE sync_versions sv JOIN (SELECT company_id, MIN(id) AS keep_id, MAX(current_version) AS max_current_version, MIN(min_version) AS min_min_version, MAX(last_synced_at) AS max_last_synced_at, MAX(updated_at) AS max_updated_at FROM sync_versions WHERE tier IS NULL GROUP BY company_id) agg ON sv.id = agg.keep_id SET sv.current_version = agg.max_current_version, sv.min_version = agg.min_min_version, sv.last_synced_at = agg.max_last_synced_at, sv.updated_at = agg.max_updated_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@sync_versions_exists = 1,
  'DELETE sv FROM sync_versions sv JOIN (SELECT company_id, MIN(id) AS keep_id FROM sync_versions WHERE tier IS NULL GROUP BY company_id) keepers ON sv.company_id = keepers.company_id WHERE sv.tier IS NULL AND sv.id <> keepers.keep_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 2: Redefine BumpSyncTiers for canonical sync_versions writes
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
        -- Upsert tier rows from tier list
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

        -- Canonical data sync row (tier IS NULL): update existing first, insert only if absent
        UPDATE sync_versions
        SET current_version = current_version + 1,
            last_synced_at = CURRENT_TIMESTAMP
        WHERE company_id = p_company_id
          AND tier IS NULL
        ORDER BY id
        LIMIT 1;

        IF ROW_COUNT() = 0 THEN
            INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at)
            VALUES (p_company_id, NULL, 1, 0, CURRENT_TIMESTAMP);
        END IF;
    END IF;
END;
