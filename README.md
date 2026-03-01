# Jurnapod

From cashier to ledger.

Modular ERP monorepo with Accounting/GL at the center, offline-first POS, and module contracts built on TypeScript + Zod.

## Structure

- `apps/pos`: Vite React PWA for offline-first cashier
- `apps/backoffice`: ERP backoffice and reports
- `apps/api`: API server (Nest-ready)
- `packages/shared`: cross-app contracts (types, Zod schemas)
- `packages/core`: framework-agnostic business logic
- `packages/modules/*`: domain module implementations
- `packages/db`: MySQL 8.0.44 SQL migrations
- `docs/`: ADRs, API contracts, accounting mappings, document templates

## Quick Start

```bash
npm install
npm run build      # Build all packages and apps
npm run typecheck  # Type-check all packages
```

## Development

### Start All Services
```bash
npm run dev        # Start API, Backoffice, and POS in parallel
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

### Service URLs (development defaults)
- **API**: http://localhost:3001
- **Backoffice**: http://localhost:3002
- **POS**: http://localhost:5173

### Frontend Base URLs
Backoffice and POS resolve their API/domain targets from runtime globals (injected on `globalThis`) or env config before falling back to the current origin.

- **Backoffice API** priority: `API_BASE_URL` runtime global, then `VITE_API_BASE_URL`, then `window.location.origin + "/api"`.
- **POS API** priority: `API_BASE_URL` runtime global, then `VITE_API_BASE_URL`, then `window.location.origin`.
- **Backoffice POS link** priority: `__JURNAPOD_POS_BASE_URL__` runtime global, then `VITE_POS_BASE_URL`, then `window.location.origin`.
- **Backoffice dev proxy**: `VITE_API_PROXY_TARGET` (fallbacks to `http://localhost:3001`).

### Troubleshooting

**"Port already in use" error:**
```bash
npm run dev:kill  # Kill processes on dev ports (3001, 3002, 5173)
npm run dev       # Try again
```

**"Missing environment variables" error:**
```bash
cp .env.example .env  # Copy example env file
# Edit .env with your database credentials and secrets
npm run dev
```

**"Waiting for API health check" hangs:**
- Check MySQL is running: `mysql -u root -p`
- Check API logs for startup errors
- Verify `.env` has correct database credentials
- Try starting API alone: `npm run dev:api`

**Services crash immediately:**
- Check Node version: `node --version` (requires v20.x)
- Run migrations: `npm run db:migrate`
- Check database connection: `npm run db:smoke`

### Other Commands
```bash
npm run clean      # Clean all build artifacts
npm run typecheck  # Type-check all packages
npm run lint       # Lint all packages
```

## Auth Secret Utilities

```bash
# Print a new random JWT secret
npm run auth:secret:generate

# Regenerate AUTH_JWT_ACCESS_SECRET in .env
npm run auth:secret:regenerate
```

Optional target file:

```bash
npm run auth:secret:regenerate -- .env.local
```

Both commands append audit entries (without secret values) to `logs/security-events.log`.

Warning: `npm run auth:secret:generate` prints the raw secret to stdout. Do not run it in environments where command output is persisted or shared (for example CI logs, terminal recording tools, or shared shell sessions).

Password hashing policy is controlled by server env (`AUTH_PASSWORD_ALGO_DEFAULT`, `AUTH_PASSWORD_REHASH_ON_LOGIN`, and algorithm cost settings). New hashes default to Argon2id, and legacy bcrypt hashes can be migrated automatically on successful login when rehash-on-login is enabled.

## Architecture Notes

- **Accounting/GL at the center**: All final documents post to `journal_batches` + `journal_lines`.
- **Idempotent sync**: POS uses `client_tx_id` (UUID v4) to prevent duplicate entries.
- **Consistent document status**: `DRAFT -> POSTED -> VOID`, POS: `COMPLETED -> VOID/REFUND`.
- **Multi-company/outlet**: All operational data is bound to `company_id` and `outlet_id`.
- **Database**: MySQL 8.0.44 (InnoDB), monetary values use `DECIMAL(18,2)`.
- **Type safety**: Module contracts use Zod schemas in `packages/shared`.

## Modules

- `platform`: Auth, organization, outlet, audit, numbering, feature flags
- `accounting`: COA, journal posting, reports (GL, P&L, Balance Sheet), ODS/Excel import
- `sales`: Service invoices, payment in, light AR
- `pos`: Offline-first transaction sync, posting rules
- `inventory`: (optional) Stock movements, recipe/BOM
- `purchasing`: (optional) PO, GRN, AP

