// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.signal18.jurnapod.pos',
  appName: 'Jurnapod POS',
  webDir: 'dist',
  server: {
    // Allow loading from any URL during development
    // In production, this will be ignored as app serves from local files
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    // Splash screen configuration
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      iosSplashResourceName: "Default",
      showSpinner: false,
    },
    // Network plugin for connectivity detection
    Network: {
      // No specific configuration needed
    },
    // App plugin for lifecycle events
    App: {
      // No specific configuration needed
    },
    // Device plugin for identity
    Device: {
      // No specific configuration needed
    },
  },
};

export default config;
