-- Migration: 0141_story_20_9_bump_sync_versions_canonical.sql
-- Epic 20 closeout: Make sync_versions the canonical sync version store
-- Redefine BumpSyncTiers to write to sync_versions (tier rows + NULL tier row)
-- Does NOT depend on sync_data_versions or sync_tier_versions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun (uses DROP PROCEDURE IF EXISTS and guarded inserts)

-- Step 1: Redefine BumpSyncTiers procedure to write to sync_versions only
-- - Writes tier-specific rows (tier = 'MASTER', 'OPERATIONAL', etc.)
-- - Writes NULL tier row for data sync version (tier = NULL)
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
    DECLARE v_tbl_exists INT DEFAULT 0;

    -- Guard: only write if sync_versions table exists (it should after 0132)
    SET v_tbl_exists = (
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'sync_versions'
    );

    IF v_tbl_exists = 1 THEN
        -- Loop through each tier in the comma-separated list
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

        -- Upsert NULL tier row for data sync version (same company_id, tier = NULL)
        -- This represents the overall data sync version used by POS and other clients
        INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at)
        VALUES (p_company_id, NULL, 1, 0, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            current_version = current_version + 1,
            last_synced_at = CURRENT_TIMESTAMP;
    END IF;
END;

-- Step 2: Verify the procedure was created successfully (for debugging)
-- This is just a comment for manual verification:
-- SELECT 'BumpSyncTiers redefined to use sync_versions only' AS status;
