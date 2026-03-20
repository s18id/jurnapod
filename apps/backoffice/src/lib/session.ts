// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { apiRequest, getApiBaseUrl } from "./api-client";

// Memory-only token storage (no localStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryCompanyTimezone: string | null = null;

export type RoleCode =
  | "SUPER_ADMIN"
  | "OWNER"
  | "COMPANY_ADMIN"
  | "ADMIN"
  | "CASHIER"
  | "ACCOUNTANT";

export type UserOutlet = {
  id: number;
  code: string;
  name: string;
};

export type UserOutletRoleAssignment = {
  outlet_id: number;
  outlet_code: string;
  outlet_name: string;
  role_codes: RoleCode[];
};

export type SessionUser = {
  id: number;
  company_id: number;
  company_timezone?: string | null;
  email: string;
  roles: RoleCode[];
  global_roles: RoleCode[];
  outlet_role_assignments: UserOutletRoleAssignment[];
  outlets: UserOutlet[];
};

type LoginResponse = {
  success: true;
  data: {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
  };
};

type MeResponse = {
  success: true;
  data: SessionUser;
};

export type LoginInput = {
  companyCode: string;
  email: string;
  password: string;
};

export type GoogleLoginInput = {
  companyCode: string;
  code: string;
  redirectUri: string;
};

export function getStoredAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function storeAccessToken(token: string): void {
  inMemoryAccessToken = token;
}

export function clearAccessToken(): void {
  inMemoryAccessToken = null;
  inMemoryCompanyTimezone = null;
}

export function getStoredCompanyTimezone(): string | null {
  return inMemoryCompanyTimezone;
}

export function storeCompanyTimezone(timezone: string | null | undefined): void {
  inMemoryCompanyTimezone = timezone && timezone.trim() ? timezone : null;
}

export async function login(input: LoginInput): Promise<{ token: string; user: SessionUser }> {
  const auth = await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify({
      company_code: input.companyCode,
      email: input.email,
      password: input.password
    })
  });

  storeAccessToken(auth.data.access_token);
  const user = await fetchCurrentUser(auth.data.access_token);
  return {
    token: auth.data.access_token,
    user
  };
}

export async function loginWithGoogle(
  input: GoogleLoginInput
): Promise<{ token: string; user: SessionUser }> {
  const auth = await apiRequest<LoginResponse>("/auth/google", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify({
      companyCode: input.companyCode,
      code: input.code,
      redirect_uri: input.redirectUri
    })
  });

  storeAccessToken(auth.data.access_token);
  const user = await fetchCurrentUser(auth.data.access_token);
  return {
    token: auth.data.access_token,
    user
  };
}

export async function fetchCurrentUser(accessToken: string): Promise<SessionUser> {
  const response = await apiRequest<MeResponse>("/users/me", {}, accessToken);
  storeCompanyTimezone(response.data.company_timezone ?? null);
  return response.data;
}

export async function refreshSessionUser(accessToken: string): Promise<SessionUser> {
  return fetchCurrentUser(accessToken);
}

/**
 * Refresh access token using httpOnly refresh cookie
 * Returns new access token or null if refresh fails
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.success && data.data?.access_token) {
      const token = data.data.access_token;
      storeAccessToken(token);
      return token;
    }

    return null;
  } catch {
    return null;
  }
}
