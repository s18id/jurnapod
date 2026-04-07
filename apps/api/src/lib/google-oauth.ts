// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { authClient } from "./auth-client.js";

function requireGoogleOAuthProvider() {
  if (!authClient.oauth?.google) {
    throw new Error("Google OAuth is not configured");
  }
  return authClient.oauth.google;
}

export type GoogleOAuthProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
};

export type GoogleOAuthTokenResult = {
  idToken: string;
  accessToken: string | null;
  expiresInSeconds: number | null;
};

export type GoogleUserLookupResult = {
  userId: number;
  companyId: number;
  email: string;
};

export type GoogleOAuthLinkResult =
  | { success: true; linked: boolean }
  | { success: false; reason: "linked_to_another_user" };

export function assertGoogleRedirectUriAllowed(redirectUri: string): void {
  const google = requireGoogleOAuthProvider();
  google.assertRedirectUriAllowed(redirectUri);
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<GoogleOAuthTokenResult> {
  const google = requireGoogleOAuthProvider();
  return google.exchangeCode(code, redirectUri);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleOAuthProfile> {
  const google = requireGoogleOAuthProvider();
  return google.verifyIdToken(idToken);
}

export async function findGoogleLoginUser(
  companyCode: string,
  email: string
): Promise<GoogleUserLookupResult | null> {
  const google = requireGoogleOAuthProvider();
  return google.findUser(companyCode, email);
}

export async function linkGoogleAccount(params: {
  companyId: number;
  userId: number;
  providerUserId: string;
  emailSnapshot: string;
}): Promise<GoogleOAuthLinkResult> {
  const google = requireGoogleOAuthProvider();
  return google.linkAccount(params);
}
