# Troubleshooting Guide

Common issues and solutions for Jurnapod.

---

## Development Issues

### Port Already in Use

**Symptom:** Error when starting dev servers

```bash
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```bash
npm run dev:kill  # Kill processes on dev ports
npm run dev       # Try again
```

---

### Missing Environment Variables

**Symptom:**
```
❌ Missing required environment variables:
   - DB_HOST
   - DB_USER
   - AUTH_JWT_ACCESS_SECRET
```

**Solution:**
```bash
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

---

### API Health Check Hangs

**Symptom:** Dev servers show `[backoffice] Waiting for API health check...` indefinitely

**Possible causes:**
1. MySQL not running
2. Incorrect database credentials
3. Migrations not run
4. API startup error

**Solutions:**

```bash
# 1. Check MySQL is running
mysql -u root -p

# 2. Verify database credentials
npm run db:smoke

# 3. Run migrations
npm run db:migrate

# 4. Check API logs directly
npm run dev:api
```

---

### Build Failures

**Symptom:** `npm run build` fails with TypeScript errors

**Solutions:**

```bash
# Clean and rebuild
npm run clean
npm run build:clean

# Check for type errors
npm run typecheck

# Build specific workspace
npm run build -w @jurnapod/api
```

---

### Tests Hang Indefinitely

**Symptom:** Tests pass but never exit

**Cause:** Database pool not closed

**Solution:** Add cleanup hook to test file:

```typescript
// At end of test file
test.after(async () => {
  await closeDbPool();
});
```

**See:** [AGENTS.md § Test Cleanup](../AGENTS.md#test-cleanup-critical)

---

## Database Issues

### Migration Fails

**Symptom:**
```
Error: Migration lock is held by another process
```

**Solution:**
```sql
-- Connect to database
mysql -u jurnapod_user -p jurnapod

-- Check lock status
SELECT * FROM schema_migrations_lock;

-- Release lock (if needed)
UPDATE schema_migrations_lock SET is_locked = 0;
```

---

### Connection Refused

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solutions:**

```bash
# Check MySQL is running
sudo systemctl status mysql

# Start MySQL
sudo systemctl start mysql

# Verify connection
mysql -u jurnapod_user -p jurnapod
```

---

### JSON Validation Constraint Failed

**Symptom:**
```
CONSTRAINT `chk_company_settings_value_json` failed
```

**Cause:** Invalid JSON being stored in `value_json` column

**Solution:** Ensure all values are JSON-encoded before storage (fixed in v0.2.2+)

---

## POS Issues

### Service Worker Not Updating

**Symptom:** POS shows old version after deployment

**Solutions:**

1. **Hard refresh:** Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. **Clear service worker:**
   - Open DevTools → Application → Service Workers
   - Click "Unregister"
   - Reload page
3. **Update cache version:** Increment version in `apps/pos/public/sw.js`

---

### IndexedDB Quota Exceeded

**Symptom:**
```
QuotaExceededError: The quota has been exceeded
```

**Solutions:**

1. **Clear old data:**
   - Open DevTools → Application → IndexedDB
   - Delete old databases
2. **Increase browser quota** (if needed)
3. **Implement data cleanup** in app code

---

### Offline Sync Not Working

**Symptom:** Transactions created offline never sync

**Debugging:**

1. **Check outbox status:**
   - Open DevTools → Application → IndexedDB → `jurnapod-pos` → `outbox`
   - Check record statuses (PENDING, SENT, FAILED)

2. **Check network connectivity:**
   - Open DevTools → Network tab
   - Try manual sync

3. **Check API health:**
   ```bash
   curl http://localhost:3001/api/health
   ```

4. **Check browser console for errors**

---

## Production Issues

### 502 Bad Gateway

**Symptom:** Nginx returns 502 error

**Possible causes:**
1. API server not running
2. PM2 process crashed
3. Database connection failed

**Solutions:**

```bash
# Check PM2 status
pm2 status

# Check PM2 logs
pm2 logs jurnapod-api

# Restart API
pm2 restart jurnapod-api

# Check database connection
npm run db:smoke
```

---

### CORS Errors

**Symptom:**
```
Access to fetch at 'https://api.yourdomain.com' from origin 'https://pos.yourdomain.com' has been blocked by CORS policy
```

**Solution:** Configure CORS in `.env`:

```bash
CORS_ALLOWED_ORIGINS=https://backoffice.yourdomain.com,https://pos.yourdomain.com
```

**See:** [Production CORS Configuration](production-cors.md)

---

### SSL Certificate Errors

**Symptom:**
```
NET::ERR_CERT_AUTHORITY_INVALID
```

**Solutions:**

```bash
# Renew Let's Encrypt certificates
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

---

### Deployment Failures

**Symptom:** `npm run deploy:pos` fails

**Solutions:**

```bash
# Check build exists
ls -la apps/pos/dist/

# Run build first
npm run build:pos

# Try dry-run to see what would happen
node scripts/deploy.mjs --app=pos --dry-run

# Check logs
cat /var/log/deployment-errors.log
```

---

## Performance Issues

### Slow Database Queries

**Debugging:**

```bash
# Check slow query log
sudo tail -f /var/log/mysql/slow.log

# Check running queries
mysql -u root -p -e "SHOW PROCESSLIST;"

# Analyze query
mysql -u root -p jurnapod -e "EXPLAIN SELECT ..."
```

**Solutions:**
- Add missing indexes
- Optimize query structure
- Add caching layer

---

### High Memory Usage

**Symptom:** API server using excessive memory

**Solutions:**

```bash
# Check PM2 memory usage
pm2 monit

# Restart with memory limit
pm2 restart jurnapod-api --max-memory-restart 500M

# Check for memory leaks
node --inspect apps/api/src/server.ts
```

---

### Slow Frontend Loading

**Symptoms:**
- Lighthouse score < 90
- Long initial load time

**Solutions:**

1. **Check bundle size:**
   ```bash
   npm run build:pos
   ls -lh apps/pos/dist/assets/
   ```

2. **Optimize images:**
   - Use WebP format
   - Compress images
   - Lazy load images

3. **Enable Nginx compression:**
   ```nginx
   gzip on;
   gzip_types text/css application/javascript application/json;
   ```

4. **Use CDN for static assets**

---

## Getting Help

### Before Asking for Help

1. Check this troubleshooting guide
2. Check [Development Guide](DEVELOPMENT.md)
3. Review error messages carefully
4. Try clean rebuild: `npm run clean && npm run build:clean`
5. Check Git history for recent changes

### What to Include

When reporting issues, include:
- Error message (full stack trace)
- Steps to reproduce
- Environment (Node version, OS, database version)
- Recent changes (git log)
- Relevant logs

### Resources

- [Development Guide](DEVELOPMENT.md)
- [API Reference](API.md)
- [Architecture](ARCHITECTURE.md)
- [AGENTS.md](../AGENTS.md)

