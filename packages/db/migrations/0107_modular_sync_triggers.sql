-- Migration 0107: Update sync triggers for modular tier-based versioning
-- Replace single sync_data_versions updates with multi-tier version bumps

-- Create stored procedure to bump multiple sync tiers
DELIMITER //

DROP PROCEDURE IF EXISTS BumpSyncTiers//

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
    
    -- Ensure sync_tier_versions record exists for each tier
    WHILE v_pos <= LENGTH(p_tier_list) DO
        SET v_next_pos = LOCATE(',', p_tier_list, v_pos);
        
        IF v_next_pos = 0 THEN
            SET v_tier = TRIM(SUBSTRING(p_tier_list, v_pos));
            SET v_pos = LENGTH(p_tier_list) + 1;
        ELSE
            SET v_tier = TRIM(SUBSTRING(p_tier_list, v_pos, v_next_pos - v_pos));
            SET v_pos = v_next_pos + 1;
        END IF;
        
        -- Insert or update tier version
        INSERT INTO sync_tier_versions (company_id, tier, current_version, last_updated_at)
        VALUES (p_company_id, v_tier, 1, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            current_version = current_version + 1,
            last_updated_at = CURRENT_TIMESTAMP;
    END WHILE;
    
    -- Also bump legacy sync_data_versions for backward compatibility
    INSERT INTO sync_data_versions (company_id, current_version)
    VALUES (p_company_id, 1)
    ON DUPLICATE KEY UPDATE
        current_version = current_version + 1,
        updated_at = CURRENT_TIMESTAMP;
END//

DELIMITER ;

-- Update tax_rates triggers to use multi-tier versioning
-- Tax rates affect MASTER and OPERATIONAL tiers

DROP TRIGGER IF EXISTS trg_tax_rates_ai_bump_sync_version;
CREATE TRIGGER trg_tax_rates_ai_bump_sync_version
AFTER INSERT ON tax_rates
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL');

DROP TRIGGER IF EXISTS trg_tax_rates_au_bump_sync_version;
CREATE TRIGGER trg_tax_rates_au_bump_sync_version
AFTER UPDATE ON tax_rates
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL');

-- Check if tax_rates delete trigger exists and update it
SET @tax_rates_delete_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_tax_rates_ad_bump_sync_version'
      AND EVENT_OBJECT_TABLE = 'tax_rates'
);

SET @sql = IF(
    @tax_rates_delete_trigger_exists > 0,
    'DROP TRIGGER trg_tax_rates_ad_bump_sync_version;
     CREATE TRIGGER trg_tax_rates_ad_bump_sync_version
     AFTER DELETE ON tax_rates
     FOR EACH ROW
         CALL BumpSyncTiers(OLD.company_id, ''MASTER,OPERATIONAL'')',
    'SELECT ''tax_rates delete trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update items triggers if they exist (items affect MASTER tier primarily)
SET @items_insert_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_items_ai_bump_sync_version'
);

SET @sql = IF(
    @items_insert_trigger_exists > 0,
    'DROP TRIGGER trg_items_ai_bump_sync_version;
     CREATE TRIGGER trg_items_ai_bump_sync_version
     AFTER INSERT ON items
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''MASTER'')',
    'SELECT ''items insert trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @items_update_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_items_au_bump_sync_version'
);

SET @sql = IF(
    @items_update_trigger_exists > 0,
    'DROP TRIGGER trg_items_au_bump_sync_version;
     CREATE TRIGGER trg_items_au_bump_sync_version
     AFTER UPDATE ON items
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''MASTER'')',
    'SELECT ''items update trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update item_prices triggers if they exist (prices affect MASTER and OPERATIONAL tiers)
SET @item_prices_insert_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_item_prices_ai_bump_sync_version'
);

SET @sql = IF(
    @item_prices_insert_trigger_exists > 0,
    'DROP TRIGGER trg_item_prices_ai_bump_sync_version;
     CREATE TRIGGER trg_item_prices_ai_bump_sync_version
     AFTER INSERT ON item_prices
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''MASTER,OPERATIONAL'')',
    'SELECT ''item_prices insert trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @item_prices_update_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_item_prices_au_bump_sync_version'
);

SET @sql = IF(
    @item_prices_update_trigger_exists > 0,
    'DROP TRIGGER trg_item_prices_au_bump_sync_version;
     CREATE TRIGGER trg_item_prices_au_bump_sync_version
     AFTER UPDATE ON item_prices
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''MASTER,OPERATIONAL'')',
    'SELECT ''item_prices update trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update outlet_tables triggers for OPERATIONAL and REALTIME tiers
SET @outlet_tables_insert_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_outlet_tables_ai_bump_sync_version'
);

SET @sql = IF(
    @outlet_tables_insert_trigger_exists > 0,
    'DROP TRIGGER trg_outlet_tables_ai_bump_sync_version;
     CREATE TRIGGER trg_outlet_tables_ai_bump_sync_version
     AFTER INSERT ON outlet_tables
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''OPERATIONAL,REALTIME'')',
    'SELECT ''outlet_tables insert trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outlet_tables_update_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_outlet_tables_au_bump_sync_version'
);

SET @sql = IF(
    @outlet_tables_update_trigger_exists > 0,
    'DROP TRIGGER trg_outlet_tables_au_bump_sync_version;
     CREATE TRIGGER trg_outlet_tables_au_bump_sync_version
     AFTER UPDATE ON outlet_tables
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''OPERATIONAL,REALTIME'')',
    'SELECT ''outlet_tables update trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update reservations triggers for OPERATIONAL tier
SET @reservations_insert_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_reservations_ai_bump_sync_version'
);

SET @sql = IF(
    @reservations_insert_trigger_exists > 0,
    'DROP TRIGGER trg_reservations_ai_bump_sync_version;
     CREATE TRIGGER trg_reservations_ai_bump_sync_version
     AFTER INSERT ON reservations
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''OPERATIONAL'')',
    'SELECT ''reservations insert trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @reservations_update_trigger_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE() 
      AND TRIGGER_NAME = 'trg_reservations_au_bump_sync_version'
);

SET @sql = IF(
    @reservations_update_trigger_exists > 0,
    'DROP TRIGGER trg_reservations_au_bump_sync_version;
     CREATE TRIGGER trg_reservations_au_bump_sync_version
     AFTER UPDATE ON reservations
     FOR EACH ROW
         CALL BumpSyncTiers(NEW.company_id, ''OPERATIONAL'')',
    'SELECT ''reservations update trigger does not exist, skipping'''
);

SET @sql = REPLACE(@sql, CHAR(10), ' ');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;