## Item Types

Jurnapod supports four item types for flexible catalog management:

| Type | Purpose | Examples | Stock Tracking |
|------|---------|----------|----------------|
| **SERVICE** | Non-tangible offerings | Delivery fee, labor, consulting | Never |
| **PRODUCT** | Finished goods sold to customers | Coffee drinks, pastries, retail items | Optional (inventory level 1+) |
| **INGREDIENT** | Raw materials for production | Coffee beans, milk, sugar, cups | Yes (inventory level 1+) |
| **RECIPE** | Bill of Materials / formulas | Latte recipe, cookie recipe | Never (template only) |

**Current behavior (inventory level 0):** All types can be sold via POS and have prices set per outlet. INGREDIENT and RECIPE types will have specialized behavior when inventory module levels 1-2 are enabled.

**See:** [`docs/adr/ADR-0002-item-types-taxonomy.md`](docs/adr/ADR-0002-item-types-taxonomy.md) for detailed documentation.

## Key Endpoints

### Auth
- `POST /api/auth/login` - User authentication

### POS Sync
- `GET /api/sync/pull?outlet_id=...&since_version=...` - Pull master data
- `POST /api/sync/push` - Push POS transactions (idempotent by `client_tx_id`)

### Sales
- `POST /api/sales/invoices` - Create service invoice
- `POST /api/sales/invoices/:id/post` - Post invoice to GL
- `GET /api/sales/invoices/:id/pdf` - Generate PDF invoice

### Reports
- `GET /api/reports/general-ledger` - General ledger report
- `GET /api/reports/trial-balance` - Trial balance
- `GET /api/reports/profit-loss` - Profit & Loss statement
- `GET /api/reports/journals` - Journal entries
- `GET /api/reports/pos-transactions` - POS transaction report

### Accounting
- `POST /api/accounts/imports` - Import ODS/Excel (DA → COA, JRNL/TRNS → journals)

---

## Production Deployment

This guide covers deploying Jurnapod to production with all three applications: API server, POS (PWA), and Backoffice.

### 1. Prerequisites

#### System Requirements
- **Node.js**: v20.x (LTS recommended)
- **npm**: v9.x or higher (comes with Node.js)
- **MySQL**: 8.0.44 or higher
- **Operating System**: Linux (Ubuntu 22.04 LTS recommended) or compatible
- **Memory**: Minimum 2GB RAM (4GB+ recommended for production)
- **Storage**: Minimum 10GB available disk space

#### Required Tools
```bash
# Verify Node.js version
node --version  # Should be v20.x

# Verify npm version
npm --version   # Should be v9.x or higher

# Verify MySQL version
mysql --version # Should be 8.0.44 or higher
```

### 2. Database Setup

#### MySQL Configuration

Create a production-ready MySQL configuration. Add to `/etc/mysql/mysql.conf.d/jurnapod.cnf`:

```ini
[mysqld]
# Character set and collation
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# InnoDB settings (required)
default-storage-engine = InnoDB
innodb_file_per_table = 1
innodb_buffer_pool_size = 1G  # Adjust based on available RAM
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 1  # ACID compliance
innodb_flush_method = O_DIRECT

# Connection settings
max_connections = 200
wait_timeout = 600
interactive_timeout = 600

# Query cache (disabled in MySQL 8.0+, but good to be explicit)
# query_cache_type = 0

# Logging
log_error = /var/log/mysql/error.log
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

# Binary logging for backups and replication
server-id = 1
log_bin = /var/log/mysql/mysql-bin.log
binlog_expire_logs_seconds = 604800  # 7 days
```

Restart MySQL after configuration:
```bash
sudo systemctl restart mysql
```

#### Create Database and User

```bash
# Login to MySQL as root
mysql -u root -p

# In MySQL prompt:
CREATE DATABASE jurnapod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'jurnapod_user'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';

GRANT ALL PRIVILEGES ON jurnapod.* TO 'jurnapod_user'@'localhost';

FLUSH PRIVILEGES;

EXIT;
```

#### Run Migrations

```bash
# From project root
npm run db:migrate
```

This will create all required tables with proper InnoDB engine, indexes, and constraints.

#### Seed Initial Data

```bash
# Seed initial company, outlet, and owner user
npm run db:seed
```

