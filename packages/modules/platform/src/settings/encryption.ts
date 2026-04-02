// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "EncryptionError";
  }
}

/**
 * Encrypted payload structure
 */
export type EncryptedPayload = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
};

/**
 * Validate encryption key format (must be 64 hex chars = 32 bytes)
 */
function validateEncryptionKey(key: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new EncryptionError(
      "Encryption key must be 64 hexadecimal characters (32 bytes). Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 */
export function encrypt(plaintext: string, encryptionKey: string): EncryptedPayload {
  try {
    const keyBuffer = validateEncryptionKey(encryptionKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64")
    };
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown encryption error";
    throw new EncryptionError(`Failed to encrypt: ${message}`, error);
  }
}

/**
 * Decrypt an encrypted payload using AES-256-GCM
 */
export function decrypt(payload: EncryptedPayload, encryptionKey: string): string {
  try {
    const keyBuffer = validateEncryptionKey(encryptionKey);
    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);

    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(payload.ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");

    return plaintext;
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown decryption error";
    throw new EncryptionError(`Failed to decrypt: ${message}`, error);
  }
}

/**
 * Check if a string looks like an encrypted payload (JSON with required fields)
 */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.ciphertext === "string" &&
    typeof obj.iv === "string" &&
    typeof obj.authTag === "string"
  );
}
