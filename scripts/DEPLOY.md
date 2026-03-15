# Deployment Scripts

## Overview

The `deploy.mjs` script provides safe, atomic deployment of frontend applications with automatic backup and rollback capabilities.

## Features

- **Validation**: Ensures build directory exists and contains required files (index.html)
- **Atomic deployment**: Uses filesystem operations to minimize downtime
- **Automatic backup**: Creates backup of existing deployment before deploying new version
- **Rollback on failure**: Automatically restores backup if deployment fails
- **Dry-run mode**: Test deployment without making changes
- **Cross-platform**: Uses Node.js built-ins (no shell dependencies)

## Usage

### Basic Deployment

```bash
# Deploy POS application
npm run deploy:pos

# Deploy Backoffice application
npm run deploy:backoffice
```

### Direct Script Usage

```bash
# Deploy with backup (default)
node scripts/deploy.mjs --app=pos

# Deploy without backup
node scripts/deploy.mjs --app=pos --skip-backup

# Dry-run mode (test without making changes)
node scripts/deploy.mjs --app=pos --dry-run
```

## Arguments

- `--app=<name>` (required): Application to deploy (`pos` or `backoffice`)
- `--skip-backup`: Skip backup creation (faster but no rollback)
- `--dry-run`: Show what would be deployed without making changes

## Deployment Process

1. **Validation**: Checks that `apps/<app>/dist` exists and contains `index.html`
2. **Target Setup**: Ensures `public_html/<app>` parent directory exists
3. **Backup**: Renames existing deployment to `public_html/<app>.backup` (if exists)
4. **Deploy**: Copies all files from `apps/<app>/dist` to `public_html/<app>`
5. **Cleanup**: Removes backup directory after successful deployment
6. **Rollback** (on failure): Restores backup if deployment fails

## Safety Features

### Validation Checks

- Build directory exists and is readable
- Build directory is not empty
- `index.html` exists in build
- `index.html` is not empty (size > 0 bytes)

### Atomic Operations

- Backup uses filesystem `rename()` (atomic on same filesystem)
- Deployment copies to target in one operation
- Rollback uses `rename()` to restore backup atomically

### Error Handling

- If deployment fails after backup created, backup is automatically restored
- Clear error messages for each failure scenario
- Exit code 1 on failure for CI/CD integration

## Examples

### Standard Deployment

```bash
$ npm run deploy:pos

Deploying pos...
  Source: /home/ahmad/jurnapod/apps/pos/dist
  Target: /home/ahmad/jurnapod/public_html/pos

1. Validating build directory...
   ✓ Build validation passed

2. Ensuring deployment target...
   ✓ Target directory ready

3. Creating backup...
   ✓ Backup created: /home/ahmad/jurnapod/public_html/pos.backup

4. Deploying files...
   ✓ Deployment complete

5. Cleaning up backup...
   ✓ Backup cleaned up

✓ Successfully deployed pos
```

### First Deployment (No Existing Files)

```bash
$ npm run deploy:pos

Deploying pos...
  Source: /home/ahmad/jurnapod/apps/pos/dist
  Target: /home/ahmad/jurnapod/public_html/pos

1. Validating build directory...
   ✓ Build validation passed

2. Ensuring deployment target...
   ✓ Target directory ready

3. Creating backup...
   ℹ No existing deployment to backup

4. Deploying files...
   ✓ Deployment complete

✓ Successfully deployed pos
```

### Deployment Failure with Rollback

```bash
$ npm run deploy:pos
# (simulated failure during copy)

Deploying pos...
  Source: /home/ahmad/jurnapod/apps/pos/dist
  Target: /home/ahmad/jurnapod/public_html/pos

1. Validating build directory...
   ✓ Build validation passed

2. Ensuring deployment target...
   ✓ Target directory ready

3. Creating backup...
   ✓ Backup created: /home/ahmad/jurnapod/public_html/pos.backup

4. Deploying files...
   ✗ Deployment failed: ENOSPC: no space left on device

Attempting to restore backup...
Restored backup from: /home/ahmad/jurnapod/public_html/pos.backup
✓ Backup restored successfully

ENOSPC: no space left on device
```

### Dry-Run Mode

```bash
$ node scripts/deploy.mjs --app=pos --dry-run

Deploying pos...
  Source: /home/ahmad/jurnapod/apps/pos/dist
  Target: /home/ahmad/jurnapod/public_html/pos
  Mode: DRY RUN

1. Validating build directory...
   ✓ Build validation passed

2. Ensuring deployment target...
   ✓ Target directory ready

3. Creating backup...
[DRY RUN] Would create backup: /home/ahmad/jurnapod/public_html/pos.backup

4. Deploying files...
[DRY RUN] Would copy: /home/ahmad/jurnapod/apps/pos/dist -> /home/ahmad/jurnapod/public_html/pos
   ✓ Deployment complete

✓ Successfully deployed pos
```

## Testing

Run the test suite:

```bash
node --test scripts/tests/deploy.test.mjs
```

## Migration from Old Scripts

### Before (Unsafe)

```json
{
  "scripts": {
    "deploy:pos": "/bin/cp -R apps/pos/dist/* public_html/pos/"
  }
}
```

**Problems:**
- No validation (could deploy empty/broken build)
- No backup (can't rollback on failure)
- Absolute path `/bin/cp` (not portable)
- Shell expansion `*` (behavior varies)
- No error handling
- Non-atomic (users see partial state)

### After (Safe)

```json
{
  "scripts": {
    "deploy:pos": "node scripts/deploy.mjs --app=pos"
  }
}
```

**Benefits:**
- ✓ Validates build before deploying
- ✓ Automatic backup and rollback
- ✓ Cross-platform (pure Node.js)
- ✓ Predictable behavior
- ✓ Clear error messages
- ✓ Atomic operations

## CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Build application
  run: npm run build:pos

- name: Deploy to server
  run: npm run deploy:pos
  
# Exit code 1 on failure automatically fails the workflow
```

## Troubleshooting

### "Build directory does not exist"

Run the build first:
```bash
npm run build:pos
npm run deploy:pos
```

### "Build directory missing index.html"

Check your build configuration. Frontend builds should produce an `index.html` file.

### "Failed to restore backup"

Manual intervention required. Check `public_html/<app>.backup` directory and manually restore if needed:
```bash
rm -rf public_html/pos
mv public_html/pos.backup public_html/pos
```

## Security Considerations

- Script does not require elevated permissions
- Validates input (only accepts predefined app names)
- Does not execute shell commands (no injection risk)
- Preserves file permissions during copy
- Does not follow symlinks (uses `cp` with `recursive: true`)
