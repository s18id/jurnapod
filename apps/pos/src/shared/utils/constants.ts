// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Application-wide constants and configuration.
 */

export const POLL_INTERVAL_MS = 1500;
export const CASHIER_USER_ID = 1;

export const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const OAUTH_STATE_KEY = "jurnapod.pos.oauth.state";
export const OAUTH_COMPANY_KEY = "jurnapod.pos.oauth.company";

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

export const MIN_TOUCH_TARGET = 44; // px
export const SEARCH_DEBOUNCE_MS = 300;

export const API_CONFIG = {
  get baseUrl(): string {
    const runtimeConfig = globalThis as { API_BASE_URL?: string };
    const runtimeBaseUrl = runtimeConfig.API_BASE_URL?.trim();
    const envBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
    return runtimeBaseUrl || envBaseUrl || window.location.origin;
  },
  
  get googleClientId(): string {
    return (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim() ?? "";
  }
};

export function buildGoogleAuthUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const authUrl = new URL(GOOGLE_OAUTH_URL);
  authUrl.searchParams.set("client_id", params.clientId);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", params.state);
  return authUrl.toString();
}
