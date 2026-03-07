// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useRef, useCallback, type TouchEvent } from "react";

/**
 * Swipe direction types
 */
export type SwipeDirection = "left" | "right" | "up" | "down";

/**
 * Swipe configuration
 */
export interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Minimum distance for swipe to trigger (px)
  preventDefaultTouchmoveEvent?: boolean;
}

/**
 * Touch coordinates
 */
interface TouchPosition {
  x: number;
  y: number;
  time: number;
}

/**
 * Hook for detecting swipe gestures on mobile devices.
 * Returns touch event handlers to attach to elements.
 */
export function useSwipe(config: SwipeConfig) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    preventDefaultTouchmoveEvent = false,
  } = config;

  const touchStart = useRef<TouchPosition | null>(null);
  const touchEnd = useRef<TouchPosition | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    touchEnd.current = null;
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (preventDefaultTouchmoveEvent) {
        e.preventDefault();
      }

      const touch = e.touches[0];
      touchEnd.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    [preventDefaultTouchmoveEvent]
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchEnd.current) {
      return;
    }

    const deltaX = touchEnd.current.x - touchStart.current.x;
    const deltaY = touchEnd.current.y - touchStart.current.y;
    const deltaTime = touchEnd.current.time - touchStart.current.time;

    // Calculate velocities (px/ms)
    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;

    // Determine if horizontal or vertical swipe
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    // Check if swipe meets threshold and velocity requirements
    if (isHorizontalSwipe) {
      if (Math.abs(deltaX) > threshold && velocityX > 0.3) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
      }
    } else {
      if (Math.abs(deltaY) > threshold && velocityY > 0.3) {
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown();
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp();
        }
      }
    }

    // Reset
    touchStart.current = null;
    touchEnd.current = null;
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

/**
 * Hook for swipe-to-delete functionality.
 * Provides handlers and swipe progress for visual feedback.
 */
export interface SwipeToDeleteConfig {
  onDelete: () => void;
  threshold?: number;
}

export function useSwipeToDelete({ onDelete, threshold = 100 }: SwipeToDeleteConfig) {
  const touchStart = useRef<TouchPosition | null>(null);
  const currentOffset = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStart.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;

    // Only handle horizontal swipe left
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0) {
      e.preventDefault();
      currentOffset.current = deltaX;

      // Update element transform if needed
      const target = e.currentTarget as HTMLElement;
      if (target) {
        target.style.transform = `translateX(${Math.max(deltaX, -threshold)}px)`;
      }
    }
  }, [threshold]);

  const handleTouchEnd = useCallback(() => {
    const target = document.activeElement as HTMLElement;

    if (Math.abs(currentOffset.current) >= threshold) {
      // Trigger delete
      onDelete();
    } else {
      // Reset position
      if (target) {
        target.style.transform = "translateX(0)";
      }
    }

    touchStart.current = null;
    currentOffset.current = 0;
  }, [onDelete, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
