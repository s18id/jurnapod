# Development Guide

Complete guide for developing Jurnapod locally.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Starting Services](#starting-services)
- [Port Configuration](#port-configuration)
- [Frontend Configuration](#frontend-configuration)
- [Database Operations](#database-operations)
- [Build & Test](#build--test)
- [Auth Secrets](#auth-secrets)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: v22.x
- **npm**: v9.x or higher
- **MySQL**: 8.0.44+ or MariaDB
- **Git**: For version control

### Verify Installation

```bash
node --version  # Should be v22.x
npm --version   # Should be v9.x+
mysql --version # Should be 8.0.44+
```

---

## Initial Setup

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd jurnapod

# Install dependencies
npm install
```

### 2. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env  # or your preferred editor
```

**Required environment variables:**
```bash
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=jurnapod_user
DB_PASSWORD=your_password_here
DB_NAME=jurnapod

# Auth
AUTH_JWT_ACCESS_SECRET=your_jwt_secret_here  # Generate with: npm run auth:secret:generate
AUTH_JWT_REFRESH_SECRET=your_refresh_secret_here

# Company & Outlet (for initial seed)
JP_COMPANY_CODE=JP
JP_COMPANY_NAME=Jurnapod Demo
JP_OUTLET_CODE=MAIN
JP_OUTLET_NAME=Main Outlet
JP_OWNER_EMAIL=owner@example.com
JP_OWNER_PASSWORD=ChangeMe123!
```

### 3. Database Setup

```bash
# Run migrations
npm run db:migrate

# Seed initial data (company, outlet, owner user)
npm run db:seed

# Verify connection
npm run db:smoke
```

### 4. Build Packages

```bash
# Build all packages and apps
npm run build

# Or clean build from scratch
npm run build:clean
```

---

## Starting Services

### Start All Services (Recommended)

```bash
npm run dev
```

This will:
- ✅ Validate required environment variables
- 🚀 Start all three services in parallel with colored output
- ⏳ Wait for API health check before starting frontends
- 🔄 Auto-restart services up to 3 times on failure (with 5s delay)
- 📊 Show labeled logs: `[api]`, `[backoffice]`, `[pos]`

### Start Specific Combinations

```bash
npm run dev:api+backoffice  # API + Backoffice only
npm run dev:api+pos         # API + POS only
```

### Start Individual Services

```bash
npm run dev:api         # API only (port 3001)
npm run dev:backoffice  # Backoffice only (port 3002)
npm run dev:pos         # POS only (port 5173)
```

### Service Management

```bash
npm run dev:stop     # Kill all dev servers
npm run dev:restart  # Stop and restart all services
npm run dev:kill     # Force kill processes on dev ports
npm run dev:check    # Validate environment variables only
```

### Service URLs

| Service | Default URL |
|---------|-------------|
| **API** | http://localhost:3001 |
| **Backoffice** | http://localhost:3002 |
| **POS** | http://localhost:5173 |

---

## Port Configuration

All dev server ports are configurable via environment variables in `.env`:

```bash
# API Server
PORT=3001           # or API_PORT (default: 3001)
HOST=0.0.0.0        # Bind address (default: 0.0.0.0)
                    # 0.0.0.0 = all interfaces
                    # 127.0.0.1 = localhost only

# Frontend Dev Servers
BACKOFFICE_PORT=3002  # default: 3002
POS_PORT=5173         # default: 5173
```

### Network Access

- **`HOST=0.0.0.0`**: Allows access from other devices on your network (useful for mobile testing)
- **`HOST=127.0.0.1`**: Restricts access to localhost only (more secure)

**Note:** The dev startup script automatically translates `0.0.0.0` to `127.0.0.1` for API health checks.

### Example: Custom Ports

```bash
# .env
PORT=8001
BACKOFFICE_PORT=8002
POS_PORT=8173
HOST=0.0.0.0
```

---

## Frontend Configuration

Backoffice and POS resolve their API/domain targets from runtime globals (injected on `globalThis`) or env config before falling back to the current origin.

### API Base URL Priority

**Backoffice:**
1. `API_BASE_URL` runtime global
2. `VITE_API_BASE_URL` env variable
3. `window.location.origin + "/api"` (fallback)

**POS:**
1. `API_BASE_URL` runtime global
2. `VITE_API_BASE_URL` env variable
3. `window.location.origin` (fallback)

### Other Frontend Config

- **Backoffice POS link**: `__JURNAPOD_POS_BASE_URL__` → `VITE_POS_BASE_URL` → `window.location.origin`
- **Backoffice dev proxy**: `VITE_API_PROXY_TARGET` (default: `http://localhost:3001`)

### Example: Development Frontend Config

```bash
# .env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_POS_BASE_URL=http://localhost:5173
VITE_API_PROXY_TARGET=http://localhost:3001
```

---

## Database Operations

### Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Run migrations for specific workspace
npm run db:migrate -w @jurnapod/db
```

### Seeding

```bash
# Seed initial company, outlet, and owner user
npm run db:seed

# Seed test accounts
npm run db:seed:test-accounts
```

### Utilities

```bash
# Verify database connection
npm run db:smoke

# Backfill POS journals (requires arguments)
npm run db:backfill:pos-journals -- --company-id=1 --outlet-id=1

# Reconcile POS journals
npm run db:reconcile:pos-journals -- --company-id=1

# Audit system roles
npm run db:audit:system-roles

# Consolidate system roles
npm run db:consolidate:system-roles
```

---

## Build & Test

### Build Commands

```bash
# Incremental build (default, faster)
npm run build

# Clean build from scratch
npm run build:clean

# Build specific app
npm run build:pos
npm run build:api
npm run build:backoffice

# Clean all build artifacts
npm run clean
```

### Type Checking

```bash
# Type-check all workspaces
npm run typecheck

# Type-check specific workspace
npm run typecheck -w @jurnapod/api
```

### Linting

```bash
# Lint all workspaces
npm run lint

# Lint specific workspace
npm run lint -w @jurnapod/pos
```

### Testing

```bash
# Run all tests
npm run test

# Run API unit tests
npm run test:unit -w @jurnapod/api

# Run API integration tests
npm run test:integration -w @jurnapod/api

# Run POS tests
npm run test -w @jurnapod/pos

# Run script tests
npm run test:scripts
```

---

## Auth Secrets

### Generate New Secrets

```bash
# Print a new random JWT secret (WARNING: outputs to stdout)
npm run auth:secret:generate

# Generate and save to .env
npm run auth:secret:regenerate

# Generate and save to custom file
npm run auth:secret:regenerate -- .env.local

# Refresh token secret
npm run auth:refresh-secret:generate
npm run auth:refresh-secret:regenerate
```

**Security Note:** `npm run auth:secret:generate` prints the raw secret to stdout. Do not run in environments where command output is persisted (CI logs, terminal recording, shared sessions).

### Platform Encryption

```bash
# Generate platform settings encryption key
npm run platform:encryption-key:generate
npm run platform:encryption-key:regenerate
```

### Cron Email Secret

```bash
# Generate cron email secret (for protecting cron endpoints)
npm run cron:email-secret:generate
npm run cron:email-secret:regenerate
```

### Audit Logging

All secret operations append audit entries (with values redacted) to `logs/security-events.log`.

### Password Hashing

Password hashing is controlled by server environment variables:

```bash
# .env
AUTH_PASSWORD_ALGO_DEFAULT=argon2id  # or bcrypt
AUTH_PASSWORD_REHASH_ON_LOGIN=true   # Auto-migrate legacy bcrypt to argon2id
AUTH_BCRYPT_ROUNDS=12
AUTH_ARGON2_MEMORY_KB=65536
AUTH_ARGON2_TIME_COST=3
AUTH_ARGON2_PARALLELISM=1
```

**Default:** New passwords use Argon2id. Legacy bcrypt hashes auto-migrate on successful login when `AUTH_PASSWORD_REHASH_ON_LOGIN=true`.

---

## Troubleshooting

### "Port already in use" error

```bash
npm run dev:kill  # Kill processes on dev ports (3001, 3002, 5173)
npm run dev       # Try again
```

### "Missing environment variables" error

```bash
cp .env.example .env  # Copy example env file
# Edit .env with your database credentials and secrets
npm run dev
```

### "Waiting for API health check" hangs

**Possible causes:**
- MySQL not running
- Incorrect database credentials
- API startup errors

**Solutions:**
```bash
# Check MySQL is running
mysql -u root -p

# Check API logs for startup errors
npm run dev:api

# Verify .env has correct database credentials
npm run db:smoke

# Check if migrations are needed
npm run db:migrate
```

### Services crash immediately

**Check Node version:**
```bash
node --version  # Should be v22.x
```

**Run migrations:**
```bash
npm run db:migrate
```

**Check database connection:**
```bash
npm run db:smoke
```

### Build failures

**Clean and rebuild:**
```bash
npm run clean
npm run build:clean
```

**Check for TypeScript errors:**
```bash
npm run typecheck
```

### Test failures

**Database not migrated:**
```bash
npm run db:migrate
npm run db:seed
```

**Database pool not closing (tests hang):**

All unit tests using `getDbPool()` must close the pool after completion:

```typescript
// At end of test file
test.after(async () => {
  await closeDbPool();
});
```

See: [AGENTS.md § Test cleanup](../AGENTS.md#test-cleanup-critical)

### CORS errors in development

**Symptom:** Frontend can't reach API due to CORS

**Solution:** CORS is auto-configured for localhost in development. Check:

1. API is running on expected port
2. Frontend is using correct API URL
3. Check browser console for actual error

**Development CORS origins (automatic):**
- `http://localhost:3002` (backoffice)
- `http://localhost:5173` (pos)
- `http://127.0.0.1:3002`
- `http://127.0.0.1:5173`

---

## Additional Resources

- [Production Deployment](PRODUCTION.md)
- [API Reference](API.md)
- [Architecture](ARCHITECTURE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [AGENTS.md](../AGENTS.md) - Development guidelines and invariants
