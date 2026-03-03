-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add email_verified_at column to users table
-- Tracks when a user's email address was verified

ALTER TABLE users
ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL
AFTER email;

-- Add index for querying verified users
CREATE INDEX idx_users_email_verified_at ON users(email_verified_at);
