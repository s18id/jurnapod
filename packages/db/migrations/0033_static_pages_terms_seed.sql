-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Seed terms of service page (draft)

SET @terms_effective_date := DATE_FORMAT(CURRENT_DATE, '%M %e, %Y');

INSERT INTO static_pages (
  slug,
  title,
  content_md,
  status,
  published_at
)
SELECT
  'terms',
  'Terms of Service',
  CONCAT(
    '# Terms of Service\n\n',
    'Effective date: ', @terms_effective_date, '\n\n',
    'This is a draft Terms of Service for Jurnapod. ',
    'Please update this content in Backoffice > Static Pages before publishing.\n'
  ),
  'DRAFT',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM static_pages WHERE slug = 'terms'
);