This creates:
- Default company (configured via `JP_COMPANY_CODE` and `JP_COMPANY_NAME`)
- Default outlet (configured via `JP_OUTLET_CODE` and `JP_OUTLET_NAME`)
- Owner user (configured via `JP_OWNER_EMAIL` and `JP_OWNER_PASSWORD`)

**Important**: Change the default owner password immediately after first login.

### 3. Environment Variables

#### Create Production Environment File

Copy the example environment file and customize for production:

```bash
cp .env.example .env.production
```

#### Required Environment Variables

Edit `.env.production` with production values:

```bash
# Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=jurnapod_user
DB_PASSWORD=STRONG_PASSWORD_HERE
DB_NAME=jurnapod
DB_MIGRATE_LOCK_TIMEOUT=60

# Company & Outlet Setup (for initial seed)
JP_COMPANY_CODE=MYCO
JP_COMPANY_NAME=My Company Name
JP_OUTLET_CODE=MAIN
JP_OUTLET_NAME=Main Outlet
JP_OWNER_EMAIL=owner@mycompany.com
JP_OWNER_PASSWORD=ChangeMe123!

# Authentication & Security
AUTH_JWT_ACCESS_SECRET=GENERATE_LONG_RANDOM_SECRET_HERE
AUTH_JWT_ACCESS_TTL_SECONDS=3600
AUTH_JWT_ISSUER=jurnapod-api
AUTH_JWT_AUDIENCE=jurnapod-clients

# Password Hashing (Argon2id recommended for production)
AUTH_PASSWORD_ALGO_DEFAULT=argon2id
AUTH_PASSWORD_REHASH_ON_LOGIN=true
AUTH_BCRYPT_ROUNDS=12
AUTH_ARGON2_MEMORY_KB=65536
AUTH_ARGON2_TIME_COST=3
AUTH_ARGON2_PARALLELISM=1
```

#### Generate Secure JWT Secret

Use the built-in secret generator:

```bash
# Generate and automatically update .env.production
npm run auth:secret:regenerate -- .env.production
```

Or generate manually and copy:

```bash
# Print a new random secret (copy and paste to .env.production)
npm run auth:secret:generate
```

**Security Note**: The secret generator logs audit entries to `logs/security-events.log` without exposing the actual secret value.

#### POS Environment Variables

Create `apps/pos/.env.production`:

```bash
# API endpoint (adjust to your production domain)
VITE_API_URL=https://api.yourdomain.com
```

#### Backoffice Environment Variables

Create `apps/backoffice/.env.production`:

```bash
# API endpoint (adjust to your production domain)
VITE_API_URL=https://api.yourdomain.com
```

### 4. Build Process

#### Install Dependencies

```bash
# From project root
npm install --production=false
```

#### Build All Applications

```bash
# Clean previous builds
npm run clean

# Build all packages and apps
npm run build
```

This will:
1. Build shared packages (`@jurnapod/shared`, `@jurnapod/core`, `@jurnapod/modules/*`)
2. Build API server (Next.js production build)
3. Build POS PWA (Vite production build with service worker)
4. Build Backoffice (Vite production build)

#### Verify Build Output

```bash
# Check build artifacts
ls -la apps/api/.next/
ls -la apps/pos/dist/
ls -la apps/backoffice/dist/
```

### 5. Deployment Options

#### Option A: Manual Deployment with PM2 (Recommended)

PM2 is a production process manager for Node.js applications.

**Install PM2:**
```bash
npm install -g pm2
```

**Create PM2 Ecosystem File** (`ecosystem.config.cjs`):

```javascript
module.exports = {
  apps: [
    {
      name: 'jurnapod-api',
      cwd: './apps/api',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      instances: 2,  // Adjust based on CPU cores
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      error_file: '../../logs/api-error.log',
      out_file: '../../logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
```

**Start API Server:**
```bash
# Load environment variables
export $(cat .env.production | xargs)

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

**PM2 Management Commands:**
```bash
# View status
pm2 status

# View logs
pm2 logs jurnapod-api

# Restart
pm2 restart jurnapod-api

# Stop
pm2 stop jurnapod-api

# Monitor
pm2 monit
```

#### Option B: Systemd Service

Create `/etc/systemd/system/jurnapod-api.service`:

```ini
[Unit]
Description=Jurnapod API Server
After=network.target mysql.service

