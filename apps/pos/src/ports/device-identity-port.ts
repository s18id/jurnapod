// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * DeviceIdentityPort
 * 
 * Platform-agnostic interface for device identification and metadata.
 * Implementations may use browser fingerprinting, native device APIs,
 * or custom device registration.
 * 
 * This abstraction ensures business logic does not directly depend on
 * browser APIs, Capacitor device info, or platform-specific identifiers.
 */

export type DevicePlatform = "web" | "android" | "ios" | "desktop";

export interface DeviceInfo {
  // Device identification
  device_id: string; // Stable, unique identifier
  device_name?: string; // User-friendly name
  
  // Platform info
  platform: DevicePlatform;
  os_name?: string; // e.g., "Android", "iOS", "Windows", "macOS"
  os_version?: string;
  
  // App info
  app_version?: string;
  build_number?: string;
  
  // Hardware info
  manufacturer?: string;
  model?: string;
  screen_width?: number;
  screen_height?: number;
  
  // Capabilities
  is_virtual?: boolean; // True if emulator/simulator
  has_camera?: boolean;
  has_nfc?: boolean;
  has_biometric?: boolean;
}

export interface DeviceRegistration {
  device_id: string;
  device_name: string;
  registered_at: string;
  last_seen_at: string;
  outlet_id?: number;
  is_active: boolean;
}

/**
 * DeviceIdentityPort
 * 
 * Provides device identification and metadata across platforms.
 */
export interface DeviceIdentityPort {
  /**
   * Get device information.
   * Should be stable across app restarts.
   */
  getDeviceInfo(): Promise<DeviceInfo>;

  /**
   * Get or generate a stable device ID.
   * This ID should persist across app restarts.
   */
  getDeviceId(): Promise<string>;

  /**
   * Set a user-friendly device name.
   */
  setDeviceName(name: string): Promise<void>;

  /**
   * Get the device name.
   */
  getDeviceName(): Promise<string | null>;

  /**
   * Check if this device is registered with the server.
   */
  isRegistered(): Promise<boolean>;

  /**
   * Register this device with the server.
   */
  registerDevice(input: {
    device_name?: string;
    outlet_id?: number;
  }): Promise<DeviceRegistration>;
}
