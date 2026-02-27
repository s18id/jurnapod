# Production CORS Configuration Guide

This document explains how to configure CORS (Cross-Origin Resource Sharing) for Jurnapod in production environments.

## Overview

Jurnapod consists of three services:
- **API** (Next.js) - Backend server
- **Backoffice** (Vite React) - Admin interface
- **POS** (Vite React PWA) - Point of sale interface

In development, these run on different ports (3001, 3002, 5173), requiring CORS headers. In production, you have several deployment options.

---

## Deployment Strategies

### Strategy 1: Same Domain with Reverse Proxy (RECOMMENDED)

**Architecture:**
```
                        ┌─────────────┐
                        │   Domain    │
                        │ example.com │
                        └──────┬──────┘
                               │
                    ┌──────────┴──────────┐
                    │   Reverse Proxy     │
                    │  (Nginx / Caddy)    │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
     ┌──────▼──────┐    ┌─────▼──────┐    ┌─────▼──────┐
     │ Backoffice  │    │    API     │    │    POS     │
     │   :3002     │    │   :3001    │    │   :5173    │
     └─────────────┘    └────────────┘    └────────────┘
```

**Configuration:**

All services served under same domain → **No CORS needed**

**Nginx Example:**
```nginx
server {
    listen 80;
    server_name example.com;

    # API
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backoffice
    location /backoffice/ {
        proxy_pass http://localhost:3002/;
        proxy_set_header Host $host;
    }

    # POS
    location /pos/ {
        proxy_pass http://localhost:5173/;
        proxy_set_header Host $host;
    }

    # Root redirects to backoffice
    location / {
        return 301 /backoffice/;
    }
}
```

**Caddy Example:**
```caddy
example.com {
    handle /api/* {
        reverse_proxy localhost:3001
    }

    handle /backoffice/* {
        reverse_proxy localhost:3002
    }

    handle /pos/* {
        reverse_proxy localhost:5173
    }

    redir / /backoffice/
}
```

**Pros:**
- ✅ No CORS configuration needed
- ✅ Simpler security model
- ✅ Single SSL certificate
- ✅ Better performance (no preflight requests)

**Cons:**
- ❌ Requires reverse proxy setup
- ❌ May need URL path adjustments in frontends

---

### Strategy 2: Subdomains (CORS Required)

**Architecture:**
```
api.example.com      → API (:3001)
backoffice.example.com → Backoffice (:3002)
pos.example.com      → POS (:5173)
```

**CORS Configuration:**

Set in `.env`:
```bash
CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com
```

**DNS Configuration:**
```
api.example.com         A    192.0.2.1
backoffice.example.com  A    192.0.2.1
pos.example.com         A    192.0.2.1
```

**Nginx Example (per subdomain):**
```nginx
# api.example.com
server {
    listen 443 ssl;
    server_name api.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# backoffice.example.com
server {
    listen 443 ssl;
    server_name backoffice.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
    }
}

# pos.example.com
server {
    listen 443 ssl;
    server_name pos.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
    }
}
```

**Pros:**
- ✅ Clean subdomain separation
- ✅ Independent SSL certificates possible

**Cons:**
- ⚠️ Requires CORS configuration
- ⚠️ Preflight requests add latency
- ⚠️ More complex SSL setup (wildcard cert recommended)

---

### Strategy 3: Different Domains (CORS Required)

**Architecture:**
```
api.mycompany.com       → API
admin.mycompany.com     → Backoffice
pos.mycompany.com       → POS
```

**CORS Configuration:**

Set in `.env`:
```bash
CORS_ALLOWED_ORIGINS=https://admin.mycompany.com,https://pos.mycompany.com
```

**Same considerations as Strategy 2**, plus:
- ⚠️ Cookies may not work across different domains
- ⚠️ Consider using JWT tokens in Authorization header instead

---

### Strategy 4: CDN + API (CORS Required)

