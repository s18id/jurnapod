<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Production Deployment

Complete guide for deploying Jurnapod in production.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Server Setup](#server-setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Build](#build)
- [Deploying Frontend Apps](#deploying-frontend-apps)
- [Running the API](#running-the-api)
- [Nginx Configuration](#nginx-configuration)
- [Post-Deployment Checks](#post-deployment-checks)
- [Rollback](#rollback)
- [Secrets Management](#secrets-management)

---

## Prerequisites

### Server Requirements

- **OS**: Linux (Ubuntu 22.04+ recommended)
- **Node.js**: v20.x LTS
- **npm**: v9.x or higher
- **MySQL**: 8.0.44+ or MariaDB (InnoDB required)
- **Nginx**: 1.18+ (reverse proxy + static files)
- **RAM**: 2 GB minimum (4 GB recommended)
- **Disk**: 10 GB minimum

### Verify Node.js

```bash
node --version  # Must be v20.x
npm --version   # Must be v9.x+
```

---

## Server Setup

### 1. Clone Repository

```bash
git clone <repository-url> /var/www/jurnapod
cd /var/www/jurnapod
npm install --omit=dev
```

### 2. Create Deployment Directories

The deploy script writes to `public_html/`:

```bash
mkdir -p /var/www/jurnapod/public_html/pos
mkdir -p /var/www/jurnapod/public_html/backoffice
```

---

## Environment Configuration

Copy the example file and configure for production:

```bash
cp .env.example .env
```

### Required Variables

```bash
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=jurnapod_prod
DB_PASSWORD=<strong-password>
DB_NAME=jurnapod
DB_COLLATION=utf8mb4_uca1400_ai_ci

# API Server
PORT=3001
HOST=127.0.0.1   # Bind to localhost; Nginx proxies from outside

# Auth — generate with: npm run auth:secret:generate
AUTH_JWT_ACCESS_SECRET=<long-random-secret>
AUTH_JWT_ACCESS_TTL_SECONDS=3600
AUTH_REFRESH_SECRET=<long-random-secret>
AUTH_REFRESH_TTL_SECONDS=2592000
AUTH_JWT_ISSUER=jurnapod-api
AUTH_JWT_AUDIENCE=jurnapod-clients
AUTH_PASSWORD_ALGO_DEFAULT=argon2id
AUTH_PASSWORD_REHASH_ON_LOGIN=true

# Cross-site cookie (set true if API and frontends are on different subdomains)
AUTH_REFRESH_COOKIE_CROSS_SITE=false

# CORS — comma-separated list of frontend origins
CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com

# Frontend URLs (injected into static builds via Vite)
VITE_API_BASE_URL=https://api.example.com/api
VITE_POS_BASE_URL=https://pos.example.com

# App public URL (used in email links)
APP_PUBLIC_URL=https://api.example.com

# Platform encryption (generate with: openssl rand -hex 32)
PLATFORM_SETTINGS_ENCRYPTION_KEY=<hex-key>

# Cron secret (generate with: openssl rand -hex 32)
CRON_EMAIL_OUTBOX_SECRET=<hex-secret>

# Mailer (set to smtp for production email)
MAILER_DRIVER=smtp
MAILER_FROM_NAME=Jurnapod
MAILER_FROM_EMAIL=noreply@example.com
MAILER_SMTP_HOST=mail.example.com
MAILER_SMTP_PORT=587
MAILER_SMTP_USER=noreply@example.com
MAILER_SMTP_PASS=<smtp-password>
MAILER_SMTP_SECURE=false

# Disable HTTP request logging in production
JP_HTTP_LOG=0
```

### Optional: Google SSO

```bash
GOOGLE_OAUTH_CLIENT_ID=<client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<client-secret>
GOOGLE_OAUTH_REDIRECT_URIS=https://api.example.com/api/auth/google/callback
VITE_GOOGLE_OAUTH_CLIENT_ID=<client-id>
```

---

## Database Setup

### 1. Create Database and User

```sql
CREATE DATABASE jurnapod CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
CREATE USER 'jurnapod_prod'@'127.0.0.1' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON jurnapod.* TO 'jurnapod_prod'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 2. Run Migrations

```bash
npm run db:migrate
```

### 3. Seed Initial Data

Run once on first deployment to create the initial company, outlet, and owner user:

```bash
npm run db:seed
```

**After seeding**, log in as the owner and change the password immediately.

### 4. Verify Connection

```bash
npm run db:smoke
```

---

## Build

Build all packages and apps from the repo root:

```bash
npm run build
```

For a clean build (removes all previous artifacts):

```bash
npm run build:clean
```

### Build Individual Apps

```bash
npm run build:api         # API server
npm run build:pos         # POS PWA
npm run build:backoffice  # Backoffice SPA
```

---

## Deploying Frontend Apps

The `deploy.mjs` script validates the build, creates a backup of the existing deployment, copies files atomically, and rolls back automatically on failure.

```bash
# Deploy POS
npm run deploy:pos

# Deploy Backoffice
npm run deploy:backoffice
```

### Full Build + Deploy (Recommended)

```bash
npm run build:pos && npm run deploy:pos
npm run build:backoffice && npm run deploy:backoffice
```

### Dry Run (Test Without Changes)

```bash
node scripts/deploy.mjs --app=pos --dry-run
node scripts/deploy.mjs --app=backoffice --dry-run
```

Deployed files land in:
- `public_html/pos/` — POS PWA static files
- `public_html/backoffice/` — Backoffice SPA static files

---

## Running the API

### Using a Process Manager (PM2)

Install PM2 globally:

```bash
npm install -g pm2
```

Start the API:

```bash
pm2 start npm --name jurnapod-api -- run start:api
pm2 save
pm2 startup  # Configure to start on system boot
```

### Manual Start

```bash
npm run start:api
```

The API listens on `HOST:PORT` (default `127.0.0.1:3001`).

---

## Nginx Configuration

Nginx serves static files for POS and Backoffice and proxies `/api` requests to the Node.js API.

```nginx
# /etc/nginx/sites-available/jurnapod

server {
    listen 80;
    server_name api.example.com pos.example.com backoffice.example.com;
    return 301 https://$host$request_uri;
}

# API
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for future use)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# POS PWA
server {
    listen 443 ssl;
    server_name pos.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    root /var/www/jurnapod/public_html/pos;
    index index.html;

    # Cache hashed assets aggressively
    location ~* \.(js|css|woff2?|png|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Backoffice SPA
server {
    listen 443 ssl;
    server_name backoffice.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    root /var/www/jurnapod/public_html/backoffice;
    index index.html;

    location ~* \.(js|css|woff2?|png|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/jurnapod /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## Post-Deployment Checks

### 1. API Health

```bash
curl https://api.example.com/api/health
# Expected: {"status":"ok"}
```

### 2. Database Smoke Test

```bash
npm run db:smoke
```

### 3. Check API Process

```bash
pm2 status
pm2 logs jurnapod-api --lines 50
```

### 4. Verify Frontend Loads

Open in browser:
- `https://pos.example.com` — POS PWA
- `https://backoffice.example.com` — Backoffice

### 5. Verify Service Worker (POS)

In Chrome DevTools → Application → Service Workers — the POS service worker should be registered and active.

---

## Rollback

### Frontend Rollback

The deploy script creates a `.backup` directory automatically. To manually restore:

```bash
# Restore POS
rm -rf public_html/pos
mv public_html/pos.backup public_html/pos

# Restore Backoffice
rm -rf public_html/backoffice
mv public_html/backoffice.backup public_html/backoffice
```

### API Rollback

```bash
git checkout <previous-tag-or-commit>
npm install
npm run build:api
pm2 restart jurnapod-api
```

### Database Rollback

Migrations are not automatically reversible. Before deploying schema changes, take a database backup:

```bash
mysqldump -u jurnapod_prod -p jurnapod > backup-$(date +%Y%m%d-%H%M%S).sql
```

---

## Secrets Management

### Generate All Secrets

```bash
# JWT access secret
npm run auth:secret:generate

# Refresh token secret
npm run auth:refresh-secret:generate

# Platform encryption key
npm run platform:encryption-key:generate

# Cron email secret
npm run cron:email-secret:generate

# Or use openssl directly
openssl rand -hex 32
```

### Rotate JWT Secret

Rotating the JWT access secret immediately invalidates all active sessions:

```bash
npm run auth:secret:regenerate        # Writes to .env
pm2 restart jurnapod-api              # Apply new secret
```

All secret operations are logged (values redacted) to `logs/security-events.log`.

---

## Additional Resources

- [Development Guide](DEVELOPMENT.md)
- [Architecture](ARCHITECTURE.md)
- [API Reference](API.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Deploy Script Reference](../scripts/DEPLOY.md)
