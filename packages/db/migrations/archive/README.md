# Archived Migration

## File: 0000_version_1.sql

**Archived on:** 2026-03-16
**Reason:** Migration reset - splitting monolithic dump into individual table files

## Summary

This was the original comprehensive database dump containing all 79 tables and views in a single file.

## Migration Split Details

The schema has been split into 80 individual migration files:

- **79 table files:** `0000_` through `0078_`
- **1 views file:** `0079_views.sql`

All files are located in: `packages/db/migrations/`

## Key Changes

1. **Collation:** Changed from `utf8mb4_uca1400_ai_ci` (MariaDB-specific) to `utf8mb4_unicode_ci` (MySQL + MariaDB compatible)
2. **Structure:** One table per file with proper dependency ordering
3. **Compatibility:** Tested on MySQL 8.0+ and MariaDB 11.8+

## New Migration System

Run migrations:
```bash
npm run db:migrate
```

Test compatibility:
```bash
node packages/db/scripts/test-compatibility.mjs
```

Reset database (clean slate):
```bash
node packages/db/scripts/reset-database.mjs
```

## Dependency Order

See `packages/db/scripts/split-migrations.mjs` for the full dependency graph.

## Breaking Change

⚠️ **This is a BREAKING CHANGE.** 

Existing databases must be reset to use the new migration structure. All data will be lost unless manually migrated.