**Architecture:**
```
cdn.example.com/backoffice → Static files (Backoffice)
cdn.example.com/pos        → Static files (POS)
api.example.com            → API server
```

**CORS Configuration:**

Set in `.env`:
```bash
CORS_ALLOWED_ORIGINS=https://cdn.example.com
```

**Pros:**
- ✅ Frontend served from CDN (fast, global)
- ✅ API can scale independently

**Cons:**
- ⚠️ Requires build process for static files
- ⚠️ More complex deployment pipeline

---

## Environment Variable Configuration

### Development (Automatic)

No configuration needed. Middleware automatically allows:
- `http://localhost:3002` (Backoffice)
- `http://localhost:5173` (POS)
- `http://127.0.0.1:3002`
- `http://127.0.0.1:5173`

### Production (Manual)

Add to `.env`:
```bash
NODE_ENV=production
CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com
```

**Format:**
- Comma-separated list
- Full URLs including protocol (`https://`)
- No trailing slashes
- No spaces (or trim them)

**Examples:**

Single origin:
```bash
CORS_ALLOWED_ORIGINS=https://backoffice.example.com
```

Multiple origins:
```bash
CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com
```

With subdomains:
```bash
CORS_ALLOWED_ORIGINS=https://admin.mycompany.com,https://pos.mycompany.com,https://pos-mobile.mycompany.com
```

---

## Security Considerations

### ✅ DO

1. **Use HTTPS in production**
   ```bash
   CORS_ALLOWED_ORIGINS=https://backoffice.example.com  # ✅ HTTPS
   ```

2. **Specify exact origins** (no wildcards)
   ```bash
   CORS_ALLOWED_ORIGINS=https://backoffice.example.com  # ✅ Specific
   ```

3. **Keep the list minimal**
   - Only add origins that actually need API access
   - Remove old/unused origins

4. **Use environment-specific configs**
   - Staging: `https://backoffice-staging.example.com`
   - Production: `https://backoffice.example.com`

### ❌ DON'T

1. **Don't use HTTP in production**
   ```bash
   CORS_ALLOWED_ORIGINS=http://backoffice.example.com  # ❌ Insecure
   ```

2. **Don't use wildcards**
   ```bash
   CORS_ALLOWED_ORIGINS=*  # ❌ Not supported and insecure
   ```

3. **Don't include API origin**
   ```bash
   CORS_ALLOWED_ORIGINS=https://api.example.com,https://backoffice.example.com  # ❌ API doesn't need CORS to itself
   ```

4. **Don't use localhost in production**
   ```bash
   CORS_ALLOWED_ORIGINS=http://localhost:3002  # ❌ Won't work in production
   ```

---

## Testing CORS Configuration

### Test 1: Check Allowed Origin

```bash
curl -i -H "Origin: https://backoffice.example.com" https://api.example.com/api/health
```

**Expected:**
```
Access-Control-Allow-Origin: https://backoffice.example.com
Access-Control-Allow-Credentials: true
```

### Test 2: Check Preflight

```bash
curl -i -X OPTIONS \
  -H "Origin: https://backoffice.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  https://api.example.com/api/auth/login
```

**Expected:**
```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://backoffice.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Max-Age: 86400
```

### Test 3: Check Blocked Origin

```bash
curl -i -H "Origin: https://evil.com" https://api.example.com/api/health
```

**Expected:**
```
# No Access-Control-Allow-Origin header
```

---

## Troubleshooting

### Problem: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Causes:**
1. `CORS_ALLOWED_ORIGINS` not set in production
2. Origin not in allowed list
3. Typo in origin URL (protocol, subdomain, port)

**Solution:**
```bash
# Check current value
echo $CORS_ALLOWED_ORIGINS

# Set correct value
export CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com

# Restart API
npm run dev:restart  # or systemctl restart jurnapod-api
```

### Problem: "CORS policy: Response to preflight request doesn't pass"

**Causes:**
1. API not handling OPTIONS requests
2. Missing required headers

