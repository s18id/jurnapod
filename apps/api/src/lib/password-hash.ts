// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import type { PasswordHashAlgorithm } from "./env";

const ARGON2ID_PREFIX = "$argon2id$";
const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"];

export type PasswordHashPolicy = {
  defaultAlgorithm: PasswordHashAlgorithm;
  bcryptRounds: number;
  argon2MemoryKb: number;
  argon2TimeCost: number;
  argon2Parallelism: number;
};

function isBcryptHash(value: string): boolean {
  return BCRYPT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isArgon2IdHash(value: string): boolean {
  return value.startsWith(ARGON2ID_PREFIX);
}

export async function hashPassword(
  plain: string,
  policy: PasswordHashPolicy
): Promise<string> {
  if (policy.defaultAlgorithm === "bcrypt") {
    return bcrypt.hash(plain, policy.bcryptRounds);
  }

  return argon2Hash(plain, {
    algorithm: 2,
    memoryCost: policy.argon2MemoryKb,
    timeCost: policy.argon2TimeCost,
    parallelism: policy.argon2Parallelism
  });
}

export async function verifyPassword(
  plain: string,
  storedHash: string
): Promise<boolean> {
  try {
    if (isBcryptHash(storedHash)) {
      return bcrypt.compare(plain, storedHash);
    }

    if (isArgon2IdHash(storedHash)) {
      return argon2Verify(storedHash, plain);
    }
  } catch {
    return false;
  }

  return false;
}

export function needsRehash(storedHash: string, policy: PasswordHashPolicy): boolean {
  if (policy.defaultAlgorithm === "bcrypt") {
    return !isBcryptHash(storedHash);
  }

  return !isArgon2IdHash(storedHash);
}
