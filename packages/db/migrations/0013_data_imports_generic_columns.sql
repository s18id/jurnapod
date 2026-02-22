ALTER TABLE data_imports
  CHANGE COLUMN da_file_name accounts_file_name VARCHAR(255) NOT NULL,
  CHANGE COLUMN trns_file_name transactions_file_name VARCHAR(255) NOT NULL,
  CHANGE COLUMN alk_file_name allocations_file_name VARCHAR(255) NOT NULL;
