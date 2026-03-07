-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS outlet_tables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  zone VARCHAR(64) NULL,
  capacity INT UNSIGNED NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outlet_tables_outlet_code (company_id, outlet_id, code),
  KEY idx_outlet_tables_company_outlet_id (company_id, outlet_id, id),
  KEY idx_outlet_tables_company_outlet_status (company_id, outlet_id, status),
  CONSTRAINT chk_outlet_tables_status CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'UNAVAILABLE')),
  CONSTRAINT fk_outlet_tables_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_outlet_tables_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  table_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(191) NOT NULL,
  customer_phone VARCHAR(64) NULL,
  guest_count INT UNSIGNED NOT NULL,
  reservation_at DATETIME NOT NULL,
  duration_minutes INT UNSIGNED NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'BOOKED',
  notes VARCHAR(500) NULL,
  linked_order_id CHAR(36) NULL,
  arrived_at DATETIME NULL,
  seated_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reservations_company_outlet_id (company_id, outlet_id, id),
  KEY idx_reservations_company_outlet_time (company_id, outlet_id, reservation_at),
  KEY idx_reservations_company_outlet_status (company_id, outlet_id, status),
  KEY idx_reservations_company_outlet_table (company_id, outlet_id, table_id),
  CONSTRAINT chk_reservations_status CHECK (status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  CONSTRAINT chk_reservations_guest_count CHECK (guest_count > 0),
  CONSTRAINT fk_reservations_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_reservations_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_reservations_table_scoped FOREIGN KEY (company_id, outlet_id, table_id)
    REFERENCES outlet_tables(company_id, outlet_id, id)
) ENGINE=InnoDB;
