-- Migration 0107: Update sync triggers for modular tier-based versioning
-- Replace single sync_data_versions updates with multi-tier version bumps

-- Create stored procedure to bump multiple sync tiers

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
    
    WHILE v_pos <= LENGTH(p_tier_list) DO
        SET v_next_pos = LOCATE(',', p_tier_list, v_pos);
        
        IF v_next_pos = 0 THEN
            SET v_tier = TRIM(SUBSTRING(p_tier_list, v_pos));
            SET v_pos = LENGTH(p_tier_list) + 1;
        ELSE
            SET v_tier = TRIM(SUBSTRING(p_tier_list, v_pos, v_next_pos - v_pos));
            SET v_pos = v_next_pos + 1;
        END IF;
        
        INSERT INTO sync_tier_versions (company_id, tier, current_version, last_updated_at)
        VALUES (p_company_id, v_tier, 1, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            current_version = current_version + 1,
            last_updated_at = CURRENT_TIMESTAMP;
    END WHILE;
    
    INSERT INTO sync_data_versions (company_id, current_version)
    VALUES (p_company_id, 1)
    ON DUPLICATE KEY UPDATE
        current_version = current_version + 1,
        updated_at = CURRENT_TIMESTAMP;
END;

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

DROP TRIGGER IF EXISTS trg_tax_rates_ad_bump_sync_version;
CREATE TRIGGER trg_tax_rates_ad_bump_sync_version
AFTER DELETE ON tax_rates
FOR EACH ROW
    CALL BumpSyncTiers(OLD.company_id, 'MASTER,OPERATIONAL');

-- Update items triggers (items affect MASTER tier primarily)

DROP TRIGGER IF EXISTS trg_items_ai_bump_sync_version;
CREATE TRIGGER trg_items_ai_bump_sync_version
AFTER INSERT ON items
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER');

DROP TRIGGER IF EXISTS trg_items_au_bump_sync_version;
CREATE TRIGGER trg_items_au_bump_sync_version
AFTER UPDATE ON items
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER');

-- Update item_prices triggers (prices affect MASTER and OPERATIONAL tiers)

DROP TRIGGER IF EXISTS trg_item_prices_ai_bump_sync_version;
CREATE TRIGGER trg_item_prices_ai_bump_sync_version
AFTER INSERT ON item_prices
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL');

DROP TRIGGER IF EXISTS trg_item_prices_au_bump_sync_version;
CREATE TRIGGER trg_item_prices_au_bump_sync_version
AFTER UPDATE ON item_prices
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL');

-- Update outlet_tables triggers (OPERATIONAL and REALTIME tiers)

DROP TRIGGER IF EXISTS trg_outlet_tables_ai_bump_sync_version;
CREATE TRIGGER trg_outlet_tables_ai_bump_sync_version
AFTER INSERT ON outlet_tables
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL,REALTIME');

DROP TRIGGER IF EXISTS trg_outlet_tables_au_bump_sync_version;
CREATE TRIGGER trg_outlet_tables_au_bump_sync_version
AFTER UPDATE ON outlet_tables
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL,REALTIME');

-- Update reservations triggers (OPERATIONAL tier)

DROP TRIGGER IF EXISTS trg_reservations_ai_bump_sync_version;
CREATE TRIGGER trg_reservations_ai_bump_sync_version
AFTER INSERT ON reservations
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL');

DROP TRIGGER IF EXISTS trg_reservations_au_bump_sync_version;
CREATE TRIGGER trg_reservations_au_bump_sync_version
AFTER UPDATE ON reservations
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL');
