// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { LoginThrottleKey } from "@jurnapod/auth";
import { authClient } from "./auth-client.js";

export type { LoginThrottleKey };

export function buildLoginThrottleKeys(params: {
  companyCode: string;
  email: string;
  ipAddress: string | null;
}): LoginThrottleKey[] {
  return authClient.throttle.buildKeys(params);
}

export async function getLoginThrottleDelay(keys: LoginThrottleKey[]): Promise<number> {
  return authClient.throttle.getDelay(keys);
}

export async function recordLoginFailure(params: {
  keys: LoginThrottleKey[];
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  return authClient.throttle.recordFailure(params);
}

export async function recordLoginSuccess(keys: LoginThrottleKey[]): Promise<void> {
  return authClient.throttle.recordSuccess(keys);
}

export function delay(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
