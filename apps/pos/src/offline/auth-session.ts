const ACCESS_TOKEN_STORAGE_KEY = "jurnapod_pos_access_token";

function readStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readAccessToken(): string | null {
  const storage = readStorage();
  if (!storage) {
    return null;
  }

  const token = storage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  return token && token.trim().length > 0 ? token : null;
}

export function writeAccessToken(token: string): void {
  const storage = readStorage();
  if (!storage) {
    return;
  }

  storage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

export function clearAccessToken(): void {
  const storage = readStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}
