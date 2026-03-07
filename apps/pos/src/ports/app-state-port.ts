// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * App State Port
 * 
 * Abstracts application lifecycle events (active, inactive, background).
 * Implemented by web (visibilitychange) and mobile (Capacitor App plugin).
 */

export interface AppStatePort {
  /**
   * Register callback for when app becomes active/visible.
   * Returns unsubscribe function.
   */
  onActive(callback: () => void): () => void;

  /**
   * Register callback for when app becomes inactive/hidden.
   * Returns unsubscribe function.
   */
  onInactive(callback: () => void): () => void;

  /**
   * Register callback for when app moves to background.
   * Returns unsubscribe function.
   */
  onBackground(callback: () => void): () => void;
}
