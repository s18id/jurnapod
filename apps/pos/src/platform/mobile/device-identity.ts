// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Mobile Device Identity Adapter
 * 
 * Implements DeviceIdentityPort using Capacitor Device plugin for native device info.
 */

import type {
  DeviceIdentityPort,
  DeviceInfo,
  DeviceRegistration,
  DevicePlatform
} from "../../ports/device-identity-port.js";

const DEVICE_ID_KEY = "jurnapod.pos.device_id";
const DEVICE_NAME_KEY = "jurnapod.pos.device_name";
const DEVICE_REGISTRATION_KEY = "jurnapod.pos.device_registration";

export class MobileDeviceIdentityAdapter implements DeviceIdentityPort {
  private Device: any;

  constructor() {
    try {
      // Try to import Capacitor Device plugin
      this.Device = require('@capacitor/device').Device;
    } catch (err) {
      console.warn("Capacitor Device plugin not found, functionality will be limited");
      this.Device = null;
    }
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const device_id = await this.getDeviceId();
    const device_name = await this.getDeviceName();

    if (this.Device) {
      try {
        const info = await this.Device.getInfo();
        const deviceId = await this.Device.getId();

        return {
          device_id,
          device_name: device_name ?? undefined,
          platform: this.mapPlatform(info.platform),
          os_name: info.operatingSystem ?? info.platform,
          os_version: info.osVersion,
          app_version: info.appVersion,
          build_number: info.appBuild,
          manufacturer: info.manufacturer,
          model: info.model,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          is_virtual: info.isVirtual ?? false,
          has_camera: true, // Assume mobile devices have camera
          has_nfc: false, // Would need additional plugin to detect
          has_biometric: false // Would need additional plugin to detect
        };
      } catch (err) {
        console.error("Error getting device info from Capacitor:", err);
      }
    }

    // Fallback to web-style detection
    return {
      device_id,
      device_name: device_name ?? undefined,
      platform: this.detectPlatform(),
      os_name: this.getOSName(),
      os_version: undefined,
      app_version: import.meta.env.VITE_APP_VERSION as string | undefined,
      build_number: import.meta.env.VITE_BUILD_NUMBER as string | undefined,
      manufacturer: undefined,
      model: this.getBrowserInfo(),
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      is_virtual: false,
      has_camera: true,
      has_nfc: false,
      has_biometric: false
    };
  }

  async getDeviceId(): Promise<string> {
    // First check if we have a stored ID
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      return stored;
    }

    // Try to get native device UUID
    if (this.Device) {
      try {
        const deviceId = await this.Device.getId();
        if (deviceId && deviceId.identifier) {
          const nativeId = `mobile-${deviceId.identifier}`;
          localStorage.setItem(DEVICE_ID_KEY, nativeId);
          return nativeId;
        }
      } catch (err) {
        console.error("Error getting device ID from Capacitor:", err);
      }
    }

    // Fallback: generate a new ID
    const generatedId = await this.generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, generatedId);
    return generatedId;
  }

  async setDeviceName(name: string): Promise<void> {
    localStorage.setItem(DEVICE_NAME_KEY, name);
  }

  async getDeviceName(): Promise<string | null> {
    return localStorage.getItem(DEVICE_NAME_KEY);
  }

  async isRegistered(): Promise<boolean> {
    const registration = localStorage.getItem(DEVICE_REGISTRATION_KEY);
    return registration !== null;
  }

  async registerDevice(input: {
    device_name?: string;
    outlet_id?: number;
  }): Promise<DeviceRegistration> {
    const device_id = await this.getDeviceId();
    const device_name = input.device_name ?? (await this.getDeviceName()) ?? "Mobile Device";

    if (input.device_name) {
      await this.setDeviceName(input.device_name);
    }

    const registration: DeviceRegistration = {
      device_id,
      device_name,
      registered_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      outlet_id: input.outlet_id,
      is_active: true
    };

    localStorage.setItem(DEVICE_REGISTRATION_KEY, JSON.stringify(registration));
    return registration;
  }

  /**
   * Generate a device ID based on browser fingerprint.
   */
  private async generateDeviceId(): Promise<string> {
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      window.screen.width,
      window.screen.height,
      window.screen.colorDepth,
      new Date().getTimezoneOffset()
    ].join("|");

    const hash = await this.simpleHash(fingerprint);
    const random = crypto.randomUUID();

    return `mobile-${hash.substring(0, 8)}-${random.substring(0, 8)}`;
  }

  /**
   * Simple hash function for fingerprinting.
   */
  private async simpleHash(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Map Capacitor platform to DevicePlatform.
   */
  private mapPlatform(platform: string): DevicePlatform {
    switch (platform.toLowerCase()) {
      case "android":
        return "android";
      case "ios":
        return "ios";
      case "web":
        return "web";
      default:
        return "web";
    }
  }

  /**
   * Detect platform from user agent as fallback.
   */
  private detectPlatform(): DevicePlatform {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
    return "web";
  }

  /**
   * Detect OS name from user agent.
   */
  private getOSName(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    if (ua.includes("Win")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    return "Unknown";
  }

  /**
   * Get browser info from user agent.
   */
  private getBrowserInfo(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return "Unknown Browser";
  }
}

export function createMobileDeviceIdentityAdapter(): DeviceIdentityPort {
  return new MobileDeviceIdentityAdapter();
}
