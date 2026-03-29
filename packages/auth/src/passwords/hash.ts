/**
 * Password hashing using bcrypt and Argon2id
 */

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import type { AuthConfig } from "../types.js";

const ARGON2ID_PREFIX = "$argon2id$";
const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"];

export class PasswordHasher {
  constructor(private config: AuthConfig) {}

  private isBcryptHash(value: string): boolean {
    return BCRYPT_PREFIXES.some((prefix) => value.startsWith(prefix));
  }

  private isArgon2IdHash(value: string): boolean {
    return value.startsWith(ARGON2ID_PREFIX);
  }

  async hash(plain: string): Promise<string> {
    if (this.config.password.defaultAlgorithm === "bcrypt") {
      return bcrypt.hash(plain, this.config.password.bcryptRounds);
    }

    return argon2Hash(plain, {
      algorithm: 2, // Argon2id
      memoryCost: this.config.password.argon2MemoryKb,
      timeCost: this.config.password.argon2TimeCost,
      parallelism: this.config.password.argon2Parallelism
    });
  }

  async verify(plain: string, storedHash: string): Promise<boolean> {
    try {
      if (this.isBcryptHash(storedHash)) {
        return bcrypt.compare(plain, storedHash);
      }

      if (this.isArgon2IdHash(storedHash)) {
        return argon2Verify(storedHash, plain);
      }
    } catch {
      return false;
    }

    return false;
  }

  needsRehash(storedHash: string): boolean {
    if (this.config.password.defaultAlgorithm === "bcrypt") {
      return !this.isBcryptHash(storedHash);
    }

    return !this.isArgon2IdHash(storedHash);
  }
}
