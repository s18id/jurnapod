-- Migration: 0021_static_pages.sql
-- Generated from: 0000_version_1.sql
-- Table: static_pages
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `static_pages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(128) NOT NULL,
  `title` varchar(191) NOT NULL,
  `content_md` mediumtext NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `published_at` datetime DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `meta_json` longtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_static_pages_slug` (`slug`),
  KEY `idx_static_pages_status` (`status`),
  KEY `fk_static_pages_created_by_user` (`created_by_user_id`),
  KEY `fk_static_pages_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_static_pages_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_static_pages_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_static_pages_status` CHECK (`status` in ('DRAFT','PUBLISHED')),
  CONSTRAINT `chk_static_pages_meta_json` CHECK (`meta_json` is null or json_valid(`meta_json`))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
