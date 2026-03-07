// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Device Identity Adapter
 * 
 * Implements DeviceIdentityPort using browser fingerprinting and localStorage.
 * Generates a stable device ID that persists across browser sessions.
 */

import type {
  DeviceIdentityPort,
  DeviceInfo,
  DeviceRegistration
} from "../../ports/device-identity-port.js";

const DEVICE_ID_KEY = "jurnapod.pos.device_id";
const DEVICE_NAME_KEY = "jurnapod.pos.device_name";
const DEVICE_REGISTRATION_KEY = "jurnapod.pos.device_registration";

export class WebDeviceIdentityAdapter implements DeviceIdentityPort {
  async getDeviceInfo(): Promise<DeviceInfo> {
    const device_id = await this.getDeviceId();
    const device_name = await this.getDeviceName();

    return {
      device_id,
      device_name: device_name ?? undefined,
      platform: "web",
      os_name: this.getOSName(),
      os_version: undefined,
      app_version: import.meta.env.VITE_APP_VERSION as string | undefined,
      build_number: import.meta.env.VITE_BUILD_NUMBER as string | undefined,
      manufacturer: undefined,
      model: this.getBrowserInfo(),
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      is_virtual: false,
      has_camera: await this.hasCamera(),
      has_nfc: this.hasNFC(),
      has_biometric: this.hasBiometric()
    };
  }

  async getDeviceId(): Promise<string> {
    // Try to get existing device ID from localStorage
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      return stored;
    }

    // Generate a new device ID based on browser fingerprint
    const deviceId = await this.generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
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
    const device_name = input.device_name ?? (await this.getDeviceName()) ?? "Web Device";

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
   * Uses a combination of user agent, screen properties, and random UUID.
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

    // Hash the fingerprint
    const hash = await this.simpleHash(fingerprint);

    // Add a random component to ensure uniqueness
    const random = crypto.randomUUID();

    return `web-${hash.substring(0, 8)}-${random.substring(0, 8)}`;
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
   * Detect OS name from user agent.
   */
  private getOSName(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
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

  /**
   * Check if camera is available.
   */
  private async hasCamera(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return false;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === "videoinput");
    } catch {
      return false;
    }
  }

  /**
   * Check if NFC is available.
   */
  private hasNFC(): boolean {
    return "NDEFReader" in window;
  }

  /**
   * Check if biometric authentication is available.
   */
  private hasBiometric(): boolean {
    return "credentials" in navigator && "PublicKeyCredential" in window;
  }
}

export function createWebDeviceIdentityAdapter(): DeviceIdentityPort {
  return new WebDeviceIdentityAdapter();
}