**Solution:**
- Middleware automatically handles OPTIONS
- Ensure middleware is loaded (check `apps/api/middleware.ts` exists)
- Check Next.js logs for errors

### Problem: Credentials not being sent

**Causes:**
1. Frontend not setting `credentials: 'include'`
2. CORS not allowing credentials

**Solution:**

Frontend (Fetch API):
```typescript
fetch('https://api.example.com/api/endpoint', {
  credentials: 'include',  // ✅ Required for cookies
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

Middleware already sets:
```typescript
Access-Control-Allow-Credentials: true  // ✅ Already configured
```

### Problem: Warning "CORS_ALLOWED_ORIGINS not set in production"

**Cause:**
Running in production without CORS config

**Solution:**

Either:

1. **Set environment variable:**
   ```bash
   export CORS_ALLOWED_ORIGINS=https://backoffice.example.com
   ```

2. **Use reverse proxy** (Strategy 1 - no CORS needed)

3. **Accept the warning** if using same-origin deployment

---

## Google SSO + Refresh Cookies (Cross-Origin)

If Backoffice/POS are on different origins than the API and you want refresh cookies:

- Set `AUTH_REFRESH_COOKIE_CROSS_SITE=true` so the refresh cookie uses `SameSite=None; Secure`.
- Ensure HTTPS is used (secure cookies do not work on plain HTTP).
- Use `credentials: "include"` on auth endpoints from the frontends.

Example production env:
```bash
AUTH_REFRESH_COOKIE_CROSS_SITE=true
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URIS=https://backoffice.example.com/auth/callback,https://pos.example.com/auth/callback
CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com
```

See `docs/auth/google-sso.md` for the full SSO and callback setup.

---

## Monitoring

### Metrics to Track

1. **Preflight request rate**
   - High rate = potential optimization opportunity
   - Consider increasing `Access-Control-Max-Age` (currently 24h)

2. **Failed CORS requests**
   - Check for blocked origins
   - May indicate configuration issue or attack

3. **CORS header size**
   - Long origin lists increase header size
   - Keep list minimal

### Logging

Add to API monitoring:
```typescript
// Example logging middleware
if (!allowedOrigins.includes(origin)) {
  console.warn('Blocked CORS request', { origin, path: request.url });
}
```

---

## Migration Guide

### From Development to Production

1. **Choose deployment strategy** (see above)

2. **If using reverse proxy (Strategy 1):**
   - No CORS configuration needed
   - Skip to reverse proxy setup

3. **If using CORS (Strategies 2-4):**
   
   a. Set environment variable:
   ```bash
   # In production .env
   NODE_ENV=production
   CORS_ALLOWED_ORIGINS=https://backoffice.yourdomain.com,https://pos.yourdomain.com
   ```

   b. Test configuration:
   ```bash
   # From production server
   curl -i -H "Origin: https://backoffice.yourdomain.com" http://localhost:3001/api/health
   ```

   c. Deploy and verify:
   - Open browser console
   - Navigate to backoffice
   - Check for CORS errors
   - Test login and API calls

4. **Update frontend API URLs:**
   
   In Backoffice and POS environment configs:
   ```bash
   # Development
   VITE_API_URL=http://localhost:3001

   # Production
   VITE_API_URL=https://api.yourdomain.com
   # OR if using reverse proxy:
   VITE_API_URL=/api
   ```

---

## Best Practices Summary

1. ✅ **Prefer reverse proxy** (Strategy 1) - no CORS needed
2. ✅ **Use HTTPS** in production
3. ✅ **Minimal origin list** - only what's needed
4. ✅ **Test in staging** before production
5. ✅ **Monitor CORS errors** in logs
6. ✅ **Document your chosen strategy** for the team
7. ✅ **Review quarterly** - remove old origins

---

## References

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [OWASP: CORS Security](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Origin_Resource_Sharing_Cheat_Sheet.html)

---

**Last Updated:** 2026-02-23  
**Applies to:** Jurnapod v0.1.0+
