# Google SSO + Cross-Origin Refresh Cookies

This guide explains how to enable Google SSO for Backoffice and POS, and how to use refresh cookies when the frontends are hosted on different origins from the API.

## Overview

- Backoffice and POS redirect to Google, then exchange the `code` with the API.
- The API returns an access token and sets a refresh cookie.
- Backoffice/POS store the access token and call `/api/me` to bootstrap session.
- POS requires login before rendering the POS UI.

## Required environment variables (API)

```
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URIS=https://backoffice.example.com/auth/callback,https://pos.example.com/auth/callback

# Cross-origin refresh cookie
AUTH_REFRESH_COOKIE_CROSS_SITE=true

# CORS allowlist (if frontends are on different origins)
CORS_ALLOWED_ORIGINS=https://backoffice.example.com,https://pos.example.com
```

Notes:
- `GOOGLE_OAUTH_REDIRECT_URIS` must include the exact callback URLs used by the frontends.
- `AUTH_REFRESH_COOKIE_CROSS_SITE=true` switches the refresh cookie to `SameSite=None; Secure`.
- Cross-origin cookies require HTTPS.

## Required environment variables (Backoffice/POS)

```
VITE_GOOGLE_OAUTH_CLIENT_ID=...
VITE_API_BASE_URL=https://api.example.com
```

## Callback flow

1) Frontend redirects to Google OAuth with:
   - `redirect_uri` = `https://<frontend-origin>/auth/callback`
   - `response_type=code`
   - `scope=openid email profile`
   - `state=<nonce>`

2) Google redirects back to `/auth/callback` with `code` and `state`.

3) Frontend calls API:

```
POST /api/auth/google
{
  "companyCode": "JP",
  "code": "...",
  "redirect_uri": "https://<frontend-origin>/auth/callback"
}
```

4) API returns access token and sets refresh cookie.

5) Frontend stores access token and calls `/api/me` to load user + outlets.

## Cross-origin refresh cookie behavior

When `AUTH_REFRESH_COOKIE_CROSS_SITE=true`:
- Refresh cookie is `SameSite=None; Secure`.
- Frontend requests to auth endpoints must use `credentials: "include"`.

Auth endpoints that use cookies:
- `POST /api/auth/login`
- `POST /api/auth/google`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

## POS login gate

The POS UI is locked until a valid session is established:
- If no access token exists, POS shows the login screen.
- If the token is invalid, POS clears it and returns to login.
- Once authenticated, POS loads outlets and unlocks the UI.

## Troubleshooting

- 401 after Google login: check `companyCode` and ensure the user exists.
- Cookie not set: verify `AUTH_REFRESH_COOKIE_CROSS_SITE=true` and HTTPS.
- CORS errors: ensure `CORS_ALLOWED_ORIGINS` includes the exact frontend origins.
