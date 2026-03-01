// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { apiRequest } from "./api-client";

const ACCESS_TOKEN_KEY = "jurnapod.backoffice.access_token";

export type RoleCode = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CASHIER" | "ACCOUNTANT";

export type UserOutlet = {
  id: number;
  code: string;
  name: string;
};

export type SessionUser = {
  id: number;
  company_id: number;
  email: string;
  roles: RoleCode[];
  outlets: UserOutlet[];
};

type LoginResponse = {
  ok: true;
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

type MeResponse = {
  ok: true;
  user: SessionUser;
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
  return globalThis.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function storeAccessToken(token: string): void {
  globalThis.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  globalThis.localStorage.removeItem(ACCESS_TOKEN_KEY);
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

  storeAccessToken(auth.access_token);
  const user = await fetchCurrentUser(auth.access_token);
  return {
    token: auth.access_token,
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

  storeAccessToken(auth.access_token);
  const user = await fetchCurrentUser(auth.access_token);
  return {
    token: auth.access_token,
    user
  };
}

export async function fetchCurrentUser(accessToken: string): Promise<SessionUser> {
  const response = await apiRequest<MeResponse>("/users/me", {}, accessToken);
  return response.user;
}
