// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Platform Detection Utilities
 * 
 * Utilities for detecting the current platform (web, mobile, Capacitor).
 * Used by bootstrap layer to choose appropriate platform adapters.
 */

/**
 * Check if running in a Capacitor context (native mobile app).
 * 
 * @returns true if Capacitor is available, false otherwise
 */
export function isCapacitor(): boolean {
  return !!(window as any).Capacitor;
}

/**
 * Check if running on a mobile device (by user agent or screen size).
 * 
 * @returns true if mobile device, false otherwise
 */
export function isMobile(): boolean {
  // Check for Capacitor first
  if (isCapacitor()) {
    return true;
  }

  // Check user agent for mobile keywords
  const ua = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  
  // Check screen size (mobile devices typically < 768px width)
  const isMobileScreen = window.matchMedia("(max-width: 768px)").matches;
  
  return isMobileUA || isMobileScreen;
}

/**
 * Check if running on a tablet device.
 * 
 * @returns true if tablet device, false otherwise
 */
export function isTablet(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isTabletUA = /ipad|android(?!.*mobile)/i.test(ua);
  
  // Check screen size (tablets typically 768px - 1024px)
  const isTabletScreen = window.matchMedia("(min-width: 768px) and (max-width: 1024px)").matches;
  
  return isTabletUA || isTabletScreen;
}

/**
 * Check if running on desktop/laptop.
 * 
 * @returns true if desktop, false otherwise
 */
export function isDesktop(): boolean {
  return !isMobile() && !isTablet();
}

/**
 * Get the current platform type.
 * 
 * @returns 'capacitor', 'mobile', 'tablet', or 'desktop'
 */
export function getPlatform(): 'capacitor' | 'mobile' | 'tablet' | 'desktop' {
  if (isCapacitor()) {
    return 'capacitor';
  }
  if (isMobile()) {
    return 'mobile';
  }
  if (isTablet()) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Get detailed platform information.
 */
export interface PlatformInfo {
  isCapacitor: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  platform: 'capacitor' | 'mobile' | 'tablet' | 'desktop';
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
}

export function getPlatformInfo(): PlatformInfo {
  return {
    isCapacitor: isCapacitor(),
    isMobile: isMobile(),
    isTablet: isTablet(),
    isDesktop: isDesktop(),
    platform: getPlatform(),
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height
  };
}
