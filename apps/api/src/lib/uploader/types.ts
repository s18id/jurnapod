// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generic file uploader — shared types
 *
 * This module defines the core interfaces used across the uploader system.
 * Entity-specific adapters (e.g., item-image-adapter) extend these types.
 */

// =============================================================================
// Entity Types
// =============================================================================

export type EntityType = 'item_image' | 'static_page' | 'export_file';

// =============================================================================
// Storage Provider Interface
// =============================================================================

/**
 * Storage provider interface — runtime-agnostic (LocalStorage now, S3 later)
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

// =============================================================================
// Storage Configuration
// =============================================================================

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

// =============================================================================
// Image Processing
// =============================================================================

export interface ResizeSize {
  /** Size name, e.g. 'thumbnail', 'large', 'medium' */
  name: string;
  width: number;
  height: number;
  /** Quality 1-100 */
  quality: number;
}

export interface ResizeConfig {
  sizes: ResizeSize[];
  format?: 'jpeg' | 'png' | 'webp';
}

// =============================================================================
// Upload Request / Result
// =============================================================================

export interface UploadOptions {
  /** Max file size in bytes. Default: 5MB */
  maxSizeBytes?: number;
  /** Allowed MIME types. Default: image types */
  allowedMimeTypes?: string[];
  /** Optional resize pipeline */
  resize?: ResizeConfig;
  /** Entity-specific extension (e.g., variant_id for item_images) */
  [key: string]: unknown;
}

export interface UploadRequest {
  companyId: number;
  userId: number;
  entityType: EntityType | string;
  entityId: number;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  options?: UploadOptions;
}

export interface UploadMetadata {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface UploadResult {
  /** size name → URL */
  urls: Record<string, string>;
  metadata: UploadMetadata;
}

// =============================================================================
// Delete Request
// =============================================================================

export interface DeleteRequest {
  companyId: number;
  fileKeys: string[];
}

// =============================================================================
// Validation Result
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// =============================================================================
// Processed Image
// =============================================================================

export interface ProcessedImage {
  buffers: Record<string, Buffer>;
  width: number;
  height: number;
  mimeType: string;
}
