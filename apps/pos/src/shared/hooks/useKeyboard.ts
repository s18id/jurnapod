// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * Keyboard visibility state
 */
export interface KeyboardState {
  isVisible: boolean;
  height: number;
}

/**
 * Hook to track keyboard visibility on mobile devices.
 * Uses various heuristics since there's no standard API.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isVisible: false,
    height: 0,
  });

  useEffect(() => {
    // Check if Capacitor Keyboard plugin is available
    const capacitor = (window as any).Capacitor;
    if (capacitor?.Plugins?.Keyboard) {
      const { Keyboard } = capacitor.Plugins;

      const showListener = Keyboard.addListener(
        "keyboardWillShow",
        (info: any) => {
          setState({ isVisible: true, height: info.keyboardHeight });
        }
      );

      const hideListener = Keyboard.addListener("keyboardWillHide", () => {
        setState({ isVisible: false, height: 0 });
      });

      return () => {
        showListener.remove();
        hideListener.remove();
      };
    } else {
      // Fallback: detect keyboard via viewport resize on mobile
      const handleResize = () => {
        const viewport = window.visualViewport;
        if (viewport) {
          const keyboardHeight = window.innerHeight - viewport.height;
          setState({
            isVisible: keyboardHeight > 100, // Threshold to detect keyboard
            height: keyboardHeight,
          });
        }
      };

      window.visualViewport?.addEventListener("resize", handleResize);

      return () => {
        window.visualViewport?.removeEventListener("resize", handleResize);
      };
    }
  }, []);

  return state;
}

/**
 * Hook to manage auto-focus behavior
 */
export function useAutoFocus(enabled = true, delay = 100) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (enabled && ref.current) {
      const timeoutId = window.setTimeout(() => {
        ref.current?.focus();
      }, delay);

      return () => window.clearTimeout(timeoutId);
    }
  }, [enabled, delay]);

  return ref;
}

/**
 * Hook to dismiss keyboard when clicking outside input
 */
export function useDismissKeyboard() {
  const dismissKeyboard = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  return dismissKeyboard;
}

/**
 * Hook to handle Enter key submission
 */
export function useEnterKeySubmit(onSubmit: () => void) {
  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  return handleKeyPress;
}

/**
 * Hook to prevent keyboard from scrolling input out of view
 */
export function useScrollToInput() {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const handleFocus = useCallback(() => {
    if (inputRef.current) {
      // Wait for keyboard to appear
      setTimeout(() => {
        inputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 300);
    }
  }, []);

  return { inputRef, handleFocus };
}

/**
 * Input mode type for mobile keyboards
 */
export type InputModeType =
  | "none"
  | "text"
  | "tel"
  | "url"
  | "email"
  | "numeric"
  | "decimal"
  | "search";

/**
 * Get optimal input mode for different input types
 */
export function getInputMode(type: string): InputModeType {
  switch (type) {
    case "email":
      return "email";
    case "tel":
    case "phone":
      return "tel";
    case "url":
      return "url";
    case "number":
      return "numeric";
    case "decimal":
      return "decimal";
    case "search":
      return "search";
    default:
      return "text";
  }
}

/**
 * Keyboard configuration for payment input (optimized for cashier)
 */
export const PAYMENT_KEYBOARD_CONFIG = {
  inputMode: "numeric" as InputModeType,
  pattern: "[0-9]*",
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

/**
 * Keyboard configuration for search input
 */
export const SEARCH_KEYBOARD_CONFIG = {
  inputMode: "search" as InputModeType,
  autoComplete: "off",
  autoCorrect: "on",
  autoCapitalize: "words",
  spellCheck: true,
} as const;

/**
 * Keyboard configuration for email input
 */
export const EMAIL_KEYBOARD_CONFIG = {
  inputMode: "email" as InputModeType,
  autoComplete: "email",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;
