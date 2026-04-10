// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generic file storage — local filesystem provider
 *
 * Moved and refactored from lib/image-storage.ts.
 * S3 provider remains a placeholder (not yet implemented).
 */

import { promises as fs } from "fs";
import path from "path";
import type { StorageProvider, StorageConfig } from "./types.js";

// =============================================================================
// LocalStorageProvider
// =============================================================================

/**
 * Local filesystem storage provider.
 * Stores files on disk at {basePath}/{key} and serves URLs at {baseUrl}/{key}.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(config: { basePath: string; baseUrl: string }) {
    this.basePath = config.basePath;
    this.baseUrl = config.baseUrl;
  }

  async store(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const fullPath = path.join(this.basePath, key);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return this.getUrl(key);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // File doesn't exist — that's fine
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// S3 Storage Provider (Placeholder)
// =============================================================================

/**
 * S3-compatible storage provider.
 * Placeholder — not yet implemented.
 */
export class S3StorageProvider implements StorageProvider {
  constructor(config: StorageConfig["s3"]) {
    if (!config) {
      throw new Error("S3 configuration required");
    }
    // TODO: Initialize AWS S3 client here
    throw new Error(
      "S3 storage provider not yet implemented. Use LocalStorageProvider for now."
    );
  }

  async store(_key: string, _buffer: Buffer, _mimeType: string): Promise<string> {
    throw new Error("S3 storage not implemented");
  }

  async delete(_key: string): Promise<void> {
    throw new Error("S3 storage not implemented");
  }

  getUrl(_key: string): string {
    throw new Error("S3 storage not implemented");
  }

  async exists(_key: string): Promise<boolean> {
    throw new Error("S3 storage not implemented");
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create storage provider based on configuration.
 * Defaults to local filesystem.
 */
export function createStorageProvider(config?: StorageConfig): StorageProvider {
  const effectiveConfig =
    config || getDefaultLocalConfig();

  if (effectiveConfig.type === "s3") {
    return new S3StorageProvider(effectiveConfig.s3);
  }

  if (!effectiveConfig.local) {
    throw new Error("Local storage configuration required");
  }

  return new LocalStorageProvider(effectiveConfig.local);
}

function getDefaultLocalConfig(): StorageConfig {
  return {
    type: "local",
    local: {
      basePath: process.env.JP_UPLOAD_PATH || "./uploads",
      baseUrl: process.env.JP_UPLOAD_URL || "/uploads",
    },
  };
}

// =============================================================================
// File Key Generation
// =============================================================================

/**
 * Generate a unique file key for storage.
 *
 * Format: companies/{companyId}/{entityType}/{entityId}/{size}/{timestamp}-{random}-{sanitized-filename}.{ext}
 *
 * @param companyId  - Tenant ID
 * @param entityType - Entity type (e.g., 'item_image', 'static_page')
 * @param entityId  - Entity ID
 * @param fileName   - Original file name
 * @param size       - Size variant (e.g., 'original', 'thumbnail'). Default: 'original'
 */
export function generateFileKey(
  companyId: number,
  entityType: string,
  entityId: number,
  fileName: string,
  size: string = "original"
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const sanitized = baseName.replace(/[^a-zA-Z0-9]/g, "-");

  return `companies/${companyId}/${entityType}/${entityId}/${size}/${timestamp}-${random}-${sanitized}${extension}`;
}
