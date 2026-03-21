// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createTheme, type MantineThemeOverride } from "@mantine/core";

export const THEME_STORAGE_KEY = "jurnapod.backoffice.theme";

export const THEME_VARIANTS = ["neutral", "cafe"] as const;

export type ThemeVariant = (typeof THEME_VARIANTS)[number];

export const THEME_OPTIONS = [
  { value: "neutral", label: "Neutral" },
  { value: "cafe", label: "Cafe" }
];

const forest = [
  "#f2f7f4",
  "#e3efe9",
  "#c7dfd2",
  "#a8cbb8",
  "#86b59b",
  "#6aa083",
  "#4f8b6b",
  "#3f7257",
  "#345c47",
  "#2d4c3c"
] as const;

const cafe = [
  "#faf6f1",
  "#f1e7da",
  "#e4ceb4",
  "#d6b68e",
  "#c99e6a",
  "#b8874f",
  "#9e6f3f",
  "#825a33",
  "#6a4a2b",
  "#5a3f25"
] as const;

// Accessible gray scale designed for WCAG AA contrast (4.5:1 on white)
// Used for dimmed text and secondary UI elements
const gray = [
  "#f9fafb", // 0 - lightest, for backgrounds
  "#f3f4f6", // 1 - subtle backgrounds
  "#e5e7eb", // 2 - borders, dividers
  "#d1d5db", // 3 - disabled states
  "#9ca3af", // 4 - placeholder text (meets 3:1 on white)
  "#6b7280", // 5 - dimmed text (meets 4.5:1 on white)
  "#4b5563", // 6 - secondary text
  "#374151", // 7 - emphasis text
  "#1f2937", // 8 - primary text
  "#111827"  // 9 - darkest, high emphasis
] as const;

const slate = [
  "#f6f7f8",
  "#eceef1",
  "#d7dce2",
  "#c2c9d3",
  "#aab3c0",
  "#929cad",
  "#778091",
  "#606877",
  "#4b515e",
  "#3d424d"
] as const;

const themeTokens: Record<ThemeVariant, { primaryColor: "forest" | "cafe"; background: string; backgroundAlt: string; surface: string; border: string; text: string; muted: string }> = {
  neutral: {
    primaryColor: "forest",
    background: "linear-gradient(160deg, #f5f2ea 0%, #edf2ee 100%)",
    backgroundAlt: "#f7f5f1",
    surface: "#ffffff",
    border: "#e1dad0",
    text: "#1f2a28",
    muted: "#58625f"
  },
  cafe: {
    primaryColor: "cafe",
    background: "linear-gradient(160deg, #f8f1e9 0%, #f1ebe1 100%)",
    backgroundAlt: "#fbf7f2",
    surface: "#ffffff",
    border: "#e4d7c8",
    text: "#2f241b",
    muted: "#6b5d50"
  }
};

export function getStoredThemeVariant(): ThemeVariant {
  if (typeof window === "undefined") {
    return "neutral";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && (THEME_VARIANTS as readonly string[]).includes(stored)) {
    return stored as ThemeVariant;
  }
  return "neutral";
}

export function setStoredThemeVariant(variant: ThemeVariant): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, variant);
}

export function buildMantineTheme(variant: ThemeVariant): MantineThemeOverride {
  const tokens = themeTokens[variant];
  
  // Accessible dimmed color array - gray-5 (#6b7280) at index 5 meets WCAG AA 4.5:1
  const accessibleDimmed = [
    "#f9fafb",
    "#f3f4f6",
    "#e5e7eb",
    "#d1d5db",
    "#9ca3af",
    "#6b7280", // Index 5 - used as "dimmed" color, meets 4.5:1 on white
    "#4b5563",
    "#374151",
    "#1f2937",
    "#111827"
  ] as const;
  
  return createTheme({
    primaryColor: tokens.primaryColor,
    colors: {
      forest,
      cafe,
      slate,
      gray,
      // Override dimmed with accessible gray-5 (#6b7280)
      dimmed: accessibleDimmed
    },
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    headings: {
      fontFamily: "'Newsreader', 'Georgia', serif",
      fontWeight: "600"
    },
    defaultRadius: "md",
    radius: {
      xs: "6px",
      sm: "8px",
      md: "12px",
      lg: "16px",
      xl: "24px"
    },
    shadows: {
      xs: "0 1px 2px rgba(30, 33, 40, 0.08)",
      sm: "0 4px 10px rgba(30, 33, 40, 0.1)",
      md: "0 12px 24px rgba(30, 33, 40, 0.12)",
      lg: "0 18px 40px rgba(30, 33, 40, 0.16)",
      xl: "0 24px 60px rgba(30, 33, 40, 0.18)"
    },
    components: {
      Button: {
        defaultProps: {
          radius: "md"
        }
      },
      Card: {
        defaultProps: {
          radius: "md",
          withBorder: true,
          shadow: "xs"
        }
      },
      Table: {
        defaultProps: {
          highlightOnHover: true,
          withTableBorder: false,
          withColumnBorders: false
        }
      },
      TextInput: {
        defaultProps: {
          radius: "md"
        }
      },
      Select: {
        defaultProps: {
          radius: "md"
        }
      }
    },
    other: {
      bodyBackground: tokens.background,
      bodyBackgroundAlt: tokens.backgroundAlt,
      surface: tokens.surface,
      border: tokens.border,
      text: tokens.text,
      muted: tokens.muted
    }
  });
}
