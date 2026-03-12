# Database Operations

This directory contains scripts for database management, seeding, and maintenance.

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed a new company |
| `npm run db:smoke` | Run smoke tests |
| `npm run db:audit:system-roles` | Audit for duplicate system roles |
| `npm run db:consolidate:system-roles` | Dry-run duplicate system-role consolidation |

## System Role Duplicate Audit

Over time, duplicate system role rows may accumulate due to bugs or historical data issues. This can cause ambiguity in role lookups.

### Running the Audit

```bash
npm run db:audit:system-roles
```

Expected output when healthy:
```
=== System Role Duplicate Audit ===

PASS: No duplicate system roles found.

System roles are unique per code - audit passed.
```

If duplicates are found, the audit will exit with code 1 and show:
- Which role codes have duplicates
- The role IDs involved
- References in `module_roles` and `user_role_assignments`

### Consolidating Duplicates

When duplicates are detected, you can consolidate them using the consolidation tool.

**Dry run first (recommended):**
```bash
npm run db:consolidate:system-roles
```

**Apply changes:**
```bash
npm run db:consolidate:system-roles -- --apply
```

(Equivalent direct path from repo root:)
```bash
node packages/db/scripts/consolidate-system-role-duplicates.mjs
node packages/db/scripts/consolidate-system-role-duplicates.mjs --apply
```

The consolidation tool:
1. Keeps the canonical role (lowest ID)
2. Migrates all `module_roles` references to the canonical role
3. Migrates all `user_role_assignments` references
4. Deletes duplicate role rows

**Warning:** Always run a database backup before applying consolidation in production.

## Migration Guidelines

- All migrations must be idempotent (rerunnable)
- Use `INSERT IGNORE` for additive changes
- Avoid destructive operations unless clearly documented
- Test migrations on a staging environment first
