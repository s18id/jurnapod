// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { promises as fs } from "fs";
import path from "path";

/**
 * Storage provider interface for image storage abstraction
 * Supports local filesystem and S3-compatible storage
 */
export interface StorageProvider {
  /**
   * Store a file and return its URL
   */
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  
  /**
   * Delete a file by key
   */
  delete(key: string): Promise<void>;
  
  /**
   * Get the public URL for a file
   */
  getUrl(key: string): string;
  
  /**
   * Check if a file exists
   */
  exists(key: string): Promise<boolean>;
}

/**
 * Configuration for storage providers
 */
export interface StorageConfig {
  type: 'local' | 's3';
  local?: {
    basePath: string;
    baseUrl: string;
  };
  s3?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
  };
}

/**
 * Local filesystem storage provider
 * Used for development and testing
 */
export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private baseUrl: string;

  constructor(config: { basePath: string; baseUrl: string }) {
    this.basePath = config.basePath;
    this.baseUrl = config.baseUrl;
  }

  async store(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const fullPath = path.join(this.basePath, key);
    const dir = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, buffer);
    
    return this.getUrl(key);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // File doesn't exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
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

/**
 * S3-compatible storage provider
 * Used for production (placeholder - requires AWS SDK)
 */
export class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private baseUrl: string;

  constructor(config: StorageConfig['s3']) {
    if (!config) {
      throw new Error("S3 configuration required");
    }
    this.bucket = config.bucket;
    this.baseUrl = config.endpoint 
      ? `${config.endpoint}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
    
    // TODO: Initialize AWS S3 client here
    // This is a placeholder for future S3 implementation
    throw new Error("S3 storage provider not yet implemented. Use LocalStorageProvider for now.");
  }

  async store(_key: string, _buffer: Buffer, _mimeType: string): Promise<string> {
    // TODO: Implement S3 upload
    throw new Error("S3 storage not implemented");
  }

  async delete(_key: string): Promise<void> {
    // TODO: Implement S3 delete
    throw new Error("S3 storage not implemented");
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async exists(_key: string): Promise<boolean> {
    // TODO: Implement S3 head request
    throw new Error("S3 storage not implemented");
  }
}

/**
 * Create storage provider based on configuration
 * Defaults to local filesystem for development
 */
export function createStorageProvider(config?: StorageConfig): StorageProvider {
  const effectiveConfig = config || {
    type: 'local' as const,
    local: {
      basePath: process.env.UPLOAD_PATH || './uploads',
      baseUrl: process.env.UPLOAD_URL || '/uploads'
    }
  };

  if (effectiveConfig.type === 's3') {
    return new S3StorageProvider(effectiveConfig.s3);
  }

  if (!effectiveConfig.local) {
    throw new Error("Local storage configuration required");
  }

  return new LocalStorageProvider(effectiveConfig.local);
}

/**
 * Generate a unique file key for storage
 */
export function generateFileKey(
  companyId: number,
  itemId: number,
  fileName: string,
  size: 'original' | 'large' | 'medium' | 'thumbnail'
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const sanitized = baseName.replace(/[^a-zA-Z0-9]/g, '-');
  
  return `companies/${companyId}/items/${itemId}/${size}/${timestamp}-${random}-${sanitized}${extension}`;
}
