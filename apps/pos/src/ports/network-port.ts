// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * NetworkPort
 * 
 * Platform-agnostic interface for network connectivity detection.
 * Implementations may use navigator.onLine, native connectivity APIs,
 * or other network detection mechanisms.
 * 
 * This abstraction ensures business logic does not directly depend on
 * browser APIs or platform-specific connectivity detection.
 */

export interface NetworkPort {
  /**
   * Check if the device is currently online.
   * Returns true if network connectivity is available, false otherwise.
   */
  isOnline(): boolean;

  /**
   * Register a callback to be notified when network status changes.
   * Returns a cleanup function to unregister the callback.
   */
  onStatusChange(callback: (online: boolean) => void): () => void;
}
