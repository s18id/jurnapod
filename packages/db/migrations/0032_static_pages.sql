-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create static_pages table
-- Description: Store global markdown-based static pages for public documents.

CREATE TABLE IF NOT EXISTS static_pages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(128) NOT NULL,
  title VARCHAR(191) NOT NULL,
  content_md MEDIUMTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME DEFAULT NULL,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  meta_json LONGTEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_static_pages_slug (slug),
  KEY idx_static_pages_status (status),
  CONSTRAINT chk_static_pages_status CHECK (status IN ('DRAFT', 'PUBLISHED')),
  CONSTRAINT chk_static_pages_meta_json CHECK (meta_json IS NULL OR JSON_VALID(meta_json)),
  CONSTRAINT fk_static_pages_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_static_pages_updated_by_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SET @privacy_effective_date := DATE_FORMAT(CURRENT_DATE, '%M %e, %Y');

INSERT INTO static_pages (
  slug,
  title,
  content_md,
  status,
  published_at
)
VALUES (
  'privacy',
  'Privacy Policy',
  CONCAT(
    '# Privacy Policy\n\n',
    'Effective date: ', @privacy_effective_date, '\n\n',
    'This Privacy Policy describes how PT Signal Delapan Belas ("we", "our", "us") collects and uses information when you use Jurnapod services (Backoffice, POS, and API).\n\n',
    '## Information We Collect\n',
    '- Account information: email, role, and access permissions.\n',
    '- Business data: items, prices, invoices, payments, and journal entries.\n',
    '- POS transaction data and audit logs for operational traceability.\n',
    '- Technical data: device information, IP address, and timestamps for security.\n\n',
    '## How We Use Information\n',
    '- Authenticate users and authorize access.\n',
    '- Operate, maintain, and improve the Jurnapod services.\n',
    '- Provide customer support and respond to inquiries.\n',
    '- Maintain audit trails for compliance and security.\n\n',
    '## Sharing of Information\n',
    'We do not sell your personal data. We may share information with trusted service providers (such as hosting and infrastructure vendors) to operate the service. If you use Google SSO, Google provides authentication information to us. We only use it to verify your identity.\n\n',
    '## Cookies and Sessions\n',
    'We use HTTP-only cookies for session refresh tokens when enabled. These cookies are used for authentication and security and are not used for advertising.\n\n',
    '## Data Retention\n',
    'We retain data as long as needed to provide services and comply with legal and operational requirements. Audit logs may be retained longer for compliance and security.\n\n',
    '## Security\n',
    'We implement reasonable technical and organizational measures to protect data against unauthorized access or disclosure. No system is completely secure, so please use strong passwords and keep credentials confidential.\n\n',
    '## Your Rights\n',
    'You may request access, correction, or deletion of your personal data, subject to legal and contractual requirements.\n\n',
    '## Contact Us\n',
    'Email: [privacy@signal18.id](mailto:privacy@signal18.id)\n\n',
    'PT Signal Delapan Belas\n',
    'Ruko Golden Madrid Blok D No 26 Room 1260\n',
    'Jl. Letnan Sutopo BSD City\n',
    'Kota Tangerang Selatan\n',
    'Banten\n'
  ),
  'PUBLISHED',
  NOW()
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  content_md = VALUES(content_md),
  status = VALUES(status),
  published_at = VALUES(published_at),
  updated_at = CURRENT_TIMESTAMP;
