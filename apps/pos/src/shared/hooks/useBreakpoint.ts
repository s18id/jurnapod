// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect } from "react";
import {
  getResponsiveConfig,
  type ResponsiveConfig,
  type DeviceType,
} from "../utils/responsive.js";

/**
 * Hook to track current breakpoint and device type.
 * Updates on window resize with debouncing.
 */
export function useBreakpoint(): ResponsiveConfig {
  const [config, setConfig] = useState<ResponsiveConfig>(() =>
    getResponsiveConfig()
  );

  useEffect(() => {
    let timeoutId: number | undefined;

    const handleResize = () => {
      // Debounce resize events
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        setConfig(getResponsiveConfig());
      }, 150);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return config;
}

/**
 * Hook to check if current viewport matches a specific device type
 */
export function useDeviceType(): DeviceType {
  const { deviceType } = useBreakpoint();
  return deviceType;
}

/**
 * Hook to check if current viewport is mobile
 */
export function useIsMobile(): boolean {
  const { isMobile } = useBreakpoint();
  return isMobile;
}

/**
 * Hook to check if current viewport is tablet
 */
export function useIsTablet(): boolean {
  const { isTablet } = useBreakpoint();
  return isTablet;
}

/**
 * Hook to check if current viewport is desktop
 */
export function useIsDesktop(): boolean {
  const { isDesktop } = useBreakpoint();
  return isDesktop;
}

/**
 * Hook to select responsive values based on current breakpoint
 */
export function useResponsiveValue<T>(config: {
  mobile: T;
  tablet?: T;
  desktop?: T;
}): T {
  const { deviceType } = useBreakpoint();

  if (deviceType === "mobile") {
    return config.mobile;
  }
  if (deviceType === "tablet") {
    return config.tablet ?? config.mobile;
  }
  return config.desktop ?? config.tablet ?? config.mobile;
}
