-- Migration: 0081_recipe_ingredients.sql
-- Generated from: Story 4.4 implementation
-- Table: recipe_ingredients
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci
-- Description: Recipe/BOM composition table for linking ingredients to recipe items

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS `recipe_ingredients` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `recipe_item_id` bigint(20) unsigned NOT NULL,
  `ingredient_item_id` bigint(20) unsigned NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `unit_of_measure` varchar(20) NOT NULL DEFAULT 'unit',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recipe_ingredient` (`company_id`,`recipe_item_id`,`ingredient_item_id`),
  KEY `idx_recipe_ingredients_company_recipe` (`company_id`,`recipe_item_id`),
  KEY `idx_recipe_ingredients_company_ingredient` (`company_id`,`ingredient_item_id`),
  KEY `fk_recipe_ingredients_recipe` (`recipe_item_id`),
  KEY `fk_recipe_ingredients_ingredient` (`ingredient_item_id`),
  CONSTRAINT `fk_recipe_ingredients_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recipe_ingredients_recipe` FOREIGN KEY (`recipe_item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recipe_ingredients_ingredient` FOREIGN KEY (`ingredient_item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_recipe_ingredients_quantity_positive` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;

-- Add audit log action constants
-- Note: These are application-level constants, documented here for reference:
-- RECIPE_INGREDIENT_CREATE - When a new ingredient is added to a recipe
-- RECIPE_INGREDIENT_UPDATE - When an ingredient quantity or unit is modified
-- RECIPE_INGREDIENT_DELETE - When an ingredient is removed from a recipe
