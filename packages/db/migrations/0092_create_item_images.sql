-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)
-- Migration: 0092 - Create item_images table for product images

-- Rerunnable/Idempotent migration for MySQL 8.0+ and MariaDB
-- CREATE TABLE IF NOT EXISTS is natively rerunnable

CREATE TABLE IF NOT EXISTS item_images (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NULL,
    file_name VARCHAR(255) NOT NULL,
    original_url VARCHAR(500) NOT NULL,
    large_url VARCHAR(500) NULL,
    medium_url VARCHAR(500) NULL,
    thumbnail_url VARCHAR(500) NULL,
    file_size_bytes INT UNSIGNED NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    width_pixels INT UNSIGNED NULL,
    height_pixels INT UNSIGNED NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id),
    
    INDEX idx_item_images_company_item (company_id, item_id, sort_order),
    INDEX idx_item_images_variant (company_id, variant_id),
    INDEX idx_item_images_primary (company_id, item_id, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Product images with multiple size variants and primary image support';