[Service]
Type=simple
User=jurnapod
WorkingDirectory=/opt/jurnapod/apps/api
EnvironmentFile=/opt/jurnapod/.env.production
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jurnapod-api

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable jurnapod-api
sudo systemctl start jurnapod-api
sudo systemctl status jurnapod-api
```

### 6. Reverse Proxy Setup

#### Nginx Configuration

Install Nginx:
```bash
sudo apt update
sudo apt install nginx
```

Create `/etc/nginx/sites-available/jurnapod`:

```nginx
# API Server
server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL Configuration (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy to API server
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;

    # Client body size (for file uploads)
    client_max_body_size 10M;
}

# POS PWA
server {
    listen 80;
    server_name pos.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pos.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pos.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pos.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /opt/jurnapod/apps/pos/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # PWA-specific headers
    add_header Service-Worker-Allowed "/" always;
    
    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service worker (no cache)
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Manifest
    location = /manifest.webmanifest {
        add_header Cache-Control "public, max-age=3600";
        add_header Content-Type "application/manifest+json";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Backoffice
server {
    listen 80;
    server_name backoffice.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name backoffice.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/backoffice.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/backoffice.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /opt/jurnapod/apps/backoffice/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Enable site and restart Nginx:**
```bash
sudo ln -s /etc/nginx/sites-available/jurnapod /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### SSL/HTTPS with Let's Encrypt

Install Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
```

Obtain SSL certificates:
```bash
sudo certbot --nginx -d api.yourdomain.com
sudo certbot --nginx -d pos.yourdomain.com
sudo certbot --nginx -d backoffice.yourdomain.com
```

Certbot will automatically:
- Obtain certificates
- Update Nginx configuration
- Set up auto-renewal

Verify auto-renewal:
```bash
sudo certbot renew --dry-run
```

### 7. POS PWA Deployment

The POS application is built as a Progressive Web App (PWA) with offline-first capabilities.

#### Service Worker Configuration

The service worker (`apps/pos/public/sw.js`) is pre-configured with:
- **Cache-first strategy** for app shell and static assets
- **Network-first with offline fallback** for navigation
- **Automatic precaching** of build assets from `index.html`
- **Cache versioning** (`APP_SHELL_CACHE = "jurnapod-pos-app-shell-v5"`)

#### Update Service Worker Version

When deploying updates, increment the cache version in `apps/pos/public/sw.js`:

```javascript
const APP_SHELL_CACHE = "jurnapod-pos-app-shell-v6";  // Increment version
```

This ensures clients fetch fresh assets after deployment.

#### PWA Manifest

The manifest (`apps/pos/public/manifest.webmanifest`) is configured with:
- App name: "Jurnapod POS"
- Display mode: `standalone` (full-screen app experience)
- Icons: 192x192 and 512x512 PNG
- Screenshots for app stores

#### Verify PWA Installation

After deployment, test PWA functionality:

1. **Open POS in Chrome/Edge**: `https://pos.yourdomain.com`
2. **Check DevTools > Application**:
   - Service Worker should be registered and active
   - Manifest should load without errors
   - Cache Storage should show `jurnapod-pos-app-shell-v*`
3. **Test offline mode**:
   - Open DevTools > Network
   - Check "Offline"
   - Reload page - should load from cache
4. **Test installation**:
   - Browser should show "Install" prompt
   - Install and verify app works standalone

#### IndexedDB Sync Strategy

The POS uses IndexedDB (via Dexie) for offline storage:
- **Transactions**: Stored locally with `client_tx_id` (UUID v4)
- **Sync queue**: Outbox pattern (`PENDING -> SENT -> FAILED`)
- **Master data cache**: Items, prices, tax config per outlet

No additional configuration needed - handled by application code.

### 8. Post-Deployment

#### Health Checks

Create a health check endpoint monitoring script:

```bash
#!/bin/bash
# health-check.sh

API_URL="https://api.yourdomain.com/api/health"
POS_URL="https://pos.yourdomain.com"
BACKOFFICE_URL="https://backoffice.yourdomain.com"

echo "Checking API health..."
curl -f $API_URL || echo "API health check failed"

echo "Checking POS availability..."
curl -f $POS_URL || echo "POS health check failed"

echo "Checking Backoffice availability..."
curl -f $BACKOFFICE_URL || echo "Backoffice health check failed"

echo "Checking MySQL connection..."
mysql -u jurnapod_user -p$DB_PASSWORD -e "SELECT 1" jurnapod || echo "MySQL check failed"
```

Run periodically via cron:
```bash
# Add to crontab
*/5 * * * * /opt/jurnapod/scripts/health-check.sh >> /var/log/jurnapod-health.log 2>&1
```

#### Monitoring Recommendations

**Application Monitoring:**
- **PM2 Monitoring**: `pm2 monit` for real-time process monitoring
- **Log aggregation**: Use tools like Loki, ELK stack, or Graylog
- **APM**: Consider New Relic, Datadog, or open-source alternatives (Prometheus + Grafana)

**Database Monitoring:**
```bash
# Monitor slow queries
sudo tail -f /var/log/mysql/slow.log

# Monitor connections
mysql -u root -p -e "SHOW PROCESSLIST;"

# Monitor InnoDB status
mysql -u root -p -e "SHOW ENGINE INNODB STATUS\G"
```

**Disk Space Monitoring:**
```bash
# Check disk usage
df -h

# Monitor log file sizes
du -sh /var/log/mysql/*
du -sh /opt/jurnapod/logs/*
```

#### Backup Strategy

**Database Backups:**

Create automated backup script (`/opt/jurnapod/scripts/backup-db.sh`):

```bash
#!/bin/bash
BACKUP_DIR="/opt/jurnapod/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/jurnapod_$DATE.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Dump database with compression
mysqldump -u jurnapod_user -p$DB_PASSWORD \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  jurnapod | gzip > $BACKUP_FILE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "jurnapod_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

Schedule daily backups:
```bash
# Add to crontab
0 2 * * * /opt/jurnapod/scripts/backup-db.sh >> /var/log/jurnapod-backup.log 2>&1
```

**Application Backups:**
```bash
# Backup uploaded files, logs, and configuration
tar -czf /opt/jurnapod/backups/app_$(date +%Y%m%d).tar.gz \
  /opt/jurnapod/.env.production \
  /opt/jurnapod/logs \
  /opt/jurnapod/uploads
```

**Off-site Backups:**
- Use `rsync` to copy backups to remote server
- Use cloud storage (AWS S3, Google Cloud Storage, etc.)
- Verify backup integrity regularly

#### Log Management

**Log Rotation:**

Create `/etc/logrotate.d/jurnapod`:

```
/opt/jurnapod/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 jurnapod jurnapod
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

**Centralized Logging:**
- Configure PM2 to send logs to syslog
- Use log aggregation tools (Loki, ELK, Graylog)
- Set up alerts for error patterns

### 9. Security Considerations

#### Secrets Management

**Environment Variables:**
- Store `.env.production` with restricted permissions:
  ```bash
  chmod 600 /opt/jurnapod/.env.production
  chown jurnapod:jurnapod /opt/jurnapod/.env.production
  ```
- Never commit `.env.production` to version control
- Use environment variable management tools (Vault, AWS Secrets Manager, etc.) for enterprise deployments

**JWT Secret Rotation:**
```bash
# Generate new secret
npm run auth:secret:regenerate -- .env.production

# Restart API server
pm2 restart jurnapod-api
```

**Note**: Rotating JWT secret will invalidate all existing tokens. Users will need to re-authenticate.

#### Database Security

**User Privileges:**
```sql
-- Create read-only user for reporting
CREATE USER 'jurnapod_readonly'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT SELECT ON jurnapod.* TO 'jurnapod_readonly'@'localhost';
FLUSH PRIVILEGES;
```

**Connection Security:**
- Use `localhost` for database connections when API and MySQL are on same server
- For remote connections, use SSL/TLS:
  ```bash
  # In .env.production
  DB_SSL=true
  DB_SSL_CA=/path/to/ca-cert.pem
  ```

**Regular Updates:**
```bash
# Keep MySQL updated
sudo apt update
sudo apt upgrade mysql-server
```

#### CORS Configuration

The API server should have CORS configured for production domains only.

In `apps/api/src/middleware/cors.ts` (or equivalent):

```typescript
const allowedOrigins = [
  'https://pos.yourdomain.com',
  'https://backoffice.yourdomain.com'
];

// Configure CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

#### Rate Limiting

**Nginx Rate Limiting** (already configured in nginx config above):
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req zone=api_limit burst=20 nodelay;
```

**Application-Level Rate Limiting:**

Consider adding rate limiting middleware to API routes:

```typescript
// Example with express-rate-limit
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later'
});

app.post('/api/auth/login', authLimiter, loginHandler);
```

#### Security Headers

Already configured in Nginx, but verify:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

#### Firewall Configuration

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to API port (only allow via Nginx)
sudo ufw deny 3001/tcp

# Enable firewall
sudo ufw enable
```

#### Regular Security Audits

```bash
# Check for npm vulnerabilities
npm audit

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

### CORS Configuration (Production)

When deploying to production with separate domains/subdomains, you need to configure CORS.

**Quick Setup:**

Add to production `.env`:
```bash
CORS_ALLOWED_ORIGINS=https://backoffice.yourdomain.com,https://pos.yourdomain.com
```

**Deployment Strategies:**

1. **Same Domain (Recommended - No CORS needed)**
   - Use reverse proxy (Nginx/Caddy)
   - Serve all services under one domain with different paths
   - Example: `example.com/api`, `example.com/backoffice`, `example.com/pos`

2. **Subdomains (CORS required)**
   - `api.example.com`, `backoffice.example.com`, `pos.example.com`
   - Set `CORS_ALLOWED_ORIGINS` as shown above

3. **Different Domains (CORS required)**
   - Configure as needed for your domain structure

**Development:**
- CORS is automatically configured for `localhost:3002` and `localhost:5173`
- No configuration needed

**For detailed instructions**, see [`docs/production-cors.md`](docs/production-cors.md)

---

## Troubleshooting

### API Server Won't Start

**Check logs:**
```bash
pm2 logs jurnapod-api
# or
sudo journalctl -u jurnapod-api -f
```

**Common issues:**
- Database connection failed: Verify `DB_*` environment variables
- Port already in use: Check if another process is using port 3001
- Missing dependencies: Run `npm install` in `apps/api`

### POS Not Loading Offline

**Check service worker:**
1. Open DevTools > Application > Service Workers
2. Verify service worker is registered and active
3. Check for errors in Console

**Clear cache and re-register:**
1. DevTools > Application > Storage > Clear site data
2. Reload page
3. Service worker should re-register and cache assets

### Database Migration Fails

**Check migration lock:**
```sql
SELECT * FROM schema_migrations_lock;
-- If locked, release manually:
UPDATE schema_migrations_lock SET is_locked = 0;
```

**Run migration with verbose logging:**
```bash
DB_MIGRATE_LOCK_TIMEOUT=120 npm run db:migrate
```

### Sync Failures (POS to API)

**Check network connectivity:**
```bash
curl -v https://api.yourdomain.com/api/sync/pull?outlet_id=1
```

**Check API logs for errors:**
```bash
pm2 logs jurnapod-api | grep sync
```

**Common issues:**
- Invalid `client_tx_id`: Ensure UUID v4 format
- Duplicate transaction: Check if transaction already exists (idempotent sync should handle this)
- Outlet access denied: Verify user has access to outlet

---

## Performance Optimization

### Database Indexing

Verify critical indexes exist:
```sql
-- Check indexes on journal_lines
SHOW INDEX FROM journal_lines;

-- Should have indexes on:
-- (company_id, date)
-- (account_id, date)
-- (outlet_id, date)
```

### API Caching

Consider implementing caching for:
- Master data (items, prices, tax config)
- Reports (with TTL)
- User sessions (Redis recommended)

### CDN for Static Assets

For POS and Backoffice, consider using a CDN:
- CloudFlare
- AWS CloudFront
- Fastly

Update `VITE_API_URL` to use CDN domain.

### Database Connection Pooling

Ensure connection pooling is configured in API server:

```typescript
// Example with mysql2
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

---

## Scaling Considerations

### Horizontal Scaling (Multiple API Instances)

When using PM2 cluster mode or multiple servers:

**Session Management:**
- Use Redis for session storage (instead of in-memory)
- Share JWT secret across all instances

**Database Connection Limits:**
- Adjust `max_connections` in MySQL config
- Configure connection pool size per instance

**Load Balancer:**
- Use Nginx upstream for load balancing
- Enable sticky sessions if needed

### Database Replication

For high availability:
- Set up MySQL master-slave replication
- Route read queries to slaves
- Route write queries to master

### Monitoring at Scale

- Use APM tools (New Relic, Datadog)
- Set up alerts for:
  - High CPU/memory usage
  - Slow database queries
  - API error rates
  - Disk space warnings

---

For more information, see:
- [AGENTS.md](./AGENTS.md) - Architecture and development guidelines
- [docs/](./docs/) - API contracts, ADR, and technical documentation